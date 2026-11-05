const EXPENSE_CATS = ['Rent & housing', 'Bills', 'Groceries', 'Eating out', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Insurance', 'Subscriptions', 'Debt repayments', 'Other spending'];
const INCOME_CATS = ['Salary', 'Pension & benefits', 'Other income'];
const FREQUENCIES = ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'quarterly', 'yearly'];
const ASSET_KINDS = ['car', 'property', 'investment', 'savings', 'other'];
const DEBT_KINDS = ['loan', 'credit_card', 'other'];
const ACTIVITY_TYPES = ['running', 'cycling', 'walking', 'gym', 'reading', 'cooking', 'studying', 'working', 'socialising', 'film', 'going_out', 'outdoors', 'creative', 'other'];
const RATING_KEYS = ['happiness', 'productivity', 'satisfaction', 'energy', 'social', 'stress', 'enjoyment'];
const PROMPT_KEYS = ['best', 'did', 'interesting', 'remember', 'differently'];
const CULTURE_KEYS = ['song', 'artist', 'film', 'show', 'book', 'quote', 'moment'];

class ValidationError extends Error { constructor(m) { super(m); this.status = 400; } }
const bad = (m) => { throw new ValidationError(m); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function str(v, { max = 200, req = false, name = 'value', trim = true } = {}) {
  if (v == null || v === '') { if (req) bad(`${name} is required`); return ''; }
  if (typeof v !== 'string') bad(`${name} must be text`);
  let s = v.replace(/\u0000/g, '');
  if (trim) s = s.trim();
  if (req && !s) bad(`${name} is required`);
  if (s.length > max) bad(`${name} is too long`);
  return s;
}
function num(v, { min = 0, max = 1e11, name = 'value', int = false, req = false } = {}) {
  if (v == null || v === '') { if (req) bad(`${name} is required`); return null; }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) bad(`${name} must be a number`);
  if (n < min || n > max) bad(`${name} is out of range`);
  if (int && !Number.isInteger(n)) bad(`${name} must be a whole number`);
  return int ? n : Math.round(n * 100) / 100;
}
function date(v, name = 'date') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(`${name} must be YYYY-MM-DD`);
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) bad(`${name} is not a real date`);
  const y = Number(v.slice(0, 4));
  if (y < 1900 || y > 2200) bad(`${name} is out of range`);
  return v;
}
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v, name = 'id') => { if (typeof v !== 'string' || !uuidRe.test(v)) bad(`${name} is invalid`); return v.toLowerCase(); };
const time = (v, name) => { if (v == null || v === '') return ''; if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) bad(`${name} must be HH:MM`); return v; };

function transaction(b) {
  if (!isObj(b)) bad('Invalid transaction');
  const type = b.type;
  if (type !== 'income' && type !== 'expense') bad('type must be income or expense');
  const category = str(b.category, { req: true, name: 'category' });
  if (!(type === 'income' ? INCOME_CATS : EXPENSE_CATS).includes(category)) bad('Unknown category for this type');
  const amount = num(b.amount, { min: 0.01, max: 1e9, req: true, name: 'amount' });
  return {
    date: date(b.date), type, amount, category,
    description: str(b.description, { max: 200, name: 'description' }),
    notes: str(b.notes, { max: 2000, name: 'notes', trim: false }),
  };
}
function recurring(b) {
  const t = transaction({ ...b, date: b.start_date });
  const frequency = b.frequency;
  if (!FREQUENCIES.includes(frequency)) bad('Choose how often it repeats');
  const end = b.end_date ? date(b.end_date, 'end date') : null;
  if (end && end < t.date) bad('The end date is before the start date');
  return { type: t.type, amount: t.amount, category: t.category, description: t.description, notes: t.notes, frequency, start_date: t.date, end_date: end, active: b.active !== false };
}
function pot(b) {
  if (!isObj(b)) bad('Invalid pot');
  return {
    name: str(b.name, { req: true, max: 80, name: 'name' }),
    target: num(b.target ?? 0, { max: 1e9, name: 'target' }) ?? 0,
    opening_balance: num(b.opening_balance ?? 0, { max: 1e9, name: 'opening balance' }) ?? 0,
  };
}
function potMove(b) {
  if (!isObj(b)) bad('Invalid movement');
  const amt = num(b.amount, { min: -1e9, max: 1e9, req: true, name: 'amount' });
  if (!amt) bad('amount cannot be zero');
  return { date: date(b.date), amount: amt, note: str(b.note, { max: 200, name: 'note' }) };
}
function holding(b) {
  if (!isObj(b)) bad('Invalid item');
  const side = b.side;
  if (side !== 'asset' && side !== 'debt') bad('side must be asset or debt');
  const kind = str(b.kind, { req: true, name: 'kind' });
  if (!(side === 'asset' ? ASSET_KINDS : DEBT_KINDS).includes(kind)) bad('Unknown kind');
  return {
    side, kind,
    name: str(b.name, { req: true, max: 100, name: 'name' }),
    value: num(b.value, { max: 1e11, req: true, name: 'value' }),
    notes: str(b.notes, { max: 1000, name: 'notes', trim: false }),
  };
}
function budget(category, amount) {
  category = str(category, { req: true, name: 'category' });
  if (!EXPENSE_CATS.includes(category)) bad('Budgets are for spending categories');
  return { category, amount: num(amount, { min: 0.01, max: 1e9, req: true, name: 'amount' }) };
}
function settings(b) {
  if (!isObj(b)) bad('Invalid settings');
  const out = {};
  if (b.display_name !== undefined) out.display_name = str(b.display_name, { max: 60, name: 'name' });
  if (b.starting_balance !== undefined) out.starting_balance = num(b.starting_balance, { min: -1e11, max: 1e11, req: true, name: 'starting balance' });
  if (b.currency !== undefined) { const c = str(b.currency, { max: 3, req: true, name: 'currency' }); if (!['£', '$', '€'].includes(c)) bad('Unsupported currency'); out.currency = c; }
  return out;
}

