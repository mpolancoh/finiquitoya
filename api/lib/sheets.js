// Google Sheets helpers — single "Transacciones" tab
//
// Each payment creates one row. Flow:
//   1. createTransaction(uuid, calcData)       ← called from create-checkout (status = "pending")
//   2. getTransactionByUUID(uuid)              ← called from webhook to retrieve calc data
//   3. completeTransaction(uuid, paymentData)  ← called from webhook to fill in payment columns
//
// Tab: Transacciones
// Cols: A=UUID  B=Email  C=FechaCreacion  D=Pais  E=Tier  F=TotalCalculado
//       G=CalcDataJSON  H=Status  I=FechaPago  J=Monto  K=Moneda  L=SessionID

const { google } = require('googleapis');

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const TAB      = 'Transacciones';

// ── 1. Save pending row when user clicks Pay ──────────────────────────────────
async function createTransaction(uuid, calcData) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:L`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        uuid,
        calcData.email         || '',
        new Date().toISOString(),
        calcData.country       || '',
        calcData.tier          || '',
        calcData.result?.total || '',
        JSON.stringify(calcData),
        'pending',             // H — updated to "paid" by webhook
        '',                    // I — FechaPago
        '',                    // J — Monto
        '',                    // K — Moneda
        ''                     // L — SessionID
      ]]
    }
  });
}

// ── 2. Find a row by UUID and return its calcData JSON ────────────────────────
async function getTransactionByUUID(uuid) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:G`
  });
  const rows = res.data.values || [];
  for (const row of rows) {
    if (row[0] === uuid) {
      try { return JSON.parse(row[6]); } catch { return null; }
    }
  }
  return null;
}

// ── 3. Find row by UUID and fill in the payment columns ───────────────────────
async function completeTransaction(uuid, paymentData) {
  const sheets = getSheetsClient();

  // Find the row number (1-based) where column A = uuid
  const colA = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:A`
  });
  const rows    = colA.data.values || [];
  let   rowNum  = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === uuid) { rowNum = i + 1; break; }
  }

  if (rowNum) {
    // Update columns H–L in that row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!H${rowNum}:L${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'paid',
          paymentData.fecha,
          paymentData.monto,
          paymentData.moneda,
          paymentData.sessionId
        ]]
      }
    });
  } else {
    // UUID not found (edge case) — append complete row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A:L`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          uuid,
          paymentData.email          || '',
          paymentData.fecha,
          paymentData.pais           || '',
          paymentData.tier           || '',
          paymentData.totalCalculado || '',
          '',
          'paid',
          paymentData.fecha,
          paymentData.monto,
          paymentData.moneda,
          paymentData.sessionId
        ]]
      }
    });
  }
}

module.exports = { createTransaction, getTransactionByUUID, completeTransaction };
