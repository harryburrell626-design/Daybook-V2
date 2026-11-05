// Run with the server up:  node tests/security.test.js
// Checks authentication, per-user isolation (API + database row-level security), reset flow, backup/restore.
require('../server/env');
const { Client } = require('pg');
const fs = require('fs');
const BASE = process.env.TEST_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };

function client() {
  let cookie = '';
  return async (method, path, body, { csrf = true, raw } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-daybook'] = '1';
    let payload;
    if (raw) { payload = raw; headers['content-type'] = 'image/jpeg'; } else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.endsWith('=')) cookie = ''; else cookie = kv; }
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : null, res };
  };
}
const uniq = () => `t${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
const PW = 'correct-horse-battery';
const jpeg = fs.existsSync('/tmp/test.jpg') ? fs.readFileSync('/tmp/test.jpg') : Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

(async () => {
  const A = client(), B = client(), anon = client();
  const ea = uniq(), eb = uniq();

  console.log('Authentication');
  ok((await anon('GET', '/api/data')).status === 401, 'data requires login');
  ok((await anon('GET', '/api/photos/00000000-0000-0000-0000-000000000000')).status === 401, 'photos require login');
  ok((await anon('POST', '/api/auth/signup', { email: 'bad', password: PW })).status === 400, 'invalid email rejected');
  ok((await anon('POST', '/api/auth/signup', { email: uniq(), password: 'short' })).status === 400, 'short password rejected');
  ok((await anon('POST', '/api/auth/login', { email: ea, password: PW }, { csrf: false })).status === 403, 'CSRF header required on POST');
  ok((await A('POST', '/api/auth/signup', { email: ea, password: PW, demo: false })).status === 201, 'signup A');
  ok((await B('POST', '/api/auth/signup', { email: eb, password: PW, demo: true, today: new Date().toISOString().slice(0, 10) })).status === 201, 'signup B (with demo data)');
  ok((await anon('POST', '/api/auth/signup', { email: ea, password: PW })).status === 409, 'duplicate email rejected');
  ok((await anon('POST', '/api/auth/login', { email: ea, password: 'wrong-password-123' })).status === 401, 'wrong password rejected');
  const bad = await anon('POST', '/api/auth/login', { email: 'nobody@example.com', password: PW });
  ok(bad.status === 401 && bad.body.error === (await anon('POST', '/api/auth/login', { email: ea, password: 'nope-nope-nope' })).body.error, 'same error for unknown email and wrong password');

  console.log('Isolation between users (API)');
  const tx = (await A('POST', '/api/transactions', { type: 'expense', amount: 12, category: 'Eating out', date: '2026-11-05', description: 'A-secret-lunch' })).body;
  const pot = (await A('POST', '/api/pots', { name: 'A-secret-pot', target: 100 })).body;
  const ph = (await A('POST', '/api/photos', undefined, { raw: jpeg })).body;
  ok(!!tx.id && !!pot.id && !!ph.id, 'A created transaction, pot and photo');
  await A('PUT', '/api/logs/2026-11-05', { reflection: 'A-secret-diary', photo_id: ph.id, completed: true });
  const dataB = JSON.stringify((await B('GET', '/api/data')).body);
  ok(!/A-secret/.test(dataB), 'B’s data contains nothing of A’s');
  ok((await B('PUT', `/api/transactions/${tx.id}`, { type: 'expense', amount: 1, category: 'Eating out', date: '2026-11-05', description: 'hacked' })).status === 404, 'B cannot edit A’s transaction');
  ok((await B('DELETE', `/api/transactions/${tx.id}`)).status === 404, 'B cannot delete A’s transaction');
  ok((await B('DELETE', `/api/pots/${pot.id}`)).status === 404, 'B cannot delete A’s pot');
  ok((await B('POST', `/api/pots/${pot.id}/moves`, { amount: 5, date: '2026-11-05' })).status === 404, 'B cannot deposit into A’s pot');
  ok((await B('GET', `/api/photos/${ph.id}`)).status === 404, 'B cannot read A’s photo');
  ok((await A('GET', `/api/photos/${ph.id}`)).status === 200, 'A can read own photo');
  ok((await B('PUT', '/api/logs/2026-11-05', { reflection: 'x', photo_id: ph.id })).status === 400, 'B cannot attach A’s photo to a log');
  const aAfter = (await A('GET', '/api/data')).body;
  ok(aAfter.transactions.find((t) => t.id === tx.id)?.description === 'A-secret-lunch', 'A’s transaction untouched');
  ok(aAfter.logs.length === 1 && aAfter.logs[0].photo_id === ph.id, 'A’s log and photo intact');

  console.log('Validation');
  ok((await A('POST', '/api/transactions', { type: 'expense', amount: -5, category: 'Groceries', date: '2026-11-05' })).status === 400, 'negative amount rejected');
  ok((await A('POST', '/api/transactions', { type: 'expense', amount: 5, category: 'Salary', date: '2026-11-05' })).status === 400, 'income category on expense rejected');
  ok((await A('POST', '/api/transactions', { type: 'expense', amount: 5, category: 'Groceries', date: '2026-02-31' })).status === 400, 'impossible date rejected');
  ok((await A('PUT', '/api/logs/2026-11-05', { ratings: { happiness: 11 } })).status === 400, 'rating out of range rejected');
  ok((await A('POST', '/api/photos', undefined, { raw: Buffer.from('<svg onload=alert(1)>') })).status === 415, 'non-image upload rejected');
  const xss = (await A('POST', '/api/transactions', { type: 'expense', amount: 1, category: 'Groceries', date: '2026-11-05', description: '<img src=x onerror=alert(1)>' })).body;
  ok(xss.description.includes('<img'), 'markup stored as plain text (rendered safely by the UI)');

  console.log('Database-level row security');
  const base = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME || 'daybook' };
  const app = new Client({ ...base, user: 'daybook_app', password: process.env.DB_APP_PASSWORD }); await app.connect();
  const auth = new Client({ ...base, user: 'daybook_auth', password: process.env.DB_AUTH_PASSWORD }); await auth.connect();
  ok((await app.query('SELECT count(*) FROM transactions')).rows[0].count === '0', 'no user context → zero transactions visible');
  ok((await app.query('SELECT count(*) FROM daily_logs')).rows[0].count === '0', 'no user context → zero daily logs visible');
  ok((await app.query('SELECT count(*) FROM photos')).rows[0].count === '0', 'no user context → zero photos visible');
  const idA = (await auth.query('SELECT id FROM users WHERE lower(email)=$1', [ea.toLowerCase()])).rows[0].id;
  const idB = (await auth.query('SELECT id FROM users WHERE lower(email)=$1', [eb.toLowerCase()])).rows[0].id;
  await app.query('BEGIN'); await app.query("SELECT set_config('app.user_id',$1,true)", [idB]);
  ok((await app.query("SELECT count(*) FROM transactions WHERE description LIKE 'A-secret%'")).rows[0].count === '0', 'as user B, A’s rows are invisible');
  let blocked = false; try { await app.query("INSERT INTO transactions (user_id,date,type,amount,category) VALUES ($1,'2026-11-05','expense',1,'Groceries')", [idA]); } catch (e) { blocked = e.code === '42501'; }
  ok(blocked, 'as user B, inserting a row owned by A is blocked');
  await app.query('ROLLBACK');
  await app.query('BEGIN'); await app.query("SELECT set_config('app.user_id',$1,true)", [idB]);
  ok((await app.query("UPDATE transactions SET description='x' WHERE user_id=$1", [idA])).rowCount === 0, 'as user B, updating A’s rows affects nothing');
  ok((await app.query('DELETE FROM photos WHERE user_id=$1', [idA])).rowCount === 0, 'as user B, deleting A’s photos affects nothing');
  await app.query('ROLLBACK');
  let denied = false; try { await app.query('SELECT * FROM users'); } catch (e) { denied = e.code === '42501'; }
  ok(denied, 'data role cannot read the users table');
  denied = false; try { await app.query('SELECT * FROM sessions'); } catch (e) { denied = e.code === '42501'; }
  ok(denied, 'data role cannot read sessions');
  denied = false; try { await auth.query('SELECT * FROM transactions'); } catch (e) { denied = e.code === '42501'; }
  ok(denied, 'auth role cannot read any user data');
  const hashRow = (await auth.query('SELECT password_hash FROM users WHERE id=$1', [idA])).rows[0].password_hash;
  ok(/^scrypt\$32768\$8\$1\$/.test(hashRow) && !hashRow.includes(PW), 'password stored as salted scrypt hash');
  const sess = (await auth.query('SELECT token_hash FROM sessions WHERE user_id=$1', [idA])).rows[0].token_hash;
  ok(/^[0-9a-f]{64}$/.test(sess), 'session tokens stored hashed');

  const rls = (await auth.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','sessions','password_resets')")).rows;
  ok(rls.length === 3 && rls.every((r) => r.relrowsecurity), 'row security is enabled on the auth tables too');
  const anonExists = process.env.TEST_SUPER_URL ? true : false; void anonExists;

  console.log('Password reset & sessions');
  await A('POST', '/api/auth/logout');
  ok((await A('GET', '/api/data')).status === 401, 'logout ends the session');
  const L = client(); await L('POST', '/api/auth/login', { email: ea, password: PW });
  ok((await L('GET', '/api/auth/me')).status === 200, 'login works');
  const f = await anon('POST', '/api/auth/forgot', { email: ea });
  ok(f.status === 200 && !!f.body.devLink, 'forgot password returns a link (dev mode)');
  const unknown = await anon('POST', '/api/auth/forgot', { email: 'nobody-here@example.com' });
  ok(unknown.status === 200 && !unknown.body.devLink && unknown.body.message === f.body.message, 'unknown email gets the same response (no account enumeration)');
  const token = new URL(f.body.devLink.replace('/#/', '/')).searchParams.get('token');
  ok((await anon('POST', '/api/auth/reset', { token: 'bogus', password: 'new-password-123' })).status === 400, 'bad reset token rejected');
  ok((await anon('POST', '/api/auth/reset', { token, password: 'new-password-123' })).status === 200, 'reset with valid token');
  ok((await anon('POST', '/api/auth/reset', { token, password: 'another-password-1' })).status === 400, 'reset token is single-use');
  ok((await L('GET', '/api/auth/me')).status === 401, 'reset signs out existing sessions');
  const L2 = client();
  ok((await L2('POST', '/api/auth/login', { email: ea, password: 'new-password-123' })).status === 200, 'login with new password');

  console.log('Backup & restore');
  const exp = (await L2('GET', '/api/export')).body;
  ok(exp.app === 'daybook' && exp.transactions.length === 2 && exp.photos.length === 1, 'export contains the records and photo');
  const C = client(); await C('POST', '/api/auth/signup', { email: uniq(), password: PW, demo: false });
  const imp = await C('POST', '/api/import', { data: exp });
  ok(imp.status === 200 && imp.body.counts.transactions === 2, 'restore into a fresh account');
  const dC = (await C('GET', '/api/data')).body;
  ok(dC.logs.length === 1 && dC.logs[0].photo_id && dC.logs[0].photo_id !== ph.id, 'restored log has a photo with a new id');
  ok((await C('GET', `/api/photos/${dC.logs[0].photo_id}`)).status === 200, 'restored photo is readable');
  ok((await C('POST', '/api/import', { data: { app: 'other' } })).status === 400, 'foreign file rejected');
  const csv = await fetch(BASE + '/api/export/transactions.csv', { headers: { cookie: 'x' } });
  ok(csv.status === 401, 'CSV export requires login');

  console.log('Account deletion');
  ok((await C('POST', '/api/auth/delete-account', { password: 'wrong-password-123' })).status === 401, 'deletion requires the password');
  ok((await C('POST', '/api/auth/delete-account', { password: PW })).status === 200, 'account deleted');
  const left = await app.query('SELECT 1'); void left;
  await app.end(); await auth.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
