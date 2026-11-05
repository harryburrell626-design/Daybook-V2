// Date maths for recurring rules (fixed income, bills). Dates are plain YYYY-MM-DD strings, calculated in UTC.
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const DAYS = { weekly: 7, fortnightly: 14, four_weekly: 28 };

// n-th occurrence (0 = the start date). Monthly rules on the 29th–31st fall on the last day of shorter months.
function occurrence(start, freq, n) {
  const [y, m, day] = start.split('-').map(Number);
  if (DAYS[freq]) { const d = new Date(Date.UTC(y, m - 1, day + DAYS[freq] * n)); return fmt(d); }
  const total = (m - 1) + MONTHS[freq] * n, ty = y + Math.floor(total / 12), tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(ty, tm, Math.min(day, last))));
}
// How many occurrences fall on or before `until`
function countUpTo(start, freq, until) {
  let n = 0;
  while (n < 5000 && occurrence(start, freq, n) <= until) n++;
  return n;
}

// Post a transaction for every occurrence that has fallen due. Idempotent: `generated` records how many were posted.
async function materialize(c, userId, today) {
  const { rows } = await c.query('SELECT id, type, amount, category, description, notes, frequency, start_date, end_date, generated FROM recurring WHERE active');
  for (const r of rows) {
    const out = []; let n = r.generated;
    while (out.length < 1500) {
      const d = occurrence(r.start_date, r.frequency, n);
      if (d > today || (r.end_date && d > r.end_date)) break;
      out.push(d); n++;
    }
    if (!out.length) continue;
    await c.query(
      `INSERT INTO transactions (user_id, date, type, amount, category, description, notes, recurring_id)
       SELECT $1, d, $2, $3, $4, $5, $6, $7 FROM unnest($8::date[]) AS x(d)`,
      [userId, r.type, r.amount, r.category, r.description, r.notes, r.id, out]);
    await c.query('UPDATE recurring SET generated = $2 WHERE id = $1', [r.id, n]);
  }
}
module.exports = { occurrence, countUpTo, materialize };
