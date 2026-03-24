// GET /api/verify-session?sid=cs_xxx
// Verifies a Stripe Checkout Session is paid and returns { ok, tier, country }
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const sid = req.query.sid;
  if (!sid || !sid.startsWith('cs_')) {
    return res.status(400).json({ ok: false, error: 'Invalid session ID' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (session.payment_status !== 'paid') {
      return res.json({ ok: false, error: 'Payment not completed' });
    }
    // Extract tier and country from success_url query params
    const url    = new URL(session.success_url);
    const tier    = url.searchParams.get('unlocked') || 'basic';
    const country = url.searchParams.get('pais')     || 'mx';
    res.json({ ok: true, tier, country });
  } catch (err) {
    console.error('verify-session error:', err.message);
    res.status(500).json({ ok: false, error: 'Could not verify session' });
  }
};
