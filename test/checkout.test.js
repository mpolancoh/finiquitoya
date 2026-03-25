// test/checkout.test.js
// Smoke tests for API validation schemas.
// Run with: npm test
//
// What this catches:
//   - A term type used in the frontend that's not in TERM_TYPES (the bug we had)
//   - A required field added to the schema without updating the frontend payload
//   - A Zod version incompatibility that breaks schema compilation
//   - Invalid enum values, wrong field types, missing required fields
//
// These run entirely locally — no server, no network calls needed.

const { CheckoutSchema, SendReportSchema, VerifySessionSchema } = require('../api/_lib/validation');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toBeTrue() {
      if (value !== true) throw new Error(`Expected true, got ${JSON.stringify(value)}`);
    },
    toBeFalse() {
      if (value !== false) throw new Error(`Expected false, got ${JSON.stringify(value)}`);
    },
    toContain(sub) {
      if (!String(value).includes(sub)) throw new Error(`Expected "${value}" to contain "${sub}"`);
    }
  };
}

// ─── Shared valid base payload ────────────────────────────────────────────────

const VALID_CHECKOUT = {
  tier: 'premium',
  country: 'mx',
  email: 'test@example.com',
  inputs: {
    salary: 15000,
    startDate: '2020-01-15',
    endDate:   '2024-03-01',
    termType:  'dismissal',
    unusedVac: 5,
    bonuses:   0,
    aguinaldoPaid: false,
    comps: [],
    workerName: 'Juan Pérez',
  },
  result: {
    total: 85000,
    items: [{ name: 'Partes proporcionales', amount: 10000, calc: '...', law: 'Art. 79' }],
    SDI: 600,
    SDB: 500,
  }
};

// ─── CheckoutSchema tests ─────────────────────────────────────────────────────

console.log('\nCheckoutSchema');

test('accepts valid premium MX payload', () => {
  const r = CheckoutSchema.safeParse(VALID_CHECKOUT);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts basic tier', () => {
  const r = CheckoutSchema.safeParse({ ...VALID_CHECKOUT, tier: 'basic' });
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

// All term types actually used in the frontend (index.html + finiquitoya.html)
const FRONTEND_TERM_TYPES = ['dismissal', 'resignation', 'mutual', 'justified'];

FRONTEND_TERM_TYPES.forEach(tt => {
  test(`accepts termType: "${tt}" (used in frontend)`, () => {
    const payload = { ...VALID_CHECKOUT, inputs: { ...VALID_CHECKOUT.inputs, termType: tt } };
    const r = CheckoutSchema.safeParse(payload);
    if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  });
});

const FRONTEND_COUNTRIES = ['mx', 'co', 've'];

FRONTEND_COUNTRIES.forEach(c => {
  test(`accepts country: "${c}"`, () => {
    const r = CheckoutSchema.safeParse({ ...VALID_CHECKOUT, country: c });
    if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  });
});

test('accepts salary as string with commas (browser formatting)', () => {
  const payload = { ...VALID_CHECKOUT, inputs: { ...VALID_CHECKOUT.inputs, salary: '15,000' } };
  const r = CheckoutSchema.safeParse(payload);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  expect(r.data.inputs.salary).toBe(15000);
});

test('accepts empty email (user skipped email)', () => {
  const r = CheckoutSchema.safeParse({ ...VALID_CHECKOUT, email: '' });
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts missing email field entirely', () => {
  const { email, ...rest } = VALID_CHECKOUT;
  const r = CheckoutSchema.safeParse(rest);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts result as empty object (first load, no calc yet)', () => {
  const r = CheckoutSchema.safeParse({ ...VALID_CHECKOUT, result: {} });
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts comps array with items', () => {
  const payload = { ...VALID_CHECKOUT, inputs: { ...VALID_CHECKOUT.inputs,
    comps: [{ id: 'bonos', v: '2000' }, { id: 'comisiones', v: '500' }]
  }};
  const r = CheckoutSchema.safeParse(payload);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('rejects unknown tier', () => {
  const r = CheckoutSchema.safeParse({ ...VALID_CHECKOUT, tier: 'enterprise' });
  expect(r.success).toBeFalse();
});

test('rejects endDate before startDate', () => {
  const payload = { ...VALID_CHECKOUT, inputs: { ...VALID_CHECKOUT.inputs,
    startDate: '2024-01-01', endDate: '2020-01-01'
  }};
  const r = CheckoutSchema.safeParse(payload);
  expect(r.success).toBeFalse();
});

test('rejects negative salary', () => {
  const payload = { ...VALID_CHECKOUT, inputs: { ...VALID_CHECKOUT.inputs, salary: -5000 } };
  const r = CheckoutSchema.safeParse(payload);
  expect(r.success).toBeFalse();
});

// ─── SendReportSchema tests ───────────────────────────────────────────────────

console.log('\nSendReportSchema');

const VALID_REPORT = {
  email:     'test@example.com',
  pdfBase64: 'A'.repeat(200),   // must be >= 100 chars
  tier:      'premium',
  country:   'mx',
  result:    { total: 85000 },
  inputs:    { salary: 15000, termType: 'dismissal' },
};

test('accepts valid send-report payload', () => {
  const r = SendReportSchema.safeParse(VALID_REPORT);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts optional sid', () => {
  const r = SendReportSchema.safeParse({ ...VALID_REPORT, sid: 'cs_test_abc123' });
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('accepts missing sid', () => {
  const r = SendReportSchema.safeParse(VALID_REPORT);
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('rejects invalid email', () => {
  const r = SendReportSchema.safeParse({ ...VALID_REPORT, email: 'not-an-email' });
  expect(r.success).toBeFalse();
});

test('rejects pdfBase64 too short', () => {
  const r = SendReportSchema.safeParse({ ...VALID_REPORT, pdfBase64: 'short' });
  expect(r.success).toBeFalse();
});

// ─── VerifySessionSchema tests ────────────────────────────────────────────────

console.log('\nVerifySessionSchema');

test('accepts valid cs_ session id', () => {
  const r = VerifySessionSchema.safeParse({ sid: 'cs_test_abc123xyz' });
  if (!r.success) throw new Error(r.error.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
});

test('rejects session id without cs_ prefix', () => {
  const r = VerifySessionSchema.safeParse({ sid: 'pi_abc123' });
  expect(r.success).toBeFalse();
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.error('❌ Tests failed — do not deploy until these are fixed.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed — safe to deploy.\n');
}
