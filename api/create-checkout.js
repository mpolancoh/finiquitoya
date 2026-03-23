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

const stripe          = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { COUNTRY_CONFIG } = require('./lib/config');
const { saveCalc }    = require('./lib/sheets');
const crypto          = require('crypto');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') return res.status(405).end();

  // Parse body — Vercel serverless functions parse JSON automatically
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { tier = 'basic', country = 'mx', email = '', inputs = {}, result = {} } = body || {};

  // Validate
  const config = COUNTRY_CONFIG[country];
  if (!config) return res.status(400).json({ error: 'Invalid country: ' + country });
  if (tier !== 'basic' && tier !== 'premium') return res.status(400).json({ error: 'Invalid tier: ' + tier });

  // Generate UUID to link this calc to the Stripe session
  const uuid = crypto.randomUUID();

  // Save calc data to Google Sheets "Calculos" tab
  const calcData = { tier, country, email, inputs, result };
  try {
    await saveCalc(uuid, calcData);
  } catch (err) {
    // Don't block the checkout if sheets fails — log and continue
    console.error('saveCalc failed:', err.message);
  }

  // Build success/cancel URLs
  const baseUrl    = 'https://finiquitoya.app';
  const successUrl = `${baseUrl}/?unlocked=${tier}&pais=${country}`;
  const cancelUrl  = `${baseUrl}/`;

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
            name:        `FiniquitoYa ${config.labels[tier]}`,
            description: `Reporte de liquidación para ${config.name}`,
          }
        },
        quantity: 1
      }],
      client_reference_id: uuid,   // ← this links the session to our calc data
      success_url: successUrl,
      cancel_url:  cancelUrl,
      ...(email ? { customer_email: email } : {})
    });
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }

  res.json({ url: session.url });
};
