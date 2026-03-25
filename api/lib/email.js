// Email templates and sending helpers using Brevo (sib-api-v3-sdk)
//
// sendCustomerEmail(toEmail, calcData, pdfBuffer)
//   Basic:   breakdown table in email body, no PDF
//   Premium: branded cover note + PDF + employer letter
//
// sendAdminNotification(data) — sale alert to admin

const SibApiV3Sdk = require('sib-api-v3-sdk');
const { fmtDateLong } = require('./config');

const COUNTRY_LABELS   = { mx: 'México', co: 'Colombia', ve: 'Venezuela' };
const COUNTRY_CURRENCY = { mx: 'MXN',    co: 'COP',       ve: 'USD'      };
const LAW_LABELS       = {
  mx: 'Ley Federal del Trabajo (LFT)',
  co: 'Código Sustantivo del Trabajo (CST)',
  ve: 'LOTTT'
};
// Artículo gramatical correcto por país (Código = masculino → "el"; Ley/LOTTT = femenino → "la")
const LAW_ARTICLES     = { mx: 'la', co: 'el', ve: 'la' };
const TERM_TYPE_LABELS = {
  dismissal:    'despido injustificado',
  voluntary:    'renuncia voluntaria',    // canonical value from validation schema
  resignation:  'renuncia voluntaria',    // alias
  justified:    'despido con justa causa',
  mutual:       'terminación por mutuo acuerdo',
  constructive: 'renuncia por causas imputables al empleador'
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape HTML special chars in user-supplied strings before embedding in email templates. */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBrevoApi() {
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

// "$25,000.00 MXN"
function fmtCurrency(value, country) {
  const sym = COUNTRY_CURRENCY[country] || '';
  const n   = Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${n} ${sym}`;
}

// "3 años y 22 días" — counts exact anniversaries
function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return '[duración]';
  const start = new Date(startStr + 'T12:00:00');
  const end   = new Date(endStr   + 'T12:00:00');
  let years = end.getFullYear() - start.getFullYear();
  const anniv = new Date(end.getFullYear(), start.getMonth(), start.getDate());
  if (end < anniv) years--;
  const lastAnniv = new Date(start);
  lastAnniv.setFullYear(start.getFullYear() + years);
  const days = Math.round((end - lastAnniv) / 86400000);
  if (years === 0) return `${days} día${days !== 1 ? 's' : ''}`;
  if (days  === 0) return `${years} año${years !== 1 ? 's' : ''}`;
  return `${years} año${years !== 1 ? 's' : ''} y ${days} día${days !== 1 ? 's' : ''}`;
}

// ── Breakdown table (Basic email) ─────────────────────────────────────────────

function buildBreakdownTable(items, total, country) {
  if (!items || !items.length) return '';
  const currency = COUNTRY_CURRENCY[country] || '';
  const rowsBg   = ['#ffffff', '#f0f6ff'];

  const rows = items.map((item, i) => `
    <tr style="background:${rowsBg[i % 2]}">
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:2px">${item.name}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:2px">${item.calc || ''}</div>
        <div style="font-size:10px;color:#94a3b8">${item.law || ''}</div>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap">
        <span style="font-size:13px;font-weight:700;color:#1d4ed8">
          ${Number(item.amount||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;overflow:hidden;font-family:sans-serif;margin:20px 0">
      <thead>
        <tr style="background:#1d4ed8">
          <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#fff">Concepto</th>
          <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#fff">Monto (${currency})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#dbeafe">
          <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#1e3a8a">TOTAL ESTIMADO</td>
          <td style="padding:12px 14px;text-align:right;font-size:15px;font-weight:900;color:#1e3a8a;white-space:nowrap">
            ${Number(total||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}
          </td>
        </tr>
      </tfoot>
    </table>
  `;
}

// ── Employer letter (Premium only) ───────────────────────────────────────────
// Plain letter format — no tables, no colors. Same structure for all countries.

function buildEmployerLetter(calcData) {
  const { country = 'mx', inputs = {}, result = {} } = calcData;
  const { salary = 0, startDate, endDate, termType, workerName = '' } = inputs;
  const { items = [], total = 0, SDB = 0, SDI = 0 } = result;

  const termLabel  = esc(TERM_TYPE_LABELS[termType] || termType || 'separación laboral');
  const currency   = esc(COUNTRY_CURRENCY[country] || '');
  const lawLabel   = esc(LAW_LABELS[country]       || 'la legislación laboral vigente');
  const duration   = esc(formatDuration(startDate, endDate));
  const startFmt   = esc(fmtDateLong(startDate));
  const endFmt     = esc(fmtDateLong(endDate));

  const salaryFmt  = esc(Number(salary).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const sdbFmt     = esc(Number(SDB).toLocaleString('es-MX',    { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const sdiFmt     = esc(Number(SDI).toLocaleString('es-MX',    { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const totalFmt   = esc(fmtCurrency(total, country));

  // Bullet list of concepts
  const conceptBullets = items.map(item => {
    const amtFmt = esc(Number(item.amount||0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    return `<li style="margin-bottom:6px">
      <strong>${esc(item.name)}:</strong> $${amtFmt} &nbsp;—&nbsp; ${esc(item.calc || '')}
    </li>`;
  }).join('');

  // Country-specific copy variations
  const cityLine    = { mx: 'Ciudad de México',    co: '[Ciudad]',  ve: '[Ciudad]'  }[country];
  const salaryLine  = country === 'mx'
    ? `salario base diario: $${sdbFmt} · salario diario integrado: $${sdiFmt}`
    : country === 'co'
    ? `salario base diario: $${sdbFmt} COP`
    : `salario base diario: $${sdbFmt} USD`;
  const idField     = { mx: 'CURP / No. de empleado', co: 'C.C.', ve: 'C.I.' }[country] || 'ID';
  const greeting    = { mx: 'Estimado(a)',  co: 'Respetado(a)',  ve: 'Estimado(a)' }[country];
  const conceptsIntro = {
    mx: 'Los conceptos que me corresponden, conforme a la Ley Federal del Trabajo, son los siguientes:',
    co: 'Los conceptos que me corresponden conforme al Código Sustantivo del Trabajo son los siguientes:',
    ve: 'Los conceptos que me corresponden conforme a la LOTTT son los siguientes:'
  }[country];
  const closing = {
    mx: 'Solicito que esta situación sea atendida a la brevedad. Agradezco que me confirmen la recepción de esta carta e indiquen la fecha y forma de pago a la mayor brevedad posible.',
    co: 'Solicito que esta situación sea atendida de manera oportuna. Agradezco me confirmen la recepción de esta carta e indiquen la fecha y forma de pago a la mayor brevedad posible.',
    ve: 'Solicito que esta situación sea atendida a la brevedad. Agradezco que me confirmen la recepción de esta comunicación e indiquen la fecha y forma de pago lo antes posible.'
  }[country];

  return `
    <p style="margin:0 0 16px 0">${cityLine}, [Fecha]</p>

    <p style="margin:0 0 16px 0">
      [Nombre del destinatario]<br>
      [Cargo del destinatario]<br>
      [Nombre de la empresa]
    </p>

    <p style="margin:0 0 16px 0">${greeting} [Nombre del destinatario]:</p>

    <p style="margin:0 0 16px 0">
      Me dirijo a ustedes con el fin de solicitar formalmente el pago de la liquidación que me
      corresponde por ley, derivada de la conclusión de mi relación laboral con esta empresa.
    </p>

    <p style="margin:0 0 16px 0">
      Laboré en esta organización del <strong>${startFmt}</strong> al <strong>${endFmt}</strong>,
      siendo mi separación motivada por <strong>${termLabel}</strong>. La duración total de la
      relación laboral fue de <strong>${duration}</strong>, con un salario mensual de
      <strong>$${salaryFmt} ${currency}</strong> (${salaryLine}). El cálculo detallado de cada
      concepto se adjunta en formato PDF.
    </p>

    <p style="margin:0 0 10px 0">${conceptsIntro}</p>

    <ul style="margin:0 0 16px 0;padding-left:20px;line-height:1.9;font-size:13px">
      ${conceptBullets}
    </ul>

    <p style="margin:0 0 16px 0;font-size:14px">
      <strong>Total estimado de liquidación: ${totalFmt}</strong>
    </p>

    <p style="margin:0 0 16px 0">${closing}</p>

    <p style="margin:0 0 32px 0">Quedo a su disposición para cualquier aclaración.</p>

    <p style="margin:0 0 6px 0">Atentamente,</p>
    <br>
    <p style="margin:0 0 4px 0"><strong>${esc(workerName) || '[Tu nombre completo]'}</strong></p>
    <p style="margin:0;font-size:13px;line-height:1.9">
      ${idField}: [Tu número de identificación]<br>
      Teléfono: [Tu teléfono]<br>
      Correo electrónico: [Tu correo personal]
    </p>
  `;
}

// ── Customer email ─────────────────────────────────────────────────────────────

async function sendCustomerEmail(toEmail, calcData, pdfBuffer) {
  if (!process.env.BREVO_API_KEY || !toEmail) return;

  const { country = 'mx', tier = 'premium', result = {}, inputs = {} } = calcData;
  const total      = result.total || 0;
  const items      = result.items || [];
  const isPremium  = tier === 'premium';
  const pdfName    = `reporte_liquidacion_${esc(country)}.pdf`;
  const countryLbl  = esc(COUNTRY_LABELS[country]  || country);
  const lawLbl      = esc(LAW_LABELS[country]      || '');
  const lawArticle  = esc(LAW_ARTICLES[country]    || 'la');
  const api        = getBrevoApi();

  // ── Shared branded header ──────────────────────────────────────────────────
  const brandHeader = `
    <div style="background:#ffffff;padding:22px 32px;border-radius:8px 8px 0 0;border-bottom:3px solid #1d4ed8">
      <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;font-family:sans-serif">
        <span style="color:#111827">Tu</span><span style="color:#1d4ed8">Liquidacion</span>
      </p>
      <p style="margin:4px 0 0 0;font-size:12px;color:#64748b;font-family:sans-serif">tuliquidacion.app</p>
    </div>
  `;

  const emailFooter = `
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
    <p style="font-size:11px;color:#94a3b8;margin:0;font-family:sans-serif">
      TuLiquidacion · tuliquidacion.app<br>
      Mensaje automático — por favor no respondas a este correo.<br>
      Esta estimación es orientativa y no constituye asesoría legal.
    </p>
  `;

  let htmlContent, subject;

  if (isPremium) {
    // ── PREMIUM ──────────────────────────────────────────────────────────────
    subject = `Tu reporte de liquidación — ${fmtCurrency(total, country)}`;
    const employerLetter = buildEmployerLetter(calcData);

    htmlContent = `
      <div style="max-width:600px;margin:0 auto;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${brandHeader}
        <div style="padding:28px 32px;font-family:sans-serif;color:#1e293b">

          <h2 style="font-size:18px;margin:0 0 12px 0;color:#1e3a8a">Gracias por tu compra ✓</h2>

          <p style="font-size:14px;line-height:1.7;margin:0 0 12px 0">
            Hemos generado tu reporte de liquidación para <strong>${countryLbl}</strong>,
            calculado conforme a ${lawArticle} <strong>${lawLbl}</strong>. Encuéntralo adjunto en formato PDF.
          </p>

          <p style="font-size:14px;line-height:1.7;margin:0 0 12px 0">
            El reporte incluye el desglose completo de cada concepto, la fórmula aplicada,
            el artículo de ley que lo respalda y una guía de tus derechos.
          </p>

          <p style="font-size:14px;line-height:1.7;margin:0 0 20px 0">
            Más abajo encontrarás una <strong>carta lista para enviar a tu empleador</strong>.
            Reemplaza los campos en <strong>[corchetes]</strong> con tu información real antes de enviarla.
          </p>

          <div style="background:#eff6ff;border-left:4px solid #1d4ed8;border-radius:4px;padding:14px 18px;margin:0 0 28px 0">
            <p style="margin:0;font-size:12px;color:#1e40af;font-weight:600">TOTAL ESTIMADO DE TU LIQUIDACIÓN</p>
            <p style="margin:6px 0 0 0;font-size:24px;font-weight:900;color:#1e3a8a">${fmtCurrency(total, country)}</p>
          </div>

          <hr style="border:none;border-top:2px solid #e2e8f0;margin:0 0 24px 0"/>

          <h3 style="font-size:15px;margin:0 0 4px 0;color:#1e293b">Carta para tu empleador</h3>
          <p style="font-size:12px;color:#64748b;margin:0 0 16px 0">
            Reemplaza todos los campos en <strong>[corchetes]</strong> con tu información real.
          </p>

          <div style="font-family:Georgia,serif;font-size:13px;color:#1e293b;line-height:1.9;
                      border:1px solid #cbd5e1;padding:28px 32px;background:#fafafa;border-radius:4px">
            ${employerLetter}
          </div>

          ${emailFooter}
        </div>
      </div>
    `;

  } else {
    // ── BASIC ────────────────────────────────────────────────────────────────
    subject = `Tu desglose de liquidación — ${fmtCurrency(total, country)}`;
    const table = buildBreakdownTable(items, total, country);

    htmlContent = `
      <div style="max-width:600px;margin:0 auto;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${brandHeader}
        <div style="padding:28px 32px;font-family:sans-serif;color:#1e293b">

          <h2 style="font-size:18px;margin:0 0 12px 0;color:#1e3a8a">Tu desglose está listo ✓</h2>

          <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0">
            Aquí tienes el desglose completo de tu liquidación en <strong>${countryLbl}</strong>,
            calculado conforme a ${lawArticle} <strong>${lawLbl}</strong>.
          </p>

          ${table}

          <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0 0 8px 0">
            Cada concepto incluye la fórmula de cálculo y el artículo de ley que lo respalda.
            Los montos reales pueden variar según tu contrato o convenio colectivo.
          </p>

          ${emailFooter}
        </div>
      </div>
    `;
  }

  const emailBody = {
    sender:      { name: 'TuLiquidacion', email: 'noreply@finiquitoya.app' },
    to:          [{ email: toEmail }],
    subject,
    htmlContent
  };

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
    sender:      { name: 'TuLiquidacion', email: 'noreply@finiquitoya.app' },
    to:          [{ email: process.env.ADMIN_EMAIL }],
    subject:     `💰 Nueva venta: ${esc(tier).toUpperCase()} · ${esc(pais||'').toUpperCase()} · ${esc(monto)} ${esc(moneda)}`,
    htmlContent: `
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Email</td><td><b>${esc(email)}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">País</td><td>${esc(pais||'').toUpperCase()}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Plan</td><td>${esc(tier)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Monto</td><td><b>${esc(monto)} ${esc(moneda)}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b">Session</td><td style="font-size:11px;color:#94a3b8">${esc(sessionId||'')}</td></tr>
      </table>
    `
  });
}

// ── Lawyer inquiry ────────────────────────────────────────────────────────────
// Sends two emails:
//   1. To LAWYER_EMAIL (the specialist) — full case details
//   2. To the user — confirmation receipt

async function sendLawyerInquiry({ nombre, email, empresa, desc, country, salary, startDate, endDate, termType, total, files }) {
  if (!process.env.BREVO_API_KEY) return;

  const api         = getBrevoApi();
  const lawyerEmail = process.env.LAWYER_EMAIL || process.env.ADMIN_EMAIL;
  if (!lawyerEmail) return;

  const currency  = esc(COUNTRY_CURRENCY[country] || '');
  const countryLbl = esc(COUNTRY_LABELS[country]  || country);
  const termLbl    = esc(TERM_TYPE_LABELS[termType] || termType || '—');
  const totalFmt   = Number(total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const salaryFmt  = Number(salary || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fileList   = files && files.length ? files.join(', ') : '—';

  // 1. Email to the specialist
  await api.sendTransacEmail({
    sender:      { name: 'TuLiquidacion', email: 'noreply@finiquitoya.app' },
    to:          [{ email: lawyerEmail }],
    subject:     `⚖️ Nueva consulta laboral · ${countryLbl} · ${esc(nombre)}`,
    htmlContent: `
      <div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1e293b">
        <div style="background:#1d4ed8;padding:18px 28px;border-radius:8px 8px 0 0">
          <p style="margin:0;font-size:20px;font-weight:800;color:#fff">
            <span style="color:#bfdbfe">Tu</span>Liquidacion — Nueva consulta laboral
          </p>
        </div>
        <div style="padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <tr><td style="padding:6px 0;color:#64748b;width:160px">Nombre</td><td><strong>${esc(nombre)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Correo</td><td><a href="mailto:${esc(email)}" style="color:#1d4ed8">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">País</td><td>${countryLbl}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Empleador</td><td>${esc(empresa) || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Tipo terminación</td><td>${termLbl}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Salario mensual</td><td>$${salaryFmt} ${currency}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Inicio / Fin</td><td>${esc(startDate) || '—'} → ${esc(endDate) || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Liquidación estimada</td><td><strong style="color:#16a34a">$${totalFmt} ${currency}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Archivos mencionados</td><td style="font-size:12px;color:#64748b">${esc(fileList)}</td></tr>
          </table>
          <div style="background:#f8fafc;border-left:3px solid #1d4ed8;padding:14px 18px;border-radius:4px">
            <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.05em">Descripción del caso</p>
            <p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(desc)}</p>
          </div>
          <p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8">
            Solicitud recibida a través de tuliquidacion.app
          </p>
        </div>
      </div>
    `
  });

  // 2. Confirmation email to the user
  await api.sendTransacEmail({
    sender:      { name: 'TuLiquidacion', email: 'noreply@finiquitoya.app' },
    to:          [{ email }],
    subject:     `Recibimos tu solicitud de asesoría laboral`,
    htmlContent: `
      <div style="max-width:600px;margin:0 auto;font-family:sans-serif;color:#1e293b">
        <div style="background:#ffffff;padding:22px 32px;border-radius:8px 8px 0 0;border-bottom:3px solid #1d4ed8">
          <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">
            <span style="color:#111827">Tu</span><span style="color:#1d4ed8">Liquidacion</span>
          </p>
          <p style="margin:4px 0 0 0;font-size:12px;color:#64748b">tuliquidacion.app</p>
        </div>
        <div style="padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="font-size:18px;margin:0 0 12px 0;color:#1e3a8a">Hola ${esc(nombre)}, recibimos tu solicitud ✓</h2>
          <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0">
            Un especialista en derecho laboral de <strong>${countryLbl}</strong> revisará tu caso y
            te contactará a este correo a la brevedad.
          </p>
          <div style="background:#eff6ff;border-left:4px solid #1d4ed8;border-radius:4px;padding:14px 18px;margin:0 0 20px 0">
            <p style="margin:0;font-size:12px;color:#1e40af;font-weight:600">LIQUIDACIÓN ESTIMADA EN TU CASO</p>
            <p style="margin:6px 0 0 0;font-size:22px;font-weight:900;color:#1e3a8a">$${totalFmt} ${currency}</p>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 8px 0">
            Si tienes documentos adicionales que quieras compartir (contrato, cartas, recibos de nómina),
            puedes responder directamente a este correo adjuntándolos.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="font-size:11px;color:#94a3b8;margin:0">
            TuLiquidacion · tuliquidacion.app<br>
            Mensaje automático — este correo fue enviado porque solicitaste asesoría laboral.<br>
            Esta estimación es orientativa y no constituye asesoría legal.
          </p>
        </div>
      </div>
    `
  });
}

module.exports = { sendCustomerEmail, sendAdminNotification, sendLawyerInquiry };
