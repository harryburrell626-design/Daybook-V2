// Tiny .env loader (no dependency). Real environment variables win over the file.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

// ── Hosted mode (e.g. Render + Neon): one admin connection string + one secret is all that's needed ──
if (process.env.ADMIN_DATABASE_URL) {
  const crypto = require('crypto');
  const u = new URL(process.env.ADMIN_DATABASE_URL);
  process.env.DB_HOST ||= u.hostname;
  process.env.DB_PORT ||= u.port || '5432';
  process.env.DB_NAME ||= decodeURIComponent(u.pathname.slice(1)) || 'postgres';
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) process.env.DB_SSL ||= '1';
  // Poolers such as Supabase's identify the project by a suffix on the user name (postgres.<ref>); custom roles need the same suffix
  if (u.username.includes('.')) process.env.DB_USER_SUFFIX ||= '.' + u.username.split('.').slice(1).join('.');
  // Supabase's pooler certificate isn't signed by a CA that Node trusts by default: connection stays encrypted but the server isn't verified
  if (/supabase\.(com|co)$/.test(u.hostname)) process.env.DB_SSL_NOVERIFY ||= '1';
  process.env.DB_POOL_APP ||= '5'; process.env.DB_POOL_AUTH ||= '3';
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) { console.error('APP_SECRET (16+ characters) is required when ADMIN_DATABASE_URL is set.'); process.exit(1); }
  const derive = (label) => crypto.createHmac('sha256', secret).update('daybook-db:' + label).digest('base64url');
  process.env.DB_APP_PASSWORD ||= derive('app');
  process.env.DB_AUTH_PASSWORD ||= derive('auth');
  process.env.APP_URL ||= process.env.RENDER_EXTERNAL_URL || '';
}
