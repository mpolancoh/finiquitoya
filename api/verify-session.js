// GET /api/verify-session?sid=cs_xxx
// Verifies a Stripe Checkout Session is paid and returns { ok, tier, country }

const stripe                            = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { VerifySessionSchema, validate } = require('./lib/validation');
const { checkRateLimit, getIP }         = require('./lib/ratelimit');
const { captureError }                  = require('./lib/sentry');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const { limited, retryAfter } = await checkRateLimit('verifySession', getIP(req));
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ ok: false, error: 'Too many requests.' });
  }

  // ── Zod validation ─────────────────────────────────────────────────────────
  const data = validate(res, VerifySessionSchema, req.query || {});
  if (!data) return;

  const { sid } = data;

  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (session.payment_status !== 'paid') {
      return res.json({ ok: false, error: 'Payment not completed' });
    }
    const url     = new URL(session.success_url);
    const tier    = url.searchParams.get('unlocked') || 'basic';
    const country = url.searchParams.get('pais')     || 'mx';
    res.json({ ok: true, tier, country });
  } catch (err) {
    console.error('verify-session error:', err.message);
    captureError(err, { route: 'verify-session' });
    res.status(500).json({ ok: false, error: 'Could not verify session' });
  }
};
