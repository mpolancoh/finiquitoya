// POST /api/contact-lawyer
//
// Receives the lawyer contact form submission and sends two emails via Brevo:
//   1. To abogado@finiquitoya.com — full case details for the specialist
//   2. To the user — confirmation that their request was received
//
// Body: { nombre, email, empresa, desc, country, salary, startDate, endDate, termType, total, files }

const { sendCustomerEmail, sendLawyerInquiry } = require('./_lib/email');
const { checkRateLimit, getIP }                = require('./_lib/ratelimit');
const { captureError }                         = require('./_lib/sentry');
const { z }                                    = require('zod');

const ContactLawyerSchema = z.object({
  nombre:    z.string().min(1).max(200),
  email:     z.string().email(),
  empresa:   z.string().max(300).optional().default(''),
  desc:      z.string().min(1).max(5000),
  country:   z.enum(['mx', 'co', 've']),
  salary:    z.coerce.number().min(0).optional().default(0),
  startDate: z.string().optional().default(''),
  endDate:   z.string().optional().default(''),
  termType:  z.string().max(50).optional().default(''),
  total:     z.coerce.number().min(0).optional().default(0),
  files:     z.array(z.string().max(200)).max(5).optional().default([]),
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (!req.headers['content-type']?.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  // Rate limit: max 3 submissions per IP per hour (prevents spam)
  const { limited, retryAfter } = await checkRateLimit('contactLawyer', getIP(req));
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Demasiadas solicitudes. Por favor espera antes de intentar de nuevo.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const parsed = ContactLawyerSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error?.issues?.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    return res.status(400).json({ error: 'Validation failed', details: msg });
  }

  const { nombre, email, empresa, desc, country, salary, startDate, endDate, termType, total, files } = parsed.data;

  try {
    await sendLawyerInquiry({ nombre, email, empresa, desc, country, salary, startDate, endDate, termType, total, files });
    res.json({ ok: true });
  } catch (err) {
    console.error('contact-lawyer sendLawyerInquiry failed:', err.message);
    captureError(err, { route: 'contact-lawyer', country });
    res.status(500).json({ error: 'No se pudo enviar la solicitud. Por favor intenta de nuevo.' });
  }
};
