// Database setup. Idempotent: safe to run on every start.
//  - local mode  (scripts/setup-db.js): needs a superuser URL, creates the database, the 3 roles and the schema
//  - hosted mode (ADMIN_DATABASE_URL):  the database already exists (Neon etc.); creates the 2 runtime roles and applies the schema
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const SCHEMA = () => fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const sslOpt = () => (process.env.DB_SSL === '1' ? { rejectUnauthorized: process.env.DB_SSL_NOVERIFY !== '1' } : undefined);

async function ensureRole(c, name, pw) {
  const exists = (await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount;
  const verb = exists ? 'ALTER' : 'CREATE';
  const sql = (await c.query(`SELECT format('${verb} ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', $1::text, $2::text) AS s`, [name, pw])).rows[0].s;
  await c.query(sql);
}

async function setupHosted() {
  const u = new URL(process.env.ADMIN_DATABASE_URL);
  const c = new Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.slice(1)) || 'postgres', ssl: sslOpt() });
  await c.connect();
  try {
    await ensureRole(c, 'daybook_app', process.env.DB_APP_PASSWORD);
    await ensureRole(c, 'daybook_auth', process.env.DB_AUTH_PASSWORD);
    try { await c.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch { /* gen_random_uuid() is built in on PostgreSQL 13+ */ }
    // the schema file mentions the local-mode owner role in a comment only; it needs no extra role here
    await c.query(SCHEMA());
  } finally { await c.end(); }
  console.log('Database ready (hosted mode).');
}

async function setupLocal() {
  const must = (k) => { if (!process.env[k]) { console.error(`Missing ${k}`); process.exit(1); } return process.env[k]; };
  const superUrl = must('PG_SUPERUSER_URL'), dbName = process.env.DB_NAME || 'daybook';
  const ownerPw = must('DB_OWNER_PASSWORD'), appPw = must('DB_APP_PASSWORD'), authPw = must('DB_AUTH_PASSWORD');
  const su = new Client({ connectionString: superUrl }); await su.connect();
  const roleSql = async (name, pw) => ensureRole(su, name, pw);
  await roleSql('daybook_owner', ownerPw); await roleSql('daybook_app', appPw); await roleSql('daybook_auth', authPw);
  if (!(await su.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) await su.query(`CREATE DATABASE "${dbName}" OWNER daybook_owner`);
  await su.end();
  const u = new URL(superUrl); u.pathname = '/' + dbName;
  const su2 = new Client({ connectionString: u.toString() }); await su2.connect();
  await su2.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); await su2.query('GRANT ALL ON SCHEMA public TO daybook_owner'); await su2.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await su2.end();
  const ou = new URL(superUrl); ou.pathname = '/' + dbName; ou.username = 'daybook_owner'; ou.password = ownerPw;
  const owner = new Client({ connectionString: ou.toString() }); await owner.connect(); await owner.query(SCHEMA()); await owner.end();
  console.log(`Database "${dbName}" ready (roles: daybook_owner, daybook_app, daybook_auth).`);
}
module.exports = { setupHosted, setupLocal };
