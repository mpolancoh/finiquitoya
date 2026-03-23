// Server-side PDF generation using pdfmake
// generatePDF(calcData) → returns a Promise<Buffer>
//
// calcData shape (from finiquitoya.html window._pdfState):
// {
//   tier, country,
//   inputs: { salary, startDate, endDate, termType, unusedVac, bonuses, aguinaldoPaid },
//   result: { total, items: [{label, value, breakdown?}], SDI, hasComponents }
// }

const PdfPrinter = require('pdfmake/src/printer');
const vfsFonts   = require('pdfmake/build/vfs_fonts');

const printer = new PdfPrinter({
  Roboto: {
    normal:      Buffer.from(vfsFonts.vfs['Roboto-Regular.ttf'],    'base64'),
    bold:        Buffer.from(vfsFonts.vfs['Roboto-Medium.ttf'],     'base64'),
    italics:     Buffer.from(vfsFonts.vfs['Roboto-Italic.ttf'],     'base64'),
    bolditalics: Buffer.from(vfsFonts.vfs['Roboto-MediumItalic.ttf'],'base64')
  }
});

// ── Formatting helpers ────────────────────────────────────────────────────────

const COUNTRY_LABELS = {
  mx: 'México',
  co: 'Colombia',
  ve: 'Venezuela'
};

const TERM_TYPE_LABELS = {
  dismissal:      'Despido injustificado',
  resignation:    'Renuncia voluntaria',
  justified:      'Despido justificado',
  mutual:         'Mutuo acuerdo',
  constructive:   'Renuncia por causas imputables al patrón'
};

function fmtCurrency(value, country) {
  const symbols = { mx: 'MXN', co: 'COP', ve: 'USD' };
  const symbol = symbols[country] || '';
  const formatted = Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} ${symbol}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// ── Build pdfmake document definition ────────────────────────────────────────

