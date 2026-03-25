# TuLiquidacion — Data Privacy & Retention Policy

_Last updated: March 2026_

This document describes what data TuLiquidacion collects, where it is stored,
how long it is retained, and the rights of users in Mexico, Colombia, and Venezuela.

---

## What data we collect

| Field | Source | Purpose |
|---|---|---|
| Email address | User-provided at checkout | Send the calculation report; admin notification |
| Salary (monthly) | User-provided in form | Liquidation calculation |
| Employment dates | User-provided in form | Liquidation calculation |
| Termination type | User-provided in form | Liquidation calculation |
| Country | User-selected | Route to correct legal formula |
| Worker name (optional) | User-provided | PDF personalization |
| Stripe session ID | Stripe | Payment verification and audit trail |
| Payment amount & currency | Stripe | Transaction record |

---

## Where data is stored

### Google Sheets (transaction log)
Every paid transaction is recorded in a private Google Sheets spreadsheet accessible
only to TuLiquidacion administrators. Each row contains: UUID, email, creation date,
country, tier, total amount calculated, full calculation JSON, payment status, payment
date, amount paid, currency, Stripe session ID, and worker name.

**Retention:** Rows are retained indefinitely for accounting purposes. Salary and
personal data in column G (CalcDataJSON) should be reviewed and purged periodically.
_Action item: implement scheduled deletion of rows older than 90 days for column G._

### Brevo (email provider)
Transactional emails (report delivery) are logged by Brevo. Brevo retains email logs
for 30 days by default. No salary data is included in email subject lines or headers.

### Vercel (hosting + serverless logs)
Vercel may log request headers and metadata. Request bodies (which contain salary data)
are NOT logged by Vercel's default log configuration. Logs are retained for 1 day on
the free tier.

### PDFs
PDFs are generated client-side in the user's browser using pdfmake. When sent by
email, the PDF is transmitted to `/api/send-report` as a base64 string, converted to
a Buffer in memory, attached to the email, and immediately discarded. **No PDF is
ever written to disk on the server.**

### Upstash Redis
Redis stores only:
- Rate limit counters keyed by IP address (TTL: 60 seconds)
- Webhook event IDs for idempotency (TTL: 24 hours)

No personal data or salary information is stored in Redis.

### Sentry (error monitoring)
Sentry captures application errors. The `beforeSend` hook scrubs `salary`, `name`,
`email`, and `pdfBase64` from all error payloads before transmission. Sentry retains
error events for 90 days on the free tier.

---

## User rights

### Mexico — LFPDPPP (Ley Federal de Protección de Datos Personales en Posesión de los Particulares)
Users in Mexico have the right to:
- **Access**: know what personal data we hold about them
- **Rectification**: correct inaccurate data
- **Cancellation**: request deletion of their data
- **Opposition**: object to processing

To exercise these rights, contact: privacy@finiquitoya.app

TuLiquidacion commits to maintaining an _Aviso de Privacidad_ accessible from the
app footer, as required by Art. 15–17 LFPDPPP.

### Colombia — Ley 1581/2012 (Habeas Data)
Colombian users have the right to access, update, rectify, and delete their personal data.

### Venezuela — Ley de Infogobierno / Ley Especial contra Delitos Informáticos
Venezuelan users may request information about their stored data by contacting us.

---

## Contact
For privacy-related requests: privacy@finiquitoya.app
