// GET /api/verify-session?sid=cs_xxx
// Verifies a Stripe Checkout Session is paid and returns { ok, tier, country }

const stripe                            = require('stripe')(process.env.STRIPE_SECRET_KEY);
const redis                             = require('./_lib/redis');
const { VerifySessionSchema, validate } = require('./_lib/validation');
const { checkRateLimit, getIP }         = require('./_lib/ratelimit');
const { captureError }                  = require('./_lib/sentry');

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

  // Check Redis cache first — a paid session doesn't change, no need to re-hit Stripe
  const cacheKey = `vs:${sid}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
  } catch (_) { /* Redis unavailable — fall through to Stripe */ }

  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (session.payment_status !== 'paid') {
      return res.json({ ok: false, error: 'Payment not completed' });
    }
    const url     = new URL(session.success_url);
    const tier    = url.searchParams.get('unlocked') || 'basic';
    const country = url.searchParams.get('pais')     || 'mx';
    const payload = { ok: true, tier, country };
    // Cache for 2 hours — paid sessions are immutable
    try { await redis.set(cacheKey, JSON.stringify(payload), { ex: 7200 }); } catch (_) {}
    res.json(payload);
  } catch (err) {
    console.error('verify-session error:', err.message);
    captureError(err, { route: 'verify-session' });
    res.status(500).json({ ok: false, error: 'Could not verify session' });
  }
};
