// POST /api/webhook — Stripe webhook handler
//
// On checkout.session.completed:
//   1. Verifies Stripe signature (rejects fakes)
//   2. Checks Redis for duplicate event ID (idempotency — safe across cold starts)
//   3. Retrieves calc data from Transacciones sheet using client_reference_id (UUID)
//   4. Sends admin notification
//   5. Updates Transacciones row with payment data (status → "paid")
//
// Note: PDF and customer email are sent by the browser via /api/send-report,
// not by this webhook, to keep Lambda memory usage low.

const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const redis   = require('./lib/redis');
const { getTransactionByUUID, completeTransaction } = require('./lib/sheets');
const { sendAdminNotification } = require('./lib/email');
const { captureError }          = require('./lib/sentry');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  chunk => chunks.push(chunk));
    req.on('end',   ()    => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // ── 1. Verify Stripe signature ─────────────────────────────────────────────
  const rawBody = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // Log failed verifications — these are potential attack probes
    console.error('Stripe signature verification failed:', err.message);
    captureError(err, { route: 'webhook', type: 'signature_failure' });
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;

  // ── 2. Durable idempotency via Redis (SET NX with 24h TTL) ────────────────
  // Prevents double-processing on Stripe retries, across all Lambda instances.
  const idempotencyKey = `idempotency:webhook:${event.id}`;
  try {
    const set = await redis.set(idempotencyKey, '1', { nx: true, ex: 86400 });
    if (set === null) {
      // Key already existed — this event was already processed
      console.log(`Webhook: event ${event.id} already processed — skipping`);
      return res.json({ received: true });
    }
  } catch (err) {
    // Redis unavailable: log and continue (process the event rather than drop it)
    console.error('Redis idempotency check failed (processing anyway):', err.message);
  }

  const customerEmail = session.customer_details?.email || session.customer_email;
  const monto         = ((session.amount_total || 0) / 100).toFixed(2);
  const moneda        = (session.currency || 'usd').toUpperCase();
  const fecha         = new Date().toISOString();
  const uuid          = session.client_reference_id;

  // ── 3. Retrieve calc data ─────────────────────────────────────────────────
  let calcData = null;
  if (uuid) {
    try { calcData = await getTransactionByUUID(uuid); }
    catch (err) {
      console.error('getTransactionByUUID failed:', err.message);
      captureError(err, { route: 'webhook', step: 'getTransactionByUUID' });
    }
  }

  // Fallback for payment-link flow (no UUID)
  if (!calcData) {
    let pais = 'mx', tier = 'basic';
    try {
      if (session.payment_link) {
        const pl = await stripe.paymentLinks.retrieve(session.payment_link);
        const redirectUrl = new URL(pl.after_completion?.redirect?.url || '');
        pais = redirectUrl.searchParams.get('pais') || 'mx';
        tier = redirectUrl.searchParams.get('unlocked') || 'basic';
      }
    } catch (e) { console.error('payment link fallback failed:', e.message); }
    calcData = { tier, country: pais, email: customerEmail, inputs: {}, result: {} };
  }

  const { tier = 'basic', country = 'mx', result = {} } = calcData;

  // ── 4. Admin notification + update Sheets row ─────────────────────────────
  const results = await Promise.allSettled([
    sendAdminNotification({ email: customerEmail, pais: country, tier, monto, moneda, sessionId: session.id }),
    uuid
      ? completeTransaction(uuid, { fecha, monto, moneda, sessionId: session.id, email: customerEmail, pais: country, tier, totalCalculado: result.total || '' })
      : Promise.resolve()
  ]);

  results.forEach((r, i) => {
    const labels = ['sendAdminNotification', 'completeTransaction'];
    if (r.status === 'rejected') {
      console.error(`${labels[i]} failed:`, r.reason?.message || r.reason);
      captureError(r.reason, { route: 'webhook', step: labels[i], country, tier });
    }
  });

  res.json({ received: true });
};
