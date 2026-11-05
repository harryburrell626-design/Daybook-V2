#!/usr/bin/env node
// Local setup:  PG_SUPERUSER_URL=... node scripts/setup-db.js   (hosted mode sets itself up on start)
require('../server/env');
const { setupLocal, setupHosted } = require('../server/setup');
(process.env.ADMIN_DATABASE_URL ? setupHosted() : setupLocal()).catch((e) => { console.error(e); process.exit(1); });
