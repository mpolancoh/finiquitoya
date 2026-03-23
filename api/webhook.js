// Stripe webhook handler
//
// 1. Verifies the Stripe signature (requires raw body — not parsed JSON)
// 2. On checkout.session.completed:
//    a. Retrieves calc data from Google Sheets using client_reference_id (UUID)
//    b. Generates PDF server-side with pdfmake
//    c. Sends PDF as email attachment to customer (+ employer letter for premium)
//    d. Sends admin notification
//    e. Appends sale to "Ventas" sheet with full analytics

const stripe              = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getCalcByUUID, appendSale } = require('./lib/sheets');
const { generatePDF }     = require('./lib/pdf');
const { sendCustomerEmail, sendAdminNotification } = require('./lib/email');

// Reads raw request body as a Buffer (required for Stripe signature verification)
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

  // Only handle completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session       = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  const monto         = ((session.amount_total || 0) / 100).toFixed(2);
  const moneda        = (session.currency || 'usd').toUpperCase();
  const fecha         = new Date().toISOString();
  const uuid          = session.client_reference_id;

  // ── 2. Retrieve calc data from Google Sheets ─────────────────────────────
  let calcData = null;
  if (uuid) {
    try {
      calcData = await getCalcByUUID(uuid);
    } catch (err) {
      console.error('getCalcByUUID failed:', err.message);
    }
  }

  // Fallback: if we couldn't get calc data, use minimal info from session
  // (payment links flow or UUID lookup failure)
  if (!calcData) {
    // Try to extract pais/tier from payment link redirect URL (legacy fallback)
    let pais = 'mx', tier = 'basic';
    try {
      if (session.payment_link) {
        const pl = await stripe.paymentLinks.retrieve(session.payment_link);
        const redirectUrl = new URL(pl.after_completion?.redirect?.url || '');
        pais = redirectUrl.searchParams.get('pais') || 'mx';
        tier = redirectUrl.searchParams.get('unlocked') || 'basic';
      }
    } catch (e) {
      console.error('Could not retrieve payment link:', e.message);
    }
    calcData = { tier, country: pais, inputs: {}, result: {} };
  }

  const { tier = 'basic', country = 'mx', inputs = {}, result = {} } = calcData;

  // ── 3. Generate PDF ───────────────────────────────────────────────────────
  let pdfBuffer = null;
  // Always generate PDF (basic gets desglose only, premium gets full report)
  try {
    pdfBuffer = await generatePDF(calcData);
  } catch (err) {
    console.error('generatePDF failed:', err.message);
  }

  // ── 4–5. Send emails + save to Ventas sheet (in parallel) ────────────────
  const results = await Promise.allSettled([
    sendCustomerEmail(customerEmail, calcData, pdfBuffer),
    sendAdminNotification({ email: customerEmail, pais: country, tier, monto, moneda, sessionId: session.id }),
    appendSale({
      fecha,
      email:          customerEmail,
      pais:           country,
      tier,
      monto,
      moneda,
      sessionId:      session.id,
      salario:        inputs.salary        || '',
      fechaInicio:    inputs.startDate     || '',
      fechaFin:       inputs.endDate       || '',
      tipoSalida:     inputs.termType      || '',
      totalCalculado: result.total         || ''
    })
  ]);

  results.forEach((r, i) => {
    const labels = ['sendCustomerEmail', 'sendAdminNotification', 'appendSale'];
    if (r.status === 'rejected') {
      console.error(`${labels[i]} failed:`, r.reason?.message || r.reason);
    }
  });

  res.json({ received: true });
};
