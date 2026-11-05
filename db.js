require('./env');
const { Pool, types } = require('pg');

// DATE -> 'YYYY-MM-DD' string (never a JS Date, which would shift with timezones); NUMERIC -> number
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));

const base = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'daybook',
  max: 10,
  ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: process.env.DB_SSL_NOVERIFY !== '1' } : undefined,
};
if (!process.env.DB_APP_PASSWORD || !process.env.DB_AUTH_PASSWORD) {
  console.error('DB_APP_PASSWORD / DB_AUTH_PASSWORD are not set. Copy .env.example to .env and run scripts/setup-db.js');
  process.exit(1);
}

// Data role: subject to row level security. Cannot read users/sessions at all.
const SUF = process.env.DB_USER_SUFFIX || '';
const appPool = new Pool({ ...base, user: 'daybook_app' + SUF, password: process.env.DB_APP_PASSWORD, max: Number(process.env.DB_POOL_APP || 10) });
// Auth role: can only touch users / sessions / password_resets. Cannot read any user data.
const authPool = new Pool({ ...base, user: 'daybook_auth' + SUF, password: process.env.DB_AUTH_PASSWORD, max: Number(process.env.DB_POOL_AUTH || 5) });

appPool.on('error', (e) => console.error('pg app pool', e.message));
authPool.on('error', (e) => console.error('pg auth pool', e.message));

// Run fn inside a transaction in which Postgres RLS sees `app.user_id = userId`.
// set_config(..., true) is transaction-local, so the setting can never leak to another request on a pooled connection.
async function withUser(userId, fn) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw new Error('bad user id');
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { appPool, authPool, withUser };
