const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SibApiV3Sdk = require('sib-api-v3-sdk');
const { google } = require('googleapis');

// Reads the raw request body as a Buffer.
// This is required for Stripe signature verification — if we let the
// framework parse the body first, the signature check will fail.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Verify Stripe signature
  const rawBody = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  // Only handle completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  const monto = ((session.amount_total || 0) / 100).toFixed(2);
  const moneda = (session.currency || 'usd').toUpperCase();
  const fecha = new Date().toISOString();

  // 2. Get pais + tier from the payment link's redirect URL
  //    (more reliable than session.success_url)
  let pais = 'mx';
  let tier = 'basic';
  try {
    if (session.payment_link) {
      const pl = await stripe.paymentLinks.retrieve(session.payment_link);
      const redirectUrl = new URL(pl.after_completion?.redirect?.url || '');
      pais = redirectUrl.searchParams.get('pais') || 'mx';
      tier = redirectUrl.searchParams.get('unlocked') || 'basic';
    }
  } catch (e) {
    console.error('Could not retrieve payment link:', e.message);
  }

  // 3. Run all three actions in parallel.
  //    Promise.allSettled means one failure won't cancel the others.
  const results = await Promise.allSettled([
    appendToSheet({ fecha, email: customerEmail, pais, tier, monto, moneda, sessionId: session.id }),
    sendCustomerEmail(customerEmail, tier, pais),
    sendAdminNotification({ email: customerEmail, pais, tier, monto, moneda })
  ]);

  results.forEach((r, i) => {
    const labels = ['appendToSheet', 'sendCustomerEmail', 'sendAdminNotification'];
    if (r.status === 'rejected') console.error(`${labels[i]} failed:`, r.reason?.message || r.reason);
  });

  res.json({ received: true });
};

// ── Email to the customer ────────────────────────────────────────────────────

async function sendCustomerEmail(toEmail, tier, pais) {
  if (!process.env.BREVO_API_KEY || !toEmail) return;

  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  const api = new SibApiV3Sdk.TransactionalEmailsApi();

  const tierLabel = tier === 'premium' ? 'Premium' : 'Básico';
  const unlockUrl = `https://finiquitoya.app/?unlocked=${tier}&pais=${pais}`;

  await api.sendTransacEmail({
    sender: { name: 'FiniquitoYa', email: 'noreply@finiquitoya.app' },
    to: [{ email: toEmail }],
    subject: `Tu reporte FiniquitoYa ${tierLabel} está listo`,
    htmlContent: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
        <h2 style="color:#1e3a8a">Tu reporte está listo ✓</h2>
        <p>Gracias por tu compra. Haz clic en el botón para acceder a tu reporte de liquidación:</p>
        <a href="${unlockUrl}"
           style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 28px;
                  border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
          Ver mi reporte →
        </a>
        <p style="color:#64748b;font-size:12px">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <a href="${unlockUrl}" style="color:#3b82f6">${unlockUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:11px">
          FiniquitoYa · finiquitoya.app<br>
          Este es un mensaje automático, por favor no respondas a este correo.
        </p>
      </div>
    `
  });
}

// ── Notification to the admin ────────────────────────────────────────────────

async function sendAdminNotification({ email, pais, tier, monto, moneda }) {
  if (!process.env.BREVO_API_KEY || !process.env.ADMIN_EMAIL) return;

  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  const api = new SibApiV3Sdk.TransactionalEmailsApi();

  await api.sendTransacEmail({
    sender: { name: 'FiniquitoYa', email: 'noreply@finiquitoya.app' },
    to: [{ email: process.env.ADMIN_EMAIL }],
    subject: `💰 Nueva venta: ${tier.toUpperCase()} · ${pais.toUpperCase()} · ${monto} ${moneda}`,
    htmlContent: `
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Email comprador</td><td><b>${email}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">País</td><td>${pais.toUpperCase()}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Plan</td><td>${tier}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Monto</td><td><b>${monto} ${moneda}</b></td></tr>
      </table>
    `
  });
}

// ── Append row to Google Sheets ──────────────────────────────────────────────

async function appendToSheet(data) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEETS_ID) return;

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: 'Sheet1!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.fecha,
        data.email,
        data.pais,
        data.tier,
        data.monto,
        data.moneda,
        data.sessionId
      ]]
    }
  });
}
