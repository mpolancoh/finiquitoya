// api/lib/ratelimit.js
// Per-route sliding-window rate limiters backed by Upstash Redis.
// Fails open (allows request) if Redis is unavailable — availability
// is more important than rate limiting for this app's current scale.

const { Ratelimit } = require('@upstash/ratelimit');
const redis = require('./redis');

const limiters = {
  // POST /api/create-checkout — starts a Stripe session
  checkout:      new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '60 s'),   prefix: 'rl:checkout' }),
  // POST /api/send-report — triggers email + PDF processing
  sendReport:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5,  '60 s'),   prefix: 'rl:report'   }),
  // GET /api/verify-session — Stripe session lookup
  verifySession: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '60 s'),   prefix: 'rl:verify'   }),
  // POST /api/contact-lawyer — lawyer inquiry form (max 3 per hour to prevent spam)
  contactLawyer: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3,  '3600 s'), prefix: 'rl:lawyer'   }),
};

/**
 * Check the rate limit for a given route and IP.
 * Returns { limited: true, retryAfter: <seconds> } if over limit,
 * or { limited: false } if within limit.
 */
async function checkRateLimit(limiterKey, identifier) {
  const limiter = limiters[limiterKey];
  if (!limiter) return { limited: false };
  try {
    const { success, reset } = await limiter.limit(identifier);
    if (success) return { limited: false };
    return { limited: true, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch (err) {
    // Fail open: if Redis is unreachable, let the request through
    console.error('ratelimit check failed (failing open):', err.message);
    return { limited: false };
  }
}

/** Extract the real client IP from Vercel's forwarded headers. */
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

module.exports = { checkRateLimit, getIP };
