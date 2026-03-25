// POST /api/send-report
//
// Called by the browser after returning from payment.
// The browser generates the PDF (same one the user downloads) and sends it here as base64.
// This endpoint attaches it to the customer email.
//
// Body: { email, pdfBase64, tier, country, result, inputs }

const stripe                            = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendCustomerEmail }             = require('./lib/email');
const { SendReportSchema, validate }    = require('./lib/validation');
const { checkRateLimit, getIP }         = require('./lib/ratelimit');
const { captureError }                  = require('./lib/sentry');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!req.headers['content-type']?.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const { limited, retryAfter } = await checkRateLimit('sendReport', getIP(req));
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Too many requests — please wait before trying again.' });
  }

  // ── Zod validation ─────────────────────────────────────────────────────────
  const data = validate(res, SendReportSchema, req.body || {});
  if (!data) return;

  const { email, pdfBase64, tier, country, result, inputs, sid } = data;

  // If the browser provided a Stripe session ID, verify the payment before sending
  if (sid) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sid);
      if (session.payment_status !== 'paid') {
        return res.status(403).json({ error: 'Payment not confirmed' });
      }
    } catch (err) {
      // Stripe lookup failed — log and continue rather than block the user
      console.error('send-report: stripe session verify failed:', err.message);
      captureError(err, { route: 'send-report', step: 'verify-sid' });
    }
  }

  // Limit PDF to 10 MB base64 (~7.5 MB actual)
  if (pdfBase64.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'PDF too large' });
  }

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const calcData  = { tier, country, inputs, result };

  try {
    await sendCustomerEmail(email, calcData, pdfBuffer);
    res.json({ ok: true });
  } catch (err) {
    console.error('sendCustomerEmail failed:', err.message);
    captureError(err, { route: 'send-report', country, tier });
    res.status(500).json({ error: 'Failed to send email' });
  }
};