function log(b) {
  if (!isObj(b)) bad('Invalid log');
  const prompts = {};
  for (const k of PROMPT_KEYS) { const s = str(b.prompts?.[k], { max: 5000, name: k, trim: false }); if (s) prompts[k] = s; }
  const ratings = {};
  for (const k of RATING_KEYS) { const n = num(b.ratings?.[k], { min: 1, max: 10, int: true, name: k }); if (n != null) ratings[k] = n; }
  const sl = b.sleep || {}, sc = b.screen || {};
  const sleep = {};
  const bed = time(sl.bed, 'bedtime'), wake = time(sl.wake, 'wake time');
  if (bed) sleep.bed = bed; if (wake) sleep.wake = wake;
  const mins = num(sl.minutes, { min: 0, max: 1440, int: true, name: 'sleep minutes' }); if (mins != null) sleep.minutes = mins;
  const q = num(sl.quality, { min: 1, max: 5, int: true, name: 'sleep quality' }); if (q != null) sleep.quality = q;
  const sn = str(sl.notes, { max: 1000, trim: false, name: 'sleep notes' }); if (sn) sleep.notes = sn;
  const screen = {};
  for (const k of ['total', 'phone', 'computer']) { const n = num(sc[k], { min: 0, max: 1440, int: true, name: 'screen time' }); if (n != null) screen[k] = n; }
  const sc2 = str(sc.comments, { max: 1000, trim: false, name: 'screen comments' }); if (sc2) screen.comments = sc2;
  if (b.activities != null && !Array.isArray(b.activities)) bad('activities must be a list');
  const acts = (b.activities || []).slice(0, 30).map((a) => {
    if (!isObj(a) || !ACTIVITY_TYPES.includes(a.type)) bad('Unknown activity');
    const o = { type: a.type };
    const label = str(a.label, { max: 60, name: 'activity label' }); if (label) o.label = label;
    const desc = str(a.desc, { max: 1000, trim: false, name: 'activity description' }); if (desc) o.desc = desc;
    const d = num(a.duration, { min: 0, max: 1440, int: true, name: 'duration' }); if (d != null) o.duration = d;
    const di = num(a.distance, { min: 0, max: 5000, name: 'distance' }); if (di != null) o.distance = di;
    return o;
  });
  const culture = {};
  for (const k of CULTURE_KEYS) { const s = str(b.culture?.[k], { max: k === 'quote' || k === 'moment' ? 1500 : 200, name: k, trim: false }); if (s.trim()) culture[k] = s; }
  return {
    reflection: str(b.reflection, { max: 30000, name: 'reflection', trim: false }),
    prompts, ratings, sleep, screen, activities: acts, culture,
    photo_id: b.photo_id ? uuid(b.photo_id, 'photo') : null,
    completed: b.completed === true,
  };
}

module.exports = { FREQUENCIES, recurring, EXPENSE_CATS, INCOME_CATS, ASSET_KINDS, DEBT_KINDS, ACTIVITY_TYPES, RATING_KEYS, ValidationError, bad, isObj, str, num, date, uuid, transaction, pot, potMove, holding, budget, settings, log };
