// Shared country config and pricing
// Used by both create-checkout.js and webhook.js

const COUNTRY_CONFIG = {
  mx: {
    name: 'México',
    currency: 'mxn',
    prices: {
      basic:   2500,   // centavos → $25 MXN
      premium: 15000   // centavos → $150 MXN
    },
    successUrl: 'https://finiquitoya.app',
    labels: {
      basic: 'Desglose Básico',
      premium: 'Reporte PDF Completo'
    }
  },
  co: {
    name: 'Colombia',
    currency: 'cop',
    prices: {
      basic:   500000,   // centavos → $5,000 COP
      premium: 3000000   // centavos → $30,000 COP
    },
    successUrl: 'https://finiquitoya.app',
    labels: {
      basic: 'Desglose Básico',
      premium: 'Reporte PDF Completo'
    }
  },
  ve: {
    name: 'Venezuela',
    currency: 'usd',
    prices: {
      basic:   125,   // centavos → $1.25 USD
      premium: 750    // centavos → $7.50 USD
    },
    successUrl: 'https://finiquitoya.app',
    labels: {
      basic: 'Desglose Básico',
      premium: 'Reporte PDF Completo'
    }
  }
};

// Shared date formatter — mirrors finiquitoya.html fmtDateLong()
function fmtDateLong(ds) {
  if (!ds) return '—';
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'];
  const [y, m, d] = ds.split('-').map(Number);
  return `${d} de ${months[m-1]} de ${y}`;
}

module.exports = { COUNTRY_CONFIG, fmtDateLong };
