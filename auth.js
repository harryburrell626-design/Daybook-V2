const crypto = require('crypto');
const { authPool, withUser } = require('./db');
const { sendResetEmail } = require('./mail');
const demo = require('./demo');
const V = require('./validate');

const COOKIE = 'daybook_sid';
const SESSION_DAYS = 30;
const PROD = process.env.NODE_ENV === 'production';

// ── password hashing: scrypt with per-password random salt ──
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const scrypt = (pw, salt, len = 64, o = SCRYPT) => new Promise((res, rej) => crypto.scrypt(pw, salt, len, o, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(got, expected);
}
let DUMMY; // used so that unknown emails cost the same time as wrong passwords
const dummyHash = async () => (DUMMY ||= await hashPassword('dummy-password-for-timing'));

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

// ── tiny in-memory rate limiter ──
const hits = new Map();
function limited(key, max, windowMs) {
  if (!PROD && process.env.RATE_LIMIT_DISABLED === '1') return false; // test runs only; ignored in production
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return arr.length > max;
}
const tooMany = (res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

function parseCookies(h) {
  const o = {};
  for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return o;
}
function setCookie(res, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (PROD) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
const clearCookie = (res) => setCookie(res, '', 0);

async function createSession(res, userId) {
  const token = newToken();
  await authPool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)", [sha(token), userId, String(SESSION_DAYS)]);
  setCookie(res, token, SESSION_DAYS * 86400);
}

// Middleware: attaches req.user or 401
async function requireUser(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const { rows } = await authPool.query(
      `SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha(token)]);
    if (!rows[0]) { clearCookie(res); return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
    req.user = { id: rows[0].id, email: rows[0].email };
    req.sessionHash = sha(token);
    // sliding expiry (refresh at most about once a day)
    if (new Date(rows[0].expires_at) < new Date(Date.now() + (SESSION_DAYS - 1) * 86400e3)) {
      await authPool.query("UPDATE sessions SET expires_at = now() + ($2 || ' days')::interval WHERE token_hash=$1", [req.sessionHash, String(SESSION_DAYS)]);
      setCookie(res, token, SESSION_DAYS * 86400);
    }
    next();
  } catch (e) { next(e); }
}

const emailOk = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function passwordProblem(pw) {
  if (typeof pw !== 'string') return 'Password is required.';
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  return null;
}

function register(app) {
  const ip = (req) => req.ip || 'x';

  app.post('/api/auth/signup', async (req, res, next) => {
    try {
      if (limited('signup|' + ip(req), 10, 3600e3)) return tooMany(res);
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      const pp = passwordProblem(req.body.password);
      if (pp) return res.status(400).json({ error: pp });
      const hash = await hashPassword(req.body.password);
      let user;
      try {
        user = (await authPool.query('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id, email', [email, hash])).rows[0];
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
        throw e;
      }
      const today = demo.pickToday(req.body.today);
      await withUser(user.id, async (c) => {
        await c.query('INSERT INTO settings (user_id, display_name) VALUES ($1, $2)', [user.id, V.str(req.body.name, { max: 60 })]);
        if (req.body.demo !== false) await demo.seed(c, user.id, today);
      });
      await createSession(res, user.id);
      res.status(201).json({ user });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (limited('login-ip|' + ip(req), 30, 15 * 60e3) || limited('login-em|' + email, 8, 15 * 60e3)) return tooMany(res);
      const { rows } = await authPool.query('SELECT id, email, password_hash FROM users WHERE lower(email) = $1', [email]);
      const u = rows[0];
      const ok = await verifyPassword(String(req.body.password || ''), u ? u.password_hash : await dummyHash());
      if (!u || !ok) return res.status(401).json({ error: 'That email and password don’t match.' });
      await createSession(res, u.id);
      res.json({ user: { id: u.id, email: u.email } });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE];
      if (token) await authPool.query('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);
      clearCookie(res);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

  app.post('/api/auth/forgot', async (req, res, next) => {
    try {
      if (limited('forgot|' + ip(req), 10, 3600e3)) return tooMany(res);
      const email = String(req.body.email || '').trim().toLowerCase();
      const out = { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
      if (emailOk(email)) {
        const { rows } = await authPool.query('SELECT id FROM users WHERE lower(email)=$1', [email]);
        if (rows[0]) {
          const token = newToken();
          await authPool.query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [sha(token), rows[0].id]);
          const link = `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/#/reset?token=${token}`;
          const sent = await sendResetEmail(email, link).catch((e) => { console.error('mail error', e.message); return false; });
          if (!sent && !PROD && process.env.DEV_SHOW_RESET_LINK === '1') out.devLink = link; // local development only
        }
      }
      res.json(out);
    } catch (e) { next(e); }
  });

  app.post('/api/auth/reset', async (req, res, next) => {
    try {
      if (limited('reset|' + ip(req), 20, 3600e3)) return tooMany(res);
      const pp = passwordProblem(req.body.password);
      if (pp) return res.status(400).json({ error: pp });
      const token = String(req.body.token || '');
      const hash = await hashPassword(req.body.password);
      const { rows } = await authPool.query(
        `UPDATE password_resets SET used_at = now()
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [sha(token)]);
      if (!rows[0]) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
      await authPool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [rows[0].user_id, hash]);
      await authPool.query('DELETE FROM sessions WHERE user_id=$1', [rows[0].user_id]); // sign out everywhere
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/change-password', requireUser, async (req, res, next) => {
    try {
      if (limited('chpw|' + req.user.id, 10, 3600e3)) return tooMany(res);
      const pp = passwordProblem(req.body.newPassword);
      if (pp) return res.status(400).json({ error: pp });
      const { rows } = await authPool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      if (!(await verifyPassword(String(req.body.currentPassword || ''), rows[0].password_hash))) return res.status(401).json({ error: 'Current password is incorrect.' });
      await authPool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await hashPassword(req.body.newPassword)]);
      await authPool.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user.id, req.sessionHash]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/delete-account', requireUser, async (req, res, next) => {
    try {
      if (limited('delacc|' + req.user.id, 5, 3600e3)) return tooMany(res);
      const { rows } = await authPool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      if (!(await verifyPassword(String(req.body.password || ''), rows[0].password_hash))) return res.status(401).json({ error: 'Password is incorrect.' });
      await authPool.query('DELETE FROM users WHERE id=$1', [req.user.id]); // cascades to every table
      clearCookie(res);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}

module.exports = { register, requireUser, hashPassword, verifyPassword };
