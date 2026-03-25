// api/lib/validation.js
// Zod schemas for all API route inputs.
// Apply at the top of each route: const parsed = Schema.safeParse(body);

const { z } = require('zod');

const COUNTRIES   = ['mx', 'co', 've'];
const TIERS       = ['basic', 'premium'];
const TERM_TYPES  = ['dismissal', 'voluntary', 'mutual', 'justified'];

// ── Shared sub-schemas ───────────────────────────────────────────────────────

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// ── POST /api/create-checkout ────────────────────────────────────────────────

const CheckoutSchema = z.object({
  tier:    z.enum(TIERS),
  country: z.enum(COUNTRIES),
  email:   z.union([z.string().email(), z.literal('')]).optional().default(''),
  inputs: z.object({
    salary:               z.coerce.number().positive().max(1_000_000_000),
    startDate:            dateStr,
    endDate:              dateStr,
    termType:             z.enum(TERM_TYPES),
    unusedVac:            z.coerce.number().min(0).max(365).optional().default(0),
    bonuses:              z.coerce.number().min(0).optional().default(0),
    aguinaldoPaid:        z.boolean().optional().default(false),
    // Colombia-specific
    cesantiasRegime:      z.enum(['ley50', 'retroactivo']).optional(),
    indemnizacionPactada: z.coerce.number().min(0).optional(),
    vacSalary:            z.coerce.number().min(0).optional(),
    salaryIntegrated:     z.coerce.number().min(0).optional(),
    // Variable components array (salary components for SDI integration)
    comps: z.array(z.any()).optional().default([]),
    // Worker name for PDF personalization
    workerName: z.string().max(200).optional().default(''),
  }).superRefine((val, ctx) => {
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be after startDate',
        path: ['endDate'],
      });
    }
  }),
  result: z.record(z.any()).optional().default({}),
});

// ── POST /api/send-report ────────────────────────────────────────────────────

const SendReportSchema = z.object({
  email:     z.string().email(),
  pdfBase64: z.string().min(100),   // must be non-trivially long
  tier:      z.enum(TIERS),
  country:   z.enum(COUNTRIES),
  result:    z.record(z.any()).optional().default({}),
  inputs:    z.record(z.any()).optional().default({}),
});

// ── GET /api/verify-session ──────────────────────────────────────────────────

const VerifySessionSchema = z.object({
  sid: z.string().startsWith('cs_').max(500),
});

// ── Shared helper ────────────────────────────────────────────────────────────

/**
 * Validate and return parsed data, or send a 400 and return null.
 * Usage:
 *   const data = validate(res, CheckoutSchema, body);
 *   if (!data) return;   // 400 already sent
 */
function validate(res, schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    res.status(400).json({ error: 'Validation failed', details: message });
    return null;
  }
  return result.data;
}

module.exports = { CheckoutSchema, SendReportSchema, VerifySessionSchema, validate };
