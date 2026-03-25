// POST /api/create-checkout
//
// Receives calc data from finiquitoya.html, saves it to Google Sheets,
// creates a Stripe Checkout Session, returns { url } to redirect the user.
//
// Request body (JSON):
// {
//   tier:    "basic" | "premium",
//   country: "mx" | "co" | "ve",
//   inputs:  { salary, startDate, endDate, termType, unusedVac, bonuses, aguinaldoPaid, comps },
//   result:  { total, items, SDI, hasComponents }
// }

const stripe              = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { COUNTRY_CONFIG }  = require('./_lib/config');
const { createTransaction } = require('./_lib/sheets');
const { CheckoutSchema, validate } = require('./_lib/validation');
const { checkRateLimit, getIP }    = require('./_lib/ratelimit');
const { captureError }    = require('./_lib/sentry');
const crypto              = require('crypto');

module.exports = async (req, res) => {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('UNHANDLED create-checkout error:', err.message, '\nStack:', err.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!req.headers['content-type']?.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const { limited, retryAfter } = await checkRateLimit('checkout', getIP(req));
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Too many requests — please wait before trying again.' });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // ── Zod validation ─────────────────────────────────────────────────────────
  const data = validate(res, CheckoutSchema, body);
  if (!data) return;   // 400 already sent

  const { tier, country, email, inputs, result } = data;

  // Generate UUID to link this calc to the Stripe session
  const uuid = crypto.randomUUID();

  // Save transaction to Google Sheets (status = "pending" until payment confirmed)
  const calcData = { tier, country, email, inputs, result };
  try {
    await createTransaction(uuid, calcData);
  } catch (err) {
    console.error('createTransaction failed:', err.message);
    captureError(err, { route: 'create-checkout', country, tier });
  }

  // Build success/cancel URLs from the originating host so Stripe redirects back
  // to whichever URL the user is on (prod or preview deployment)
  const protocol   = req.headers['x-forwarded-proto'] || 'https';
  const host       = req.headers['x-forwarded-host'] || req.headers.host || 'tuliquidacion.app';
  const baseUrl    = process.env.APP_URL || `${protocol}://${host}`;
  const successUrl = `${baseUrl}/?unlocked=${tier}&pais=${country}&sid={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${baseUrl}/`;

  const config = COUNTRY_CONFIG[country];

  // Create Stripe Checkout Session
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency:     config.currency,
          unit_amount:  config.prices[tier],
          product_data: {
            name:        `TuLiquidacion ${config.labels[tier]}`,
            description: `Reporte de liquidación para ${config.name}`,
          }
        },
        quantity: 1
      }],
      client_reference_id: uuid,
      success_url: successUrl,
      cancel_url:  cancelUrl,
      ...(email ? { customer_email: email } : {})
    });
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    captureError(err, { route: 'create-checkout', country, tier });
    return res.status(500).json({ error: 'Could not create checkout session' });
  }

  res.json({ url: session.url });
}
