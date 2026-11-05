const express = require('express');
const V = require('./validate');
const demo = require('./demo');
const Rec = require('./recurring');
const { requireUser, verifyPassword } = require('./auth');

const LOG_COLS = 'date, reflection, prompts, ratings, sleep, screen, activities, culture, photo_id, completed, completed_at, demo, updated_at';
const uuidParam = (v) => V.uuid(v);

const magic = (b) => {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.slice(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
};

function register(app) {
  const r = express.Router();
  r.use(requireUser);
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const db = (req, fn) => require('./db').withUser(req.user.id, fn);
  const uid = (req) => req.user.id;

  // ───────── everything the app needs, in one go (photo bytes are fetched separately) ─────────
  r.get('/data', wrap(async (req, res) => {
    const today = demo.pickToday(req.query.today);
    const out = await db(req, async (c) => {
      await Rec.materialize(c, uid(req), today);
      await c.query(`DELETE FROM photos p WHERE p.created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM daily_logs l WHERE l.photo_id = p.id)`);
      const q = async (sql) => (await c.query(sql)).rows;
      return {
        settings: (await q('SELECT display_name, currency, starting_balance, has_demo FROM settings'))[0],
        transactions: await q('SELECT id, date, type, amount, category, description, notes, recurring_id, demo FROM transactions ORDER BY date DESC, created_at DESC'),
        recurring: await q('SELECT id, type, amount, category, description, notes, frequency, start_date, end_date, generated, active, demo FROM recurring ORDER BY type DESC, amount DESC'),
        pots: await q('SELECT id, name, target, opening_balance, demo FROM pots ORDER BY created_at'),
        potMoves: await q('SELECT id, pot_id, date, amount, note FROM pot_moves ORDER BY date DESC, id'),
        holdings: await q('SELECT id, side, kind, name, value, notes, demo FROM holdings ORDER BY side, value DESC'),
        budgets: await q('SELECT id, category, amount FROM budgets ORDER BY category'),
        logs: await q(`SELECT ${LOG_COLS} FROM daily_logs ORDER BY date DESC`),
      };
    });
    res.set('Cache-Control', 'no-store').json(out);
  }));

  // ───────── settings ─────────
  r.put('/settings', wrap(async (req, res) => {
    const s = V.settings(req.body);
    const keys = Object.keys(s);
    if (!keys.length) return res.json({});
    const row = await db(req, async (c) => (await c.query(
      `UPDATE settings SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')} WHERE user_id=$${keys.length + 1} RETURNING display_name, currency, starting_balance, has_demo`,
      [...keys.map((k) => s[k]), uid(req)])).rows[0]);
    res.json(row);
  }));

  // ───────── transactions ─────────
  const TX = 'id, date, type, amount, category, description, notes, recurring_id, demo';
  r.post('/transactions', wrap(async (req, res) => {
    const t = V.transaction(req.body);
    const row = await db(req, async (c) => (await c.query(
      `INSERT INTO transactions (user_id,date,type,amount,category,description,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${TX}`,
      [uid(req), t.date, t.type, t.amount, t.category, t.description, t.notes])).rows[0]);
    res.status(201).json(row);
  }));
  r.put('/transactions/:id', wrap(async (req, res) => {
    const t = V.transaction(req.body);
    const row = await db(req, async (c) => (await c.query(
      `UPDATE transactions SET date=$2,type=$3,amount=$4,category=$5,description=$6,notes=$7,updated_at=now() WHERE id=$1 RETURNING ${TX}`,
      [uuidParam(req.params.id), t.date, t.type, t.amount, t.category, t.description, t.notes])).rows[0]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));
  r.delete('/transactions/:id', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM transactions WHERE id=$1', [uuidParam(req.params.id)])).rowCount);
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── recurring income & bills ─────────
  const REC = 'id, type, amount, category, description, notes, frequency, start_date, end_date, generated, active, demo';
  r.post('/recurring', wrap(async (req, res) => {
    const x = V.recurring(req.body);
    const today = demo.pickToday(req.body.today);
    await db(req, async (c) => {
      await c.query('INSERT INTO recurring (user_id,type,amount,category,description,notes,frequency,start_date,end_date,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [uid(req), x.type, x.amount, x.category, x.description, x.notes, x.frequency, x.start_date, x.end_date, x.active]);
      await Rec.materialize(c, uid(req), today);
    });
    res.status(201).json({ ok: true });
  }));
  r.put('/recurring/:id', wrap(async (req, res) => {
    const x = V.recurring(req.body); const id = uuidParam(req.params.id);
    const today = demo.pickToday(req.body.today);
    const found = await db(req, async (c) => {
      const old = (await c.query('SELECT frequency, start_date FROM recurring WHERE id=$1', [id])).rows[0];
      if (!old) return false;
      // changing the schedule restarts counting from today (no back-filling); other edits keep the count
      const gen = old.frequency !== x.frequency || old.start_date !== x.start_date ? Rec.countUpTo(x.start_date, x.frequency, today) : null;
      await c.query(`UPDATE recurring SET type=$2,amount=$3,category=$4,description=$5,notes=$6,frequency=$7,start_date=$8,end_date=$9,active=$10,demo=false${gen != null ? ',generated=' + gen : ''} WHERE id=$1`,
        [id, x.type, x.amount, x.category, x.description, x.notes, x.frequency, x.start_date, x.end_date, x.active]);
      await Rec.materialize(c, uid(req), today);
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }));
  r.delete('/recurring/:id', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM recurring WHERE id=$1', [uuidParam(req.params.id)])).rowCount); // transactions already posted are kept
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── savings pots ─────────
  r.post('/pots', wrap(async (req, res) => {
    const p = V.pot(req.body);
    const row = await db(req, async (c) => (await c.query('INSERT INTO pots (user_id,name,target,opening_balance) VALUES ($1,$2,$3,$4) RETURNING id,name,target,opening_balance,demo', [uid(req), p.name, p.target, p.opening_balance])).rows[0]);
    res.status(201).json(row);
  }));
  r.put('/pots/:id', wrap(async (req, res) => {
    const p = V.pot(req.body);
    const row = await db(req, async (c) => (await c.query('UPDATE pots SET name=$2,target=$3,opening_balance=$4 WHERE id=$1 RETURNING id,name,target,opening_balance,demo', [uuidParam(req.params.id), p.name, p.target, p.opening_balance])).rows[0]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));
  r.delete('/pots/:id', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM pots WHERE id=$1', [uuidParam(req.params.id)])).rowCount);
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));
  r.post('/pots/:id/moves', wrap(async (req, res) => {
    const m = V.potMove(req.body);
    const row = await db(req, async (c) => {
      const pot = (await c.query('SELECT opening_balance + COALESCE((SELECT sum(amount) FROM pot_moves WHERE pot_id=pots.id),0) AS bal FROM pots WHERE id=$1', [uuidParam(req.params.id)])).rows[0];
      if (!pot) return null;
      if (m.amount < 0 && pot.bal + m.amount < -0.001) throw new V.ValidationError('That is more than the pot holds.');
      return (await c.query('INSERT INTO pot_moves (user_id,pot_id,date,amount,note) VALUES ($1,$2,$3,$4,$5) RETURNING id,pot_id,date,amount,note', [uid(req), req.params.id, m.date, m.amount, m.note])).rows[0];
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.status(201).json(row);
  }));
  r.delete('/pot-moves/:id', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM pot_moves WHERE id=$1', [uuidParam(req.params.id)])).rowCount);
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── assets & debts ─────────
  const H = 'id, side, kind, name, value, notes, demo';
  r.post('/holdings', wrap(async (req, res) => {
    const h = V.holding(req.body);
    const row = await db(req, async (c) => (await c.query(`INSERT INTO holdings (user_id,side,kind,name,value,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${H}`, [uid(req), h.side, h.kind, h.name, h.value, h.notes])).rows[0]);
    res.status(201).json(row);
  }));
  r.put('/holdings/:id', wrap(async (req, res) => {
    const h = V.holding(req.body);
    const row = await db(req, async (c) => (await c.query(`UPDATE holdings SET side=$2,kind=$3,name=$4,value=$5,notes=$6,updated_at=now() WHERE id=$1 RETURNING ${H}`, [uuidParam(req.params.id), h.side, h.kind, h.name, h.value, h.notes])).rows[0]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));
  r.delete('/holdings/:id', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM holdings WHERE id=$1', [uuidParam(req.params.id)])).rowCount);
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── budgets ─────────
  r.put('/budgets', wrap(async (req, res) => {
    const b = V.budget(req.body.category, req.body.amount);
    const row = await db(req, async (c) => (await c.query(
      'INSERT INTO budgets (user_id,category,amount) VALUES ($1,$2,$3) ON CONFLICT (user_id,category) DO UPDATE SET amount=EXCLUDED.amount, demo=false RETURNING id,category,amount', [uid(req), b.category, b.amount])).rows[0]);
    res.json(row);
  }));
  r.delete('/budgets/:category', wrap(async (req, res) => {
    const n = await db(req, async (c) => (await c.query('DELETE FROM budgets WHERE category=$1', [String(req.params.category)])).rowCount);
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── daily logs ─────────
  r.put('/logs/:date', wrap(async (req, res) => {
    const date = V.date(req.params.date);
    const l = V.log(req.body);
    const row = await db(req, async (c) => {
      const old = (await c.query('SELECT photo_id FROM daily_logs WHERE date=$1', [date])).rows[0];
      const saved = (await c.query(
        `INSERT INTO daily_logs (user_id,date,reflection,prompts,ratings,sleep,screen,activities,culture,photo_id,completed,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 THEN now() END)
         ON CONFLICT (user_id,date) DO UPDATE SET reflection=EXCLUDED.reflection, prompts=EXCLUDED.prompts, ratings=EXCLUDED.ratings,
           sleep=EXCLUDED.sleep, screen=EXCLUDED.screen, activities=EXCLUDED.activities, culture=EXCLUDED.culture, photo_id=EXCLUDED.photo_id,
           completed=EXCLUDED.completed,
           completed_at = CASE WHEN EXCLUDED.completed THEN COALESCE(daily_logs.completed_at, now()) ELSE NULL END,
           demo = false, updated_at=now()
         RETURNING ${LOG_COLS}`,
        [uid(req), date, l.reflection, l.prompts, l.ratings, l.sleep, l.screen, JSON.stringify(l.activities), l.culture, l.photo_id, l.completed])).rows[0];
      if (old?.photo_id && old.photo_id !== l.photo_id) {
        await c.query('DELETE FROM photos p WHERE p.id=$1 AND NOT EXISTS (SELECT 1 FROM daily_logs d WHERE d.photo_id=p.id)', [old.photo_id]);
      }
      return saved;
    });
    res.json(row);
  }));
  r.delete('/logs/:date', wrap(async (req, res) => {
    const date = V.date(req.params.date);
    const n = await db(req, async (c) => {
      const old = (await c.query('DELETE FROM daily_logs WHERE date=$1 RETURNING photo_id', [date])).rows[0];
      if (old?.photo_id) await c.query('DELETE FROM photos WHERE id=$1', [old.photo_id]);
      return old ? 1 : 0;
    });
    res.status(n ? 200 : 404).json({ ok: !!n });
  }));

  // ───────── photos ─────────
  r.post('/photos', express.raw({ type: () => true, limit: '10mb' }), wrap(async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'No image received.' });
    const mime = magic(buf);
    if (!mime) return res.status(415).json({ error: 'Please choose a JPEG, PNG, WebP or GIF image.' });
    const row = await db(req, async (c) => (await c.query('INSERT INTO photos (user_id,mime,data) VALUES ($1,$2,$3) RETURNING id', [uid(req), mime, buf])).rows[0]);
    res.status(201).json(row);
  }));
  r.get('/photos/:id', wrap(async (req, res) => {
    const row = await db(req, async (c) => (await c.query('SELECT mime, data FROM photos WHERE id=$1', [uuidParam(req.params.id)])).rows[0]);
    if (!row) return res.status(404).end();
    res.set({
      'Content-Type': row.mime, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin',
    }).send(row.data);
  }));

  // ───────── demo data ─────────
  r.post('/demo/reset', wrap(async (req, res) => {
    const today = demo.pickToday(req.body?.today);
    await db(req, async (c) => {
      const s = (await c.query('SELECT has_demo FROM settings')).rows[0];
      const real = (await c.query(`SELECT (SELECT count(*) FROM transactions WHERE NOT demo) + (SELECT count(*) FROM daily_logs WHERE NOT demo) + (SELECT count(*) FROM pots WHERE NOT demo) + (SELECT count(*) FROM holdings WHERE NOT demo) AS n`)).rows[0].n;
      if (!s.has_demo && Number(real) > 0) throw Object.assign(new Error('Demo data can only be loaded into an empty account, so it never mixes with your real records.'), { status: 409 });
      await demo.clear(c, uid(req));
      await demo.seed(c, uid(req), today);
    });
    res.json({ ok: true });
  }));
  r.delete('/demo', wrap(async (req, res) => {
    await db(req, (c) => demo.clear(c, uid(req)));
    res.json({ ok: true });
  }));

  // ───────── export / backup / restore ─────────
  r.get('/export', wrap(async (req, res) => {
    const data = await db(req, async (c) => {
      const q = async (sql) => (await c.query(sql)).rows;
      const photos = (await q('SELECT id, mime, data FROM photos')).map((p) => ({ id: p.id, mime: p.mime, base64: p.data.toString('base64') }));
      return {
        app: 'daybook', version: 1, exportedAt: new Date().toISOString(),
        settings: (await q('SELECT display_name, currency, starting_balance FROM settings'))[0],
        transactions: await q('SELECT date, type, amount, category, description, notes FROM transactions ORDER BY date, created_at'),
        recurring: await q('SELECT type, amount, category, description, notes, frequency, start_date, end_date, generated, active FROM recurring'),
        pots: await q('SELECT id, name, target, opening_balance FROM pots ORDER BY created_at'),
        potMoves: await q('SELECT pot_id, date, amount, note FROM pot_moves ORDER BY date'),
        holdings: await q('SELECT side, kind, name, value, notes FROM holdings'),
        budgets: await q('SELECT category, amount FROM budgets'),
        logs: await q('SELECT date, reflection, prompts, ratings, sleep, screen, activities, culture, photo_id, completed FROM daily_logs ORDER BY date'),
        photos,
      };
    });
    res.set({ 'Content-Disposition': `attachment; filename="daybook-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' }).json(data);
  }));

  r.get('/export/transactions.csv', wrap(async (req, res) => {
    const rows = await db(req, async (c) => (await c.query('SELECT date, type, amount, category, description, notes FROM transactions ORDER BY date, created_at')).rows);
    const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; // neutralise spreadsheet formulas
    const csv = ['date,type,amount,category,description,notes', ...rows.map((t) => [t.date, t.type, t.amount.toFixed(2), t.category, t.description, t.notes].map(esc).join(','))].join('\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="daybook-transactions.csv"', 'Cache-Control': 'no-store' }).send(csv);
  }));

  r.post('/import', wrap(async (req, res) => {
    const d = req.body?.data;
    if (!V.isObj(d) || d.app !== 'daybook' || d.version !== 1) throw new V.ValidationError('That file doesn’t look like a Daybook backup.');
    const arr = (x, max, name) => { if (x == null) return []; if (!Array.isArray(x) || x.length > max) throw new V.ValidationError(`Backup has an invalid ${name} list.`); return x; };
    const txs = arr(d.transactions, 200000, 'transactions').map(V.transaction);
    const recs = arr(d.recurring, 500, 'recurring items').map((x) => ({ ...V.recurring(x), generated: V.num(x.generated, { min: 0, max: 100000, int: true }) ?? 0 }));
    const pots = arr(d.pots, 500, 'pots').map((p) => ({ old: V.uuid(p.id, 'pot id'), ...V.pot(p) }));
    const moves = arr(d.potMoves, 50000, 'pot movements').map((m) => ({ pot: V.uuid(m.pot_id, 'pot id'), ...V.potMove(m) }));
    const holds = arr(d.holdings, 2000, 'holdings').map(V.holding);
    const buds = arr(d.budgets, 50, 'budgets').map((b) => V.budget(b.category, b.amount));
    const photos = arr(d.photos, 5000, 'photos').map((p) => {
      const buf = Buffer.from(String(p.base64 || ''), 'base64');
      const mime = magic(buf);
      if (!mime) throw new V.ValidationError('Backup contains an unsupported image.');
      return { old: V.uuid(p.id, 'photo id'), mime, buf };
    });
    const logs = arr(d.logs, 40000, 'daily logs').map((l) => ({ date: V.date(l.date), old: l.photo_id, ...V.log({ ...l, photo_id: null }) }));
    const st = d.settings ? V.settings({ display_name: d.settings.display_name, currency: d.settings.currency, starting_balance: d.settings.starting_balance }) : {};

    await db(req, async (c) => {
      for (const t of ['daily_logs', 'photos', 'pot_moves', 'pots', 'transactions', 'recurring', 'holdings', 'budgets']) await c.query(`DELETE FROM ${t}`);
      const u = uid(req);
      // new ids are generated for everything, so a backup can never collide with (or reveal) anyone else's rows
      const photoMap = new Map();
      for (const p of photos) photoMap.set(p.old, (await c.query('INSERT INTO photos (user_id,mime,data) VALUES ($1,$2,$3) RETURNING id', [u, p.mime, p.buf])).rows[0].id);
      const potMap = new Map();
      for (const p of pots) potMap.set(p.old, (await c.query('INSERT INTO pots (user_id,name,target,opening_balance) VALUES ($1,$2,$3,$4) RETURNING id', [u, p.name, p.target, p.opening_balance])).rows[0].id);
      for (const m of moves) { const id = potMap.get(m.pot); if (id) await c.query('INSERT INTO pot_moves (user_id,pot_id,date,amount,note) VALUES ($1,$2,$3,$4,$5)', [u, id, m.date, m.amount, m.note]); }
      if (txs.length) await c.query(
        `INSERT INTO transactions (user_id,date,type,amount,category,description,notes)
         SELECT $1, d, t, a, c, ds, n FROM unnest($2::date[],$3::text[],$4::numeric[],$5::text[],$6::text[],$7::text[]) AS x(d,t,a,c,ds,n)`,
        [u, txs.map((t) => t.date), txs.map((t) => t.type), txs.map((t) => t.amount), txs.map((t) => t.category), txs.map((t) => t.description), txs.map((t) => t.notes)]);
      for (const x of recs) await c.query('INSERT INTO recurring (user_id,type,amount,category,description,notes,frequency,start_date,end_date,generated,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [u, x.type, x.amount, x.category, x.description, x.notes, x.frequency, x.start_date, x.end_date, x.generated, x.active]);
      for (const h of holds) await c.query('INSERT INTO holdings (user_id,side,kind,name,value,notes) VALUES ($1,$2,$3,$4,$5,$6)', [u, h.side, h.kind, h.name, h.value, h.notes]);
      for (const b of buds) await c.query('INSERT INTO budgets (user_id,category,amount) VALUES ($1,$2,$3) ON CONFLICT (user_id,category) DO UPDATE SET amount=EXCLUDED.amount', [u, b.category, b.amount]);
      for (const l of logs) {
        const photo = l.old && photoMap.get(l.old) ? photoMap.get(l.old) : null;
        await c.query(
          `INSERT INTO daily_logs (user_id,date,reflection,prompts,ratings,sleep,screen,activities,culture,photo_id,completed,completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 THEN now() END) ON CONFLICT (user_id,date) DO NOTHING`,
          [u, l.date, l.reflection, l.prompts, l.ratings, l.sleep, l.screen, JSON.stringify(l.activities), l.culture, photo, l.completed]);
      }
      const keys = Object.keys(st);
      await c.query(`UPDATE settings SET has_demo=false${keys.map((k, i) => `, ${k}=$${i + 2}`).join('')} WHERE user_id=$1`, [u, ...keys.map((k) => st[k])]);
    });
    res.json({ ok: true, counts: { transactions: txs.length, logs: logs.length, pots: pots.length, photos: photos.length } });
  }));

  app.use('/api', r);
}

module.exports = { register };
