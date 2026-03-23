// Stripe webhook handler
//
// On checkout.session.completed:
//   1. Retrieves calc data from Transacciones sheet using client_reference_id (UUID)
//   2. Generates PDF with pdfmake
//   3. Sends PDF as email attachment to customer (+ employer letter for premium)
//   4. Sends admin notification
//   5. Updates Transacciones row with payment data (status → "paid")

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getTransactionByUUID, completeTransaction } = require('./lib/sheets');
const { generatePDF }     = require('./lib/pdf');
const { sendCustomerEmail, sendAdminNotification } = require('./lib/email');

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

  // ── 1. Verify Stripe signature ───────────────────────────────────────────
  const rawBody = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session       = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  const monto         = ((session.amount_total || 0) / 100).toFixed(2);
  const moneda        = (session.currency || 'usd').toUpperCase();
  const fecha         = new Date().toISOString();
  const uuid          = session.client_reference_id;

  // ── 2. Retrieve calc data ────────────────────────────────────────────────
  let calcData = null;
  if (uuid) {
    try { calcData = await getTransactionByUUID(uuid); }
    catch (err) { console.error('getTransactionByUUID failed:', err.message); }
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

  // ── 3. Generate PDF ───────────────────────────────────────────────────────
  let pdfBuffer = null;
  try {
    pdfBuffer = await generatePDF(calcData);
  } catch (err) {
    console.error('generatePDF failed:', err.message);
  }

  // ── 4–5. Emails + update Sheets row (in parallel) ────────────────────────
  const results = await Promise.allSettled([
    sendCustomerEmail(customerEmail, calcData, pdfBuffer),
    sendAdminNotification({ email: customerEmail, pais: country, tier, monto, moneda, sessionId: session.id }),
    uuid
      ? completeTransaction(uuid, { fecha, monto, moneda, sessionId: session.id, email: customerEmail, pais: country, tier, totalCalculado: result.total || '' })
      : Promise.resolve()
  ]);

  results.forEach((r, i) => {
    const labels = ['sendCustomerEmail', 'sendAdminNotification', 'completeTransaction'];
    if (r.status === 'rejected') {
      console.error(`${labels[i]} failed:`, r.reason?.message || r.reason);
    }
  });

  res.json({ received: true });
};
