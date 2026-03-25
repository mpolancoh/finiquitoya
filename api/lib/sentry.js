// api/lib/sentry.js
// Shared Sentry initialisation for all serverless API routes.
// No-ops gracefully when SENTRY_DSN is not set (local dev without Sentry).

const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // VERCEL_ENV is set automatically by Vercel: "production" | "preview" | "development"
    environment: process.env.VERCEL_ENV || 'development',
    beforeSend(event) {
      // Scrub all sensitive fields from request payloads before sending to Sentry
      if (event.request?.data) {
        const d = event.request.data;
        delete d.salary;
        delete d.name;
        delete d.workerName;
        delete d.email;
        delete d.pdfBase64;
      }
      return event;
    },
  });
}

/**
 * Capture an exception with optional context tags.
 * Tags are shown in Sentry's issue list and are useful for filtering.
 *
 * Example:
 *   captureError(err, { country: 'mx', termType: 'dismissal', route: 'create-checkout' });
 */
function captureError(err, tags = {}) {
  if (!process.env.SENTRY_DSN) {
    console.error('[sentry no-op]', err.message || err, tags);
    return;
  }
  Sentry.withScope(scope => {
    Object.entries(tags).forEach(([k, v]) => scope.setTag(k, v));
    Sentry.captureException(err);
  });
}

module.exports = { Sentry, captureError };
