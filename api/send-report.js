// POST /api/send-report
//
// Called by the browser after returning from payment.
// The browser generates the PDF (same one the user downloads) and sends it here as base64.
// This endpoint attaches it to the customer email.
//
// Body: { email, pdfBase64, tier, country, result, inputs }

const { sendCustomerEmail } = require('./lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, pdfBase64, tier, country, result, inputs } = req.body || {};

  if (!email || !pdfBase64) {
    return res.status(400).json({ error: 'Missing email or pdf' });
  }

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  const calcData  = { tier, country, inputs: inputs || {}, result: result || {} };

  try {
    await sendCustomerEmail(email, calcData, pdfBuffer);
    res.json({ ok: true });
  } catch (err) {
    console.error('sendCustomerEmail failed:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
};
