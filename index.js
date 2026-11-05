require('./env');
const express = require('express');
const path = require('path');
const auth = require('./auth');
const routes = require('./routes');
const { ValidationError } = require('./validate');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
app.disable('x-powered-by');
if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '0') app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// ── security headers ──
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ── CSRF defence for state-changing requests: custom header (forces a CORS preflight that we never grant) + Origin check ──
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-daybook') !== '1') return res.status(403).json({ error: 'Forbidden' });
  const origin = req.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Forbidden' }); } catch { return res.status(403).json({ error: 'Forbidden' }); } }
  next();
});

// JSON parser (photos use their own raw parser, so skip those). Backups can be large (photos are base64).
const jsonSmall = express.json({ limit: '1mb' });
const jsonBig = express.json({ limit: '80mb' });
app.use((req, res, next) => {
  if (req.path === '/api/photos' && req.method === 'POST') return next();
  return (req.path === '/api/import' ? jsonBig : jsonSmall)(req, res, next);
});

app.get('/healthz', (req, res) => res.json({ ok: true }));
auth.register(app);
routes.register(app);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ── static frontend ──
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: PROD ? '1h' : 0, etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ── errors: never leak internals ──
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ValidationError || err.status === 400) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err.status === 409) return res.status(409).json({ error: err.message });
  const code = err.code;
  if (code === '23503') return res.status(400).json({ error: 'That refers to something that does not exist.' });
  if (code === '23505') return res.status(409).json({ error: 'That already exists.' });
  if (code === '22P02' || code === '23514' || code === '22007' || code === '22003') return res.status(400).json({ error: 'Invalid value.' });
  console.error('[error]', req.method, req.path, err.message);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const port = Number(process.env.PORT || 3000);
(async () => {
  if (process.env.ADMIN_DATABASE_URL) await require('./setup').setupHosted(); // hosted: creates roles + tables on every start (idempotent)
  app.listen(port, () => console.log(`Daybook running on port ${port}`));
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
