// api/lib/redis.js
// Shared Upstash Redis client.
// Used by: rate limiting (ratelimit.js) and webhook idempotency (webhook.js).
// Requires: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN env vars.

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = redis;