function buildDocDef(calcData) {
  const { country = 'mx', tier = 'premium', inputs = {}, result = {} } = calcData;
  const items   = result.items  || [];
  const total   = result.total  || 0;
  const SDI     = result.SDI    || 0;
  const isPremium = tier === 'premium';

  const BLUE      = '#1e3a8a';
  const LIGHT_BLUE = '#dbeafe';
  const GRAY      = '#64748b';
  const DARK      = '#1e293b';
  const WHITE     = '#ffffff';

  // Header info rows
  const infoRows = [
    ['País', COUNTRY_LABELS[country] || country],
    ['Tipo de salida', TERM_TYPE_LABELS[inputs.termType] || inputs.termType || ''],
    ['Fecha de ingreso', fmtDate(inputs.startDate)],
    ['Fecha de salida', fmtDate(inputs.endDate)],
    ['Salario diario bruto', fmtCurrency(inputs.salary, country)],
    ['Salario Diario Integrado (SDI)', fmtCurrency(SDI, country)]
  ];

  // Breakdown table rows
  const tableBody = [
    // Header row
    [
      { text: 'Concepto',     style: 'tableHeader', fillColor: BLUE,  color: WHITE },
      { text: 'Monto',        style: 'tableHeader', fillColor: BLUE,  color: WHITE, alignment: 'right' }
    ]
  ];
  items.forEach(item => {
    tableBody.push([
      { text: item.label || '', style: 'tableCell' },
      { text: fmtCurrency(item.value, country), style: 'tableCell', alignment: 'right' }
    ]);
  });

  // Total row
  tableBody.push([
    { text: 'TOTAL', bold: true, fontSize: 13, color: BLUE, margin: [4, 6, 4, 6] },
    { text: fmtCurrency(total, country), bold: true, fontSize: 13, color: BLUE, alignment: 'right', margin: [4, 6, 4, 6] }
  ]);

  const content = [
    // ── Header ──────────────────────────────────────────────────────────────
    {
      columns: [
        {
          stack: [
            { text: 'FiniquitoYa', fontSize: 22, bold: true, color: BLUE, margin: [0, 0, 0, 2] },
            { text: 'finiquitoya.app', fontSize: 10, color: GRAY }
          ]
        },
        {
          stack: [
            { text: 'REPORTE DE LIQUIDACIÓN', fontSize: 14, bold: true, color: BLUE, alignment: 'right' },
            { text: isPremium ? 'Reporte Premium' : 'Reporte Básico', fontSize: 10, color: GRAY, alignment: 'right' },
            { text: `Generado: ${new Date().toLocaleDateString('es-MX')}`, fontSize: 9, color: GRAY, alignment: 'right', margin: [0, 2, 0, 0] }
          ]
        }
      ],
      margin: [0, 0, 0, 16]
    },

    // Horizontal rule
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: BLUE }], margin: [0, 0, 0, 16] },

    // ── Info section ────────────────────────────────────────────────────────
    { text: 'Datos del Cálculo', fontSize: 13, bold: true, color: BLUE, margin: [0, 0, 0, 8] },
    {
      table: {
        widths: [160, '*'],
        body: infoRows.map(([label, val]) => [
          { text: label, color: GRAY, fontSize: 10, margin: [4, 4, 4, 4] },
          { text: val,   color: DARK, fontSize: 10, margin: [4, 4, 4, 4] }
        ])
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        fillColor: (i) => i % 2 === 0 ? LIGHT_BLUE : WHITE
      },
      margin: [0, 0, 0, 20]
    },

    // ── Breakdown table ──────────────────────────────────────────────────────
    { text: 'Desglose de Liquidación', fontSize: 13, bold: true, color: BLUE, margin: [0, 0, 0, 8] },
    {
      table: {
        widths: ['*', 140],
        body: tableBody
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0'
      },
      margin: [0, 0, 0, 24]
    },

    // ── Important note ───────────────────────────────────────────────────────
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: 'Nota importante', bold: true, fontSize: 10, color: BLUE, margin: [0, 0, 0, 4] },
            { text: 'Este reporte es una estimación basada en los datos proporcionados. Los cálculos se basan en la legislación laboral vigente del país seleccionado. Se recomienda consultar con un abogado laboral para confirmar los montos antes de presentar un reclamo formal.', fontSize: 9, color: GRAY }
          ],
          fillColor: LIGHT_BLUE,
          margin: [10, 10, 10, 10]
        }]]
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 24]
    }
  ];

  // ── Premium-only: Negotiation guide ─────────────────────────────────────
  if (isPremium) {
    content.push(
      { text: 'Guía de Negociación', fontSize: 13, bold: true, color: BLUE, margin: [0, 0, 0, 8], pageBreak: 'before' },
      {
        ul: [
          { text: [{ text: 'Documenta todo: ', bold: true }, 'Guarda copias de tu contrato, recibos de nómina, y cualquier comunicación con tu empleador.'], margin: [0, 0, 0, 6] },
          { text: [{ text: 'Conoce tus derechos: ', bold: true }, 'La liquidación calculada es el mínimo legal. No estás obligado a aceptar menos.'], margin: [0, 0, 0, 6] },
          { text: [{ text: 'Plazo para reclamar: ', bold: true }, 'Tienes un plazo legal para presentar tu demanda (generalmente 1-2 años según el país). No esperes demasiado.'], margin: [0, 0, 0, 6] },
          { text: [{ text: 'Negocia por escrito: ', bold: true }, 'Cualquier acuerdo o propuesta debe quedar por escrito y firmado por ambas partes.'], margin: [0, 0, 0, 6] },
          { text: [{ text: 'Busca asesoría legal: ', bold: true }, 'Si el empleador no quiere pagar o propone menos, consulta con un abogado laboral antes de firmar cualquier documento.'], margin: [0, 0, 0, 6] },
          { text: [{ text: 'No firmes bajo presión: ', bold: true }, 'Tienes derecho a tomarte el tiempo necesario para revisar cualquier oferta de finiquito.'], margin: [0, 0, 0, 6] }
        ],
        fontSize: 10,
        color: DARK,
        margin: [0, 0, 0, 0]
      }
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10, color: DARK },
    styles: {
      tableHeader: { bold: true, fontSize: 11, margin: [4, 6, 4, 6] },
      tableCell:   { fontSize: 10, margin: [4, 5, 4, 5] }
    },
    pageMargins: [40, 40, 40, 60],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'FiniquitoYa · finiquitoya.app · Este es un cálculo estimado, no constituye asesoría legal.', fontSize: 8, color: GRAY, margin: [40, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: GRAY, alignment: 'right', margin: [0, 0, 40, 0] }
      ],
      margin: [0, 10, 0, 0]
    })
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function generatePDF(calcData) {
  return new Promise((resolve, reject) => {
    try {
      const docDef = buildDocDef(calcData);
      const pdfDoc = printer.createPdfKitDocument(docDef);
      const chunks = [];
      pdfDoc.on('data',  chunk => chunks.push(chunk));
      pdfDoc.on('end',   ()    => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', err  => reject(err));
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePDF };
