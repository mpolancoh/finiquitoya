// Email templates and sending helpers using Brevo (sib-api-v3-sdk)
//
// sendCustomerEmail(toEmail, calcData, pdfBuffer) — sends PDF to customer
// sendAdminNotification(data)                     — sends sale alert to admin

const SibApiV3Sdk = require('sib-api-v3-sdk');

const COUNTRY_LABELS = {
  mx: 'México',
  co: 'Colombia',
  ve: 'Venezuela'
};

const TERM_TYPE_LABELS = {
  dismissal:    'Despido injustificado',
  resignation:  'Renuncia voluntaria',
  justified:    'Despido justificado',
  mutual:       'Mutuo acuerdo',
  constructive: 'Renuncia por causas imputables al patrón'
};

function getBrevoApi() {
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

function fmtCurrency(value, country) {
  const symbols = { mx: 'MXN', co: 'COP', ve: 'USD' };
  const symbol = symbols[country] || '';
  const formatted = Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} ${symbol}`;
}

// ── Employer letter templates by country ─────────────────────────────────────

function buildEmployerLetter(calcData) {
  const { country = 'mx', inputs = {}, result = {} } = calcData;
  const total     = result.total || 0;
  const termLabel = TERM_TYPE_LABELS[inputs.termType] || inputs.termType || 'separación laboral';
  const countryLabel = COUNTRY_LABELS[country] || country;

  const templates = {
    mx: `
      <p>[Ciudad], [Fecha]</p>
      <br>
      <p><strong>[Nombre del trabajador]</strong><br>
      C.P. [Código postal], México</p>
      <br>
      <p>Por medio de la presente, yo <strong>[Tu nombre completo]</strong>, con número de empleado <strong>[Número de empleado]</strong>, me dirijo a ustedes de manera respetuosa para solicitar el pago completo de mi liquidación correspondiente a mi relación laboral que concluyó el <strong>[Fecha de salida]</strong> por motivo de <strong>${termLabel}</strong>, conforme a lo establecido en la Ley Federal del Trabajo.</p>
      <br>
      <p>De acuerdo con el cálculo realizado conforme a los artículos 76, 87, 162 y demás aplicables de la Ley Federal del Trabajo, el monto total de mi liquidación es de:</p>
      <br>
      <p style="text-align:center;font-size:20px;font-weight:bold;color:#1e3a8a">${fmtCurrency(total, country)}</p>
      <br>
      <p>Dicho monto incluye los conceptos de partes proporcionales de aguinaldo, vacaciones, prima vacacional, y demás prestaciones de ley que me corresponden. Se adjunta el reporte detallado de liquidación generado mediante FiniquitoYa.</p>
      <br>
      <p>Solicito respetuosamente que procedan a realizar el pago dentro de los próximos <strong>5 días hábiles</strong>. De no recibir respuesta en dicho plazo, me veré en la necesidad de acudir a las instancias legales correspondientes ante la Junta de Conciliación y Arbitraje.</p>
      <br>
      <p>Quedo en espera de su pronta respuesta.</p>
      <br>
      <p>Atentamente,</p>
      <br>
      <p><strong>[Tu nombre completo]</strong><br>
      [Tu teléfono]<br>
      [Tu correo electrónico]</p>
    `,
    co: `
      <p>[Ciudad], [Fecha]</p>
      <br>
      <p><strong>Recursos Humanos / Representante Legal</strong><br>
      <strong>[Nombre de la empresa]</strong><br>
      Colombia</p>
      <br>
      <p>Respetados señores:</p>
      <br>
      <p>Yo, <strong>[Tu nombre completo]</strong>, identificado(a) con cédula de ciudadanía No. <strong>[Tu número de cédula]</strong>, quien laboré en esta empresa desde <strong>[Fecha de ingreso]</strong> hasta el <strong>[Fecha de salida]</strong>, mediante el presente escrito solicito el pago de mi liquidación de prestaciones sociales y demás acreencias laborales, conforme a lo establecido en el Código Sustantivo del Trabajo.</p>
      <br>
      <p>El monto total calculado de acuerdo con la normatividad colombiana vigente es de:</p>
      <br>
      <p style="text-align:center;font-size:20px;font-weight:bold;color:#1e3a8a">${fmtCurrency(total, country)}</p>
      <br>
      <p>Este valor comprende cesantías, intereses sobre cesantías, prima de servicios, vacaciones proporcionales y demás conceptos que me corresponden por ley. Se adjunta el reporte detallado.</p>
      <br>
      <p>Solicito comedidamente que el pago sea realizado dentro de los próximos <strong>5 días hábiles</strong>. De lo contrario, acudiré al Ministerio del Trabajo o a la justicia ordinaria laboral para hacer valer mis derechos.</p>
      <br>
      <p>Cordialmente,</p>
      <br>
      <p><strong>[Tu nombre completo]</strong><br>
      C.C. [Tu número de cédula]<br>
      [Tu teléfono] · [Tu correo electrónico]</p>
    `,
    ve: `
      <p>[Ciudad], [Fecha]</p>
      <br>
      <p><strong>[Nombre del empleador o empresa]</strong><br>
      Venezuela</p>
      <br>
      <p>Estimados señores:</p>
      <br>
      <p>Por medio de la presente, yo <strong>[Tu nombre completo]</strong>, titular de la cédula de identidad No. <strong>[Tu número de cédula]</strong>, trabajador(a) de esta empresa desde <strong>[Fecha de ingreso]</strong>, habiendo culminado la relación laboral el día <strong>[Fecha de salida]</strong>, me dirijo a ustedes a los fines de exigir el pago de mis prestaciones sociales y demás beneficios que me corresponden conforme a la LOTTT (Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras).</p>
      <br>
      <p>El monto total calculado es de:</p>
      <br>
      <p style="text-align:center;font-size:20px;font-weight:bold;color:#1e3a8a">${fmtCurrency(total, country)}</p>
      <br>
      <p>Dicho monto comprende prestaciones sociales, utilidades fraccionadas, vacaciones y bono vacacional proporcionales y demás conceptos legales. Se adjunta el reporte de liquidación detallado.</p>
      <br>
      <p>Le otorgo un plazo de <strong>5 días hábiles</strong> para proceder al pago. Vencido dicho plazo sin respuesta favorable, acudiré ante la Inspectoría del Trabajo u otros órganos competentes.</p>
      <br>
      <p>Atentamente,</p>
      <br>
      <p><strong>[Tu nombre completo]</strong><br>
      C.I. [Tu número de cédula]<br>
      [Tu teléfono] · [Tu correo electrónico]</p>
    `
  };

  return templates[country] || templates.mx;
}

// ── Customer email with PDF attachment ───────────────────────────────────────

async function sendCustomerEmail(toEmail, calcData, pdfBuffer) {
  if (!process.env.BREVO_API_KEY || !toEmail) return;

  const { country = 'mx', tier = 'premium', result = {} } = calcData;
  const total    = result.total || 0;
  const tierLabel = tier === 'premium' ? 'Premium' : 'Básico';
  const pdfName   = `liquidacion_${country}_${tier}.pdf`;

  const isPremium = tier === 'premium';
  const api = getBrevoApi();

  const employerLetterSection = isPremium ? `
    <div style="margin-top:32px;padding:20px;background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:4px">
      <h3 style="color:#1e3a8a;margin:0 0 8px 0;font-size:15px">Carta para tu empleador</h3>
      <p style="color:#475569;font-size:13px;margin:0 0 12px 0">
        Puedes reenviar este correo a tu empleador, o copiar la carta de abajo y enviarla por separado.
        <strong>Recuerda reemplazar los campos en [corchetes] con tu información real.</strong>
      </p>
      <div style="font-family:serif;font-size:13px;color:#1e293b;line-height:1.8;border:1px solid #e2e8f0;padding:20px;background:#fff;border-radius:4px">
        ${buildEmployerLetter(calcData)}
      </div>
    </div>
  ` : '';

  const emailBody = {
    sender: { name: 'FiniquitoYa', email: 'noreply@finiquitoya.app' },
    to: [{ email: toEmail }],
    subject: `Tu reporte FiniquitoYa ${tierLabel} — ${fmtCurrency(total, country)}`,
    htmlContent: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1e293b">

        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#1e3a8a;margin:0;font-size:24px">FiniquitoYa</h1>
          <p style="color:#64748b;font-size:12px;margin:4px 0 0 0">finiquitoya.app</p>
        </div>

        <h2 style="color:#1e3a8a;font-size:18px">Tu reporte está listo ✓</h2>

        <p style="color:#475569">Gracias por tu compra. Tu reporte de liquidación <strong>${tierLabel}</strong> se adjunta a este correo como archivo PDF.</p>

        <div style="background:#dbeafe;border-radius:8px;padding:16px 20px;margin:20px 0">
          <p style="margin:0;font-size:13px;color:#1e40af"><strong>Tu liquidación estimada:</strong></p>
          <p style="margin:8px 0 0 0;font-size:26px;font-weight:bold;color:#1e3a8a">${fmtCurrency(total, country)}</p>
          <p style="margin:4px 0 0 0;font-size:11px;color:#64748b">Estimación basada en los datos proporcionados · no constituye asesoría legal</p>
        </div>

        ${isPremium ? `
        <div style="margin:20px 0">
          <h3 style="color:#1e3a8a;font-size:15px;margin-bottom:8px">¿Qué incluye tu reporte Premium?</h3>
          <ul style="color:#475569;font-size:13px;padding-left:20px;margin:0">
            <li style="margin-bottom:4px">Desglose detallado de todos los conceptos</li>
            <li style="margin-bottom:4px">Guía de negociación con tu empleador</li>
            <li style="margin-bottom:4px">Carta lista para enviar a tu empresa (ver abajo)</li>
          </ul>
        </div>
        ` : `
        <div style="margin:20px 0;padding:16px;background:#fef9c3;border-radius:8px;border:1px solid #fde047">
          <p style="margin:0;font-size:13px;color:#92400e">¿Quieres el reporte PDF completo con carta de negociación? Visita <a href="https://finiquitoya.app" style="color:#1d4ed8">finiquitoya.app</a> para actualizar a Premium.</p>
        </div>
        `}

        ${employerLetterSection}

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
        <p style="color:#94a3b8;font-size:11px;margin:0">
          FiniquitoYa · finiquitoya.app<br>
          Este es un mensaje automático. Por favor no respondas directamente a este correo.
        </p>
      </div>
    `
  };

  // Attach PDF only for premium (or always — it's already generated)
  if (pdfBuffer) {
    emailBody.attachment = [{
      content: pdfBuffer.toString('base64'),
      name:    pdfName
    }];
  }

  await api.sendTransacEmail(emailBody);
}

// ── Admin notification ────────────────────────────────────────────────────────

async function sendAdminNotification({ email, pais, tier, monto, moneda, sessionId }) {
  if (!process.env.BREVO_API_KEY || !process.env.ADMIN_EMAIL) return;

  const api = getBrevoApi();
  await api.sendTransacEmail({
    sender: { name: 'FiniquitoYa', email: 'noreply@finiquitoya.app' },
    to: [{ email: process.env.ADMIN_EMAIL }],
    subject: `💰 Nueva venta: ${tier.toUpperCase()} · ${(pais || '').toUpperCase()} · ${monto} ${moneda}`,
    htmlContent: `
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Email comprador</td><td><b>${email}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">País</td><td>${(pais || '').toUpperCase()}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Plan</td><td>${tier}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Monto</td><td><b>${monto} ${moneda}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Session ID</td><td style="font-size:11px;color:#94a3b8">${sessionId || ''}</td></tr>
      </table>
    `
  });
}

module.exports = { sendCustomerEmail, sendAdminNotification };
