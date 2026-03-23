// Google Sheets helpers
// - saveCalc(uuid, data)       → saves calc data to "Calculos" tab before payment
// - getCalcByUUID(uuid)        → retrieves calc data from "Calculos" tab in webhook
// - appendSale(data)           → saves completed sale to "Ventas" tab with analytics

const { google } = require('googleapis');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;

// ── Save calculation before redirect to Stripe ───────────────────────────────
// Saves to "Calculos" tab: [uuid, timestamp, country, tier, calcDataJSON]
async function saveCalc(uuid, calcData) {
  const sheets = getSheetsClient();
  const fecha = new Date().toISOString();
  // Store the full calc object as JSON in column E
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Calculos!A:E',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        uuid,
        fecha,
        calcData.country || '',
        calcData.tier || '',
        JSON.stringify(calcData)
      ]]
    }
  });
}

// ── Retrieve calculation by UUID ──────────────────────────────────────────────
// Scans "Calculos" tab for a row where column A = uuid
async function getCalcByUUID(uuid) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Calculos!A:E'
  });
  const rows = response.data.values || [];
  // Skip header row if present (first row may be "UUID", "Fecha", etc.)
  for (const row of rows) {
    if (row[0] === uuid) {
      try {
        return JSON.parse(row[4]); // column E = full JSON
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

// ── Append completed sale to Ventas tab ───────────────────────────────────────
// Columns: fecha, email, pais, tier, monto, moneda, sessionId,
//          salario, fechaInicio, fechaFin, tipoSalida, totalCalculado
async function appendSale(data) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Ventas!A:L',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.fecha,
        data.email,
        data.pais,
        data.tier,
        data.monto,
        data.moneda,
        data.sessionId,
        data.salario || '',
        data.fechaInicio || '',
        data.fechaFin || '',
        data.tipoSalida || '',
        data.totalCalculado || ''
      ]]
    }
  });
}

module.exports = { saveCalc, getCalcByUUID, appendSale };
