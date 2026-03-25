// POST /api/send-report
//
// Called by the browser after returning from payment.
// The browser generates the PDF (same one the user downloads) and sends it here as base64.
// This endpoint attaches it to the customer email.
//
// Body: { email, pdfBase64, tier, country, result, inputs }

const { sendCustomerEmail }             = require('./lib/email');
const { SendReportSchema, validate }    = require('./lib/validation');
const { checkRateLimit, getIP }         = require('./lib/ratelimit');
const { captureError }                  = require('./lib/sentry');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['content-type'] !== 'application/json') {
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

  const { email, pdfBase64, tier, country, result, inputs } = data;

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
