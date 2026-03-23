// Email templates and sending helpers using Brevo (sib-api-v3-sdk)
//
// sendCustomerEmail(toEmail, calcData, pdfBuffer) — sends report to customer
//   Basic:   breakdown table in email body, no PDF attachment
//   Premium: cover note + PDF attachment + employer letter
//
// sendAdminNotification(data) — sends sale alert to admin

const SibApiV3Sdk = require('sib-api-v3-sdk');

const COUNTRY_LABELS = {
  mx: 'México',
  co: 'Colombia',
  ve: 'Venezuela'
};

const COUNTRY_CURRENCY = {
  mx: 'MXN',
  co: 'COP',
  ve: 'USD'
};

const LAW_LABELS = {
  mx: 'Ley Federal del Trabajo (LFT)',
  co: 'Código Sustantivo del Trabajo (CST)',
  ve: 'LOTTT'
};

const TERM_TYPE_LABELS = {
  dismissal:    'Despido injustificado',
  resignation:  'Renuncia voluntaria',
  justified:    'Despido con justa causa',
  mutual:       'Terminación por mutuo acuerdo',
  constructive: 'Renuncia por causas imputables al empleador'
};

function getBrevoApi() {
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

function fmtCurrency(value, country) {
  const symbol = COUNTRY_CURRENCY[country] || '';
  const formatted = Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} ${symbol}`;
}

// ── Breakdown table (for Basic email) ────────────────────────────────────────
// Mirrors the visual style of the in-app breakdown table using inline styles.

function buildBreakdownTable(items, total, country) {
  if (!items || !items.length) return '';

  const currency = COUNTRY_CURRENCY[country] || '';

  const rowsBg = ['#ffffff', '#f0f6ff'];
  let rows = items.map((item, i) => `
    <tr style="background:${rowsBg[i % 2]}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:2px">${item.name}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:2px">${item.calc || ''}</div>
        <div style="font-size:10px;color:#94a3b8">${item.law || ''}</div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap">
        <span style="font-size:13px;font-weight:700;color:#1d4ed8">${Number(item.amount||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}</span>
      </td>
    </tr>
  `).join('');

  return `
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-family:sans-serif;margin:20px 0">
      <thead>
        <tr style="background:#1d4ed8">
          <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#ffffff">Concepto</th>
          <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#ffffff">Monto (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="background:#dbeafe">
          <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#1e3a8a">TOTAL ESTIMADO</td>
          <td style="padding:12px 14px;text-align:right;font-size:15px;font-weight:900;color:#1e3a8a;white-space:nowrap">
            ${Number(total||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}
          </td>
        </tr>
      </tbody>
    </table>
  `;
}

// ── Employer letter (Premium only, by country) ────────────────────────────────

function buildEmployerLetter(calcData) {
  const { country = 'mx', inputs = {}, result = {} } = calcData;
  const total     = result.total || 0;
  const termLabel = TERM_TYPE_LABELS[inputs.termType] || inputs.termType || 'separación laboral';
  const currency  = COUNTRY_CURRENCY[country] || '';

  const totalFormatted = `${Number(total).toLocaleString('es-MX', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })} ${currency}`;

  const templates = {
    mx: `
      <p style="margin:0 0 12px 0">[Ciudad], [Fecha]</p>

      <p style="margin:0 0 12px 0">
        <strong>[Nombre del responsable de Recursos Humanos o representante legal]</strong><br>
        <strong>[Nombre de la empresa]</strong><br>
        México
      </p>

      <p style="margin:0 0 12px 0">Estimado(a) señor(a):</p>

      <p style="margin:0 0 12px 0">
        Por medio de la presente me dirijo a usted de manera respetuosa. Mi nombre es <strong>[Tu nombre completo]</strong>
        y laboré en esta empresa desde el <strong>[Fecha de ingreso]</strong> hasta el <strong>[Fecha de salida]</strong>,
        fecha en que se dio por concluida la relación laboral por motivo de <strong>${termLabel}</strong>.
      </p>

      <p style="margin:0 0 12px 0">
        Conforme a los derechos que me asisten según la Ley Federal del Trabajo (LFT), y con base en el cálculo
        detallado que adjunto a este correo, el monto total de mi liquidación asciende a:
      </p>

      <p style="margin:0 0 12px 0;font-size:18px;font-weight:bold">
        ${totalFormatted}
      </p>

      <p style="margin:0 0 12px 0">
        Este monto contempla los conceptos que me corresponden por ley, incluyendo partes proporcionales de aguinaldo,
        vacaciones, prima vacacional, prima de antigüedad e indemnización, según corresponda al tipo de separación.
        El reporte detallado con cada concepto y su fundamento legal se adjunta a este correo.
      </p>

      <p style="margin:0 0 6px 0"><strong>Próximos pasos que les propongo:</strong></p>
      <ol style="margin:0 0 12px 0;padding-left:20px;line-height:1.8">
        <li>Revisen el reporte adjunto y confirmen los datos de la relación laboral.</li>
        <li>Acordemos la forma y fecha de pago a la brevedad posible para evitar inconvenientes mayores.</li>
        <li>Si hay algún concepto en discusión, estoy dispuesto(a) a dialogar y llegar a un acuerdo justo.</li>
        <li>De no lograrse un acuerdo, me veré en la necesidad de acudir a las instancias legales correspondientes,
            incluyendo la Junta de Conciliación y Arbitraje o la PROFEDET.</li>
      </ol>

      <p style="margin:0 0 12px 0">
        Confío en que podemos resolver esto de manera directa y amistosa. Quedo a su disposición para cualquier
        aclaración que requieran.
      </p>

      <p style="margin:0 0 6px 0">Atentamente,</p>
      <ul style="margin:0;padding-left:0;list-style:none;line-height:1.9">
        <li><strong>[Tu nombre completo]</strong></li>
        <li>CURP / No. de empleado: [Tu CURP o número de empleado]</li>
        <li>Teléfono: [Tu teléfono]</li>
        <li>Correo: [Tu correo electrónico]</li>
      </ul>
    `,

    co: `
      <p style="margin:0 0 12px 0">[Ciudad], [Fecha]</p>

      <p style="margin:0 0 12px 0">
        <strong>Recursos Humanos / Representante Legal</strong><br>
        <strong>[Nombre de la empresa]</strong><br>
        Colombia
      </p>

      <p style="margin:0 0 12px 0">Respetados señores:</p>

      <p style="margin:0 0 12px 0">
        Mi nombre es <strong>[Tu nombre completo]</strong>, identificado(a) con cédula de ciudadanía
        No. <strong>[Tu número de cédula]</strong>. Laboré en esta empresa desde el
        <strong>[Fecha de ingreso]</strong> hasta el <strong>[Fecha de salida]</strong>,
        fecha en la que se dio por terminada la relación laboral por <strong>${termLabel}</strong>.
      </p>

      <p style="margin:0 0 12px 0">
        Con base en el Código Sustantivo del Trabajo y en el cálculo detallado que adjunto, el monto
        total de mis acreencias laborales es de:
      </p>

      <p style="margin:0 0 12px 0;font-size:18px;font-weight:bold">
        ${totalFormatted}
      </p>

      <p style="margin:0 0 12px 0">
        Este valor comprende cesantías, intereses sobre cesantías, prima de servicios, vacaciones proporcionales
        e indemnización por despido, según corresponda. Todos los conceptos se encuentran detallados en el reporte
        adjunto, con su fórmula de cálculo y el artículo del CST que los respalda.
      </p>

      <p style="margin:0 0 6px 0"><strong>Propuesta de gestión:</strong></p>
      <ol style="margin:0 0 12px 0;padding-left:20px;line-height:1.8">
        <li>Les invito a revisar el reporte adjunto y validar los datos registrados.</li>
        <li>Podemos coordinar el pago o acuerdo de pago de forma directa y ágil.</li>
        <li>Si existe alguna discrepancia, estoy abierto(a) al diálogo para llegar a un acuerdo mutuo.</li>
        <li>En caso de no llegar a un entendimiento, acudiré al Ministerio del Trabajo o a la jurisdicción
            laboral ordinaria para hacer valer mis derechos. Recuerden que el artículo 65 del CST establece
            sanción moratoria por retardo en el pago de la liquidación.</li>
      </ol>

      <p style="margin:0 0 12px 0">
        Espero que podamos resolver este asunto de manera directa. Quedo atento(a) a su respuesta.
      </p>

      <p style="margin:0 0 6px 0">Cordialmente,</p>
      <ul style="margin:0;padding-left:0;list-style:none;line-height:1.9">
        <li><strong>[Tu nombre completo]</strong></li>
        <li>C.C.: [Tu número de cédula]</li>
        <li>Teléfono: [Tu teléfono]</li>
        <li>Correo: [Tu correo electrónico]</li>
      </ul>
    `,

    ve: `
      <p style="margin:0 0 12px 0">[Ciudad], [Fecha]</p>

      <p style="margin:0 0 12px 0">
        <strong>[Nombre del empleador o representante de la empresa]</strong><br>
        <strong>[Nombre de la empresa]</strong><br>
        Venezuela
      </p>

      <p style="margin:0 0 12px 0">Estimados señores:</p>

      <p style="margin:0 0 12px 0">
        Por medio de la presente, yo <strong>[Tu nombre completo]</strong>, titular de la cédula de identidad
        No. <strong>[Tu número de cédula]</strong>, quien prestó servicios en esta empresa desde el
        <strong>[Fecha de ingreso]</strong> hasta el <strong>[Fecha de salida]</strong>, fecha en que culminó
        la relación laboral por <strong>${termLabel}</strong>, me dirijo a ustedes para solicitar el pago
        oportuno de mis prestaciones sociales y demás beneficios laborales conforme a la
        Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT).
      </p>

      <p style="margin:0 0 12px 0">
        De acuerdo con el cálculo realizado conforme a la legislación vigente, el monto total al que
        tengo derecho es de:
      </p>

      <p style="margin:0 0 12px 0;font-size:18px;font-weight:bold">
        ${totalFormatted}
      </p>

      <p style="margin:0 0 12px 0">
        Este monto comprende prestaciones sociales (Art. 142 LOTTT), utilidades fraccionadas, vacaciones
        proporcionales, bono vacacional e indemnización por despido injustificado, según aplique.
        El reporte detallado con cada concepto y su base de cálculo se adjunta a este correo.
      </p>

      <p style="margin:0 0 6px 0"><strong>Pasos sugeridos para resolver esto de forma ágil:</strong></p>
      <ol style="margin:0 0 12px 0;padding-left:20px;line-height:1.8">
        <li>Revisen el reporte adjunto y confirmen los datos de la relación laboral.</li>
        <li>Coordinen conmigo la forma y fecha de pago a la brevedad.</li>
        <li>Si hay algún punto en discusión, propongo abordarlo directamente para llegar a un acuerdo.</li>
        <li>De no obtenerse respuesta, acudiré ante la Inspectoría del Trabajo o los Tribunales Laborales
            para hacer valer mis derechos conforme a la LOTTT.</li>
      </ol>

      <p style="margin:0 0 12px 0">
        Confío en una pronta y satisfactoria respuesta de su parte.
      </p>

      <p style="margin:0 0 6px 0">Atentamente,</p>
      <ul style="margin:0;padding-left:0;list-style:none;line-height:1.9">
        <li><strong>[Tu nombre completo]</strong></li>
        <li>C.I.: [Tu número de cédula]</li>
        <li>Teléfono: [Tu teléfono]</li>
        <li>Correo: [Tu correo electrónico]</li>
      </ul>
    `
  };

  return templates[country] || templates.mx;
}

// ── Customer email ────────────────────────────────────────────────────────────
//
//  Basic:   breakdown table with colors in email body, no PDF attachment
//  Premium: brief cover note from FiniquitoYa + PDF attachment + employer letter

async function sendCustomerEmail(toEmail, calcData, pdfBuffer) {
  if (!process.env.BREVO_API_KEY || !toEmail) return;

  const { country = 'mx', tier = 'premium', result = {}, inputs = {} } = calcData;
  const total      = result.total || 0;
  const items      = result.items || [];
  const isPremium  = tier === 'premium';
  const pdfName    = `reporte_liquidacion_${country}.pdf`;
  const countryLbl = COUNTRY_LABELS[country] || country;
  const lawLbl     = LAW_LABELS[country]     || '';
  const api        = getBrevoApi();

  // ── Shared header ──────────────────────────────────────────────────────────
  const emailHeader = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1e293b">
      <div style="margin-bottom:24px">
        <p style="margin:0;font-size:22px;font-weight:700;color:#1e3a8a">FiniquitoYa</p>
        <p style="margin:2px 0 0 0;font-size:12px;color:#94a3b8">finiquitoya.app</p>
      </div>
  `;

  const emailFooter = `
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
      <p style="font-size:11px;color:#94a3b8;margin:0">
        FiniquitoYa · finiquitoya.app<br>
        Este es un mensaje automático. Por favor no respondas directamente a este correo.<br>
        Esta estimación es orientativa y no constituye asesoría legal.
      </p>
    </div>
  `;

  let htmlContent, subject;

  if (isPremium) {
    // ── PREMIUM: cover note + PDF attachment + employer letter ──────────────
    subject = `Tu reporte de liquidación — ${fmtCurrency(total, country)}`;

    const employerLetter = buildEmployerLetter(calcData);

    htmlContent = `
      ${emailHeader}

      <h2 style="font-size:18px;margin:0 0 12px 0;color:#1e3a8a">Gracias por tu compra ✓</h2>

      <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0">
        Hemos generado tu reporte de liquidación laboral para <strong>${countryLbl}</strong>,
        basado en la <strong>${lawLbl}</strong>. Lo encontrarás adjunto a este correo en formato PDF.
      </p>

      <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0">
        Tu reporte incluye el desglose completo de cada concepto, la fórmula de cálculo aplicada,
        el artículo de ley que lo respalda, y una guía con tus derechos y próximos pasos si necesitas
        reclamar el pago.
      </p>

      <p style="font-size:14px;line-height:1.7;margin:0 0 24px 0">
        Más abajo encontrarás también una <strong>carta lista para enviar a tu empleador</strong>.
        Solo reemplaza los campos en <strong>[corchetes]</strong> con tu información real.
        Puedes copiar el texto, enviarlo como correo o imprimirlo.
      </p>

      <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin:0 0 24px 0;font-size:13px;color:#475569">
        <strong>Total estimado de tu liquidación:</strong>
        <span style="font-size:20px;font-weight:bold;color:#1e3a8a;margin-left:12px">${fmtCurrency(total, country)}</span>
      </div>

      <hr style="border:none;border-top:2px solid #e2e8f0;margin:32px 0"/>

      <h3 style="font-size:16px;margin:0 0 6px 0;color:#1e293b">Carta para tu empleador</h3>
      <p style="font-size:12px;color:#64748b;margin:0 0 16px 0">
        Reemplaza todos los campos en <strong>[corchetes]</strong> antes de enviarla.
      </p>

      <div style="font-family:Georgia,serif;font-size:13px;color:#1e293b;line-height:1.9;
                  border:1px solid #cbd5e1;padding:28px;background:#ffffff;border-radius:4px">
        ${employerLetter}
      </div>

      ${emailFooter}
    `;

  } else {
    // ── BASIC: breakdown table in body, no PDF ──────────────────────────────
    subject = `Tu desglose de liquidación — ${fmtCurrency(total, country)}`;

    const table = buildBreakdownTable(items, total, country);

    htmlContent = `
      ${emailHeader}

      <h2 style="font-size:18px;margin:0 0 12px 0;color:#1e3a8a">Tu desglose está listo ✓</h2>

      <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0">
        Aquí tienes el desglose completo de tu liquidación en <strong>${countryLbl}</strong>,
        calculado conforme a la <strong>${lawLbl}</strong>.
      </p>

      ${table}

      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0 0 24px 0">
        Cada concepto incluye la fórmula de cálculo y el artículo de ley que lo respalda.
        Esta es una estimación orientativa; los montos reales pueden variar según tu contrato o
        convenio colectivo.
      </p>

      ${emailFooter}
    `;
  }

  const emailBody = {
    sender: { name: 'FiniquitoYa', email: 'noreply@finiquitoya.app' },
    to:     [{ email: toEmail }],
    subject,
    htmlContent
  };

  // PDF attached only for Premium
  if (isPremium && pdfBuffer) {
    emailBody.attachment = [{ content: pdfBuffer.toString('base64'), name: pdfName }];
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
