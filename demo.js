// Fictional demonstration data. Everything inserted here is flagged demo=true so it can be
// cleared or reset without touching anything the user has entered themselves.
const DEMO_START = 1800;
const Rec = require('./recurring');

const pad = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromStr = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => { const d = fromStr(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
const dow = (s) => fromStr(s).getUTCDay(); // 0 Sun
const sameDayYearsAgo = (s, y) => { const d = fromStr(s); const m = d.getUTCMonth(); d.setUTCFullYear(d.getUTCFullYear() - y); if (d.getUTCMonth() !== m) d.setUTCDate(0); return toStr(d); };

function pickToday(client) {
  const server = toStr(new Date());
  if (typeof client === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(client)) {
    const diff = Math.abs(fromStr(client) - fromStr(server)) / 86400e3;
    if (diff <= 2) return client;
  }
  return server;
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────────── content pools (all fictional / generic) ─────────────
const SONGS = [
  ['Dreams', 'Fleetwood Mac'], ['Real Love Baby', 'Father John Misty'], ['Silver Springs', 'Fleetwood Mac'], ['Heroes', 'David Bowie'],
  ['Pink + White', 'Frank Ocean'], ['Intro', 'The xx'], ['Rivers and Roads', 'The Head and the Heart'], ['Holocene', 'Bon Iver'],
  ['Re: Stacks', 'Bon Iver'], ['Blue in Green', 'Miles Davis'], ['Cherry-coloured Funk', 'Cocteau Twins'], ['Eyes Without a Face', 'Billy Idol'],
  ['Time to Pretend', 'MGMT'], ['Harvest Moon', 'Neil Young'], ['Dog Days Are Over', 'Florence + The Machine'], ['Lisbon', 'Anna of the North'],
  ['Nights', 'Frank Ocean'], ['Sunset Lover', 'Petit Biscuit'], ['Ribs', 'Lorde'], ['The Less I Know the Better', 'Tame Impala'],
  ['Weightless', 'Marconi Union'], ['Motion Sickness', 'Phoebe Bridgers'], ['Gymnopédie No. 1', 'Erik Satie'], ['Vienna', 'Billy Joel'],
];
const FILMS = ['Lost in Translation', 'Paddington 2', 'Spirited Away', 'Aftersun', 'The Grand Budapest Hotel', 'Past Lives', 'Arrival', 'Paterson', 'Before Sunrise', 'Little Women', 'Her', 'The Secret Life of Walter Mitty'];
const SHOWS = ['Slow Horses', 'The Bear', 'Fleabag', 'Taskmaster', 'Planet Earth', 'Severance'];
const BOOKS = ['The Remains of the Day', 'Braiding Sweetgrass', 'A Month in the Country', 'Piranesi', 'Four Thousand Weeks'];
const QUOTES = [
  'Small steps still count as the walk.', 'The best view comes after the hardest climb.', 'Do the next kind thing.', 'Enough is a feast.',
  'Notice more than you judge.', 'Rest is part of the work.', 'A slow morning is a gift.', 'Be where your feet are.',
];
const MOMENTS = [
  'Sun coming through the kitchen window while the kettle boiled.', 'A stranger on the bus complimented my scarf.', 'Finally finished the thing I’d been putting off.',
  'Long phone call with my sister – laughed until it hurt.', 'The first properly cold, bright morning of the season.', 'Found a lovely second-hand book in the market.',
  'Cooked a new recipe and it actually worked.', 'Ran the whole loop without stopping.', 'Watched the light change over the park at 4pm.',
  'A really good coffee and ten quiet minutes.', 'Friends came over, nobody wanted to leave.', 'Got caught in rain and didn’t mind at all.',
];
const REFLECTIONS = [
  'A steady, ordinary sort of day. Got through the list at work and still had energy for a walk after. Dinner was simple and exactly right.',
  'Slow start, better finish. The morning dragged but a long walk at lunch reset everything. Feeling calm tonight.',
  'Busy at work – back-to-back calls – but a good busy. Treated myself to a proper lunch. Early night planned.',
  'Mostly a lazy one. Didn’t do much and, for once, didn’t feel bad about it. Read a lot and made soup.',
  'Cold morning, bright afternoon. Cycled the long way home just because. Called Mum in the evening.',
  'Struggled to focus today. Kept drifting. Went for a run to clear my head and it helped more than I expected.',
  'Really good day. Saw friends, laughed a lot, stayed out later than planned. Will be tired tomorrow and it’ll be worth it.',
  'Quiet day at home. Tidied up, cooked, listened to a whole album start to finish – properly, no phone.',
  'Rushed morning, but the afternoon opened up. Finished the project I’d been dreading and it wasn’t that bad.',
  'Rain all day. Stayed in, made bread, watched a film. Cosy and unambitious.',
  'A bit flat today without knowing why. Nothing wrong, just grey. Early night should help.',
  'Productive morning, long lunch, sunny walk in the park. One of those days that just fits together.',
  'Meetings all day, then a gym session that felt great. Dinner with a friend I haven’t seen for ages.',
  'Wandered around the market, bought far too many apples. Made a crumble. Whole flat smells wonderful.',
];
const DID = ['Work, then a long walk by the canal.', 'Worked from home, cooked a proper dinner.', 'Office, gym, home. Early night.', 'Market in the morning, reading in the afternoon.', 'Cycled to work, met friends for dinner.', 'Lazy morning, 5k run, film in the evening.'];
const LABELS = { running: ['Easy 5k', 'Morning run', 'Park loop', 'Tempo run'], cycling: ['Ride to work', 'Weekend ride'], walking: ['Walk by the canal', 'Lunchtime walk', 'Long walk'], gym: ['Upper body', 'Legs', 'Full body'], reading: ['Evening chapter', 'Reading in the park'], cooking: ['Dinner from scratch', 'Batch cooking', 'Baking'], working: ['Office', 'Working from home'], socialising: ['Drinks with friends', 'Family call', 'Dinner out'], film: ['Film night'], outdoors: ['Park', 'Canal path'], creative: ['Sketching', 'Guitar'], studying: ['Spanish lessons'], going_out: ['Gig', 'Pub quiz'] };

// ───────────── tasteful generated "photographs" (SVG scenes) ─────────────
const PALETTES = [
  ['#f2e3d0', '#e6b99a', '#b86b4b', '#4a3b36'], ['#dfe7e4', '#a9c2b8', '#5f877b', '#2f4a45'], ['#e4e6ee', '#aeb7cf', '#6d7aa3', '#2d3350'],
  ['#efe6dc', '#d8c3a5', '#8d7b68', '#3d352f'], ['#f0dede', '#d9a8a4', '#9c5a56', '#4a2d2b'], ['#e8ecdd', '#bcc99a', '#7d9060', '#394530'],
];
function scene(kind, p, r) {
  const [a, b, c, d] = p;
  const W = 1200, H = 900;
  let body = '';
  if (kind === 0) { // sunrise over hills
    body = `<rect width="${W}" height="${H}" fill="${a}"/><circle cx="${400 + r() * 400}" cy="${380 + r() * 60}" r="150" fill="${b}"/><path d="M0 620 Q300 480 600 600 T1200 560 V900 H0Z" fill="${c}"/><path d="M0 740 Q350 620 700 730 T1200 700 V900 H0Z" fill="${d}"/>`;
  } else if (kind === 1) { // sea bands + sun
    body = `<rect width="${W}" height="${H}" fill="${a}"/><circle cx="${700 + r() * 200}" cy="330" r="110" fill="${b}"/>` + [0, 1, 2, 3, 4].map((i) => `<rect y="${520 + i * 76}" width="${W}" height="${76}" fill="${[b, c, c, d, d][i]}" opacity="${0.55 + i * 0.1}"/>`).join('');
  } else if (kind === 2) { // skyline
    let x = 0, s = '';
    while (x < W) { const w = 70 + r() * 90, h = 220 + r() * 380; s += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${r() > 0.5 ? c : d}"/>`; for (let k = 0; k < 6; k++) if (r() > 0.6) s += `<rect x="${x + 12 + (k % 3) * 22}" y="${H - h + 24 + Math.floor(k / 3) * 40}" width="12" height="18" fill="${a}"/>`; x += w + 6; }
    body = `<rect width="${W}" height="${H}" fill="${b}"/><circle cx="${200 + r() * 700}" cy="200" r="70" fill="${a}"/>${s}`;
  } else if (kind === 3) { // trees
    let s = '';
    for (let i = 0; i < 14; i++) { const x = 40 + i * 85 + r() * 30, h = 260 + r() * 300; s += `<rect x="${x - 6}" y="${H - 160}" width="12" height="160" fill="${d}"/><path d="M${x} ${H - h - 120} L${x + 60} ${H - 160} L${x - 60} ${H - 160}Z" fill="${r() > 0.5 ? c : d}"/>`; }
    body = `<rect width="${W}" height="${H}" fill="${a}"/><rect y="640" width="${W}" height="260" fill="${b}"/>${s}`;
  } else if (kind === 4) { // night sky
    let s = ''; for (let i = 0; i < 70; i++) s += `<circle cx="${r() * W}" cy="${r() * 560}" r="${1 + r() * 2.6}" fill="${a}" opacity="${0.5 + r() * 0.5}"/>`;
    body = `<rect width="${W}" height="${H}" fill="${d}"/>${s}<circle cx="${880 + r() * 120}" cy="190" r="64" fill="${a}"/><path d="M0 700 Q400 600 800 690 T1200 670 V900 H0Z" fill="${c}"/>`;
  } else { // still life: cup and table
    body = `<rect width="${W}" height="${H}" fill="${a}"/><rect y="600" width="${W}" height="300" fill="${b}"/><rect x="470" y="410" width="240" height="190" rx="26" fill="${c}"/><path d="M710 460 q90 0 90 60 t-90 60" fill="none" stroke="${c}" stroke-width="26"/><ellipse cx="590" cy="410" rx="120" ry="22" fill="${d}"/><path d="M560 380 q-26 -60 0 -120 M620 380 q26 -60 0 -120" fill="none" stroke="${d}" stroke-width="10" opacity=".4" stroke-linecap="round"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
}

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rnd = (r, a, b) => a + r() * (b - a);
const money = (n) => Math.round(n * 100) / 100;
const minutesBetween = (bed, wake) => { const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number); let d = wh * 60 + wm - (bh * 60 + bm); if (d <= 0) d += 1440; return d; };
const hhmm = (mins) => `${pad(Math.floor(mins / 60) % 24)}:${pad(Math.round(mins % 60))}`;

async function seed(c, userId, today) {
  const r = rng(20260507);
  const tx = []; // [date,type,amount,category,description,notes]
  const T = (date, type, amount, category, description, notes = '') => tx.push([date, type, money(amount), category, description, notes]);

  // ── transactions: ~7 months ──
  const first = (() => { const d = fromStr(today); d.setUTCMonth(d.getUTCMonth() - 6, 1); return toStr(d); })();
  const days = Math.round((fromStr(today) - fromStr(first)) / 86400e3);
  const POOLS = {
    Groceries: ['Weekly shop', 'Corner shop top-up', 'Market – veg & fruit', 'Bakery & deli', 'Supermarket'],
    'Eating out': ['Lunch – noodle bar', 'Coffee & pastry', 'Pizza with friends', 'Takeaway curry', 'Brunch', 'Sandwich & coffee', 'Pub dinner'],
    Transport: ['Bus fare', 'Tube top-up', 'Train to see family', 'Taxi home', 'Bike repair'],
    Shopping: ['Trainers', 'Books', 'Kitchen things', 'Winter jumper', 'Gift for a friend', 'Home bits'],
    Entertainment: ['Cinema', 'Gig tickets', 'Museum exhibition', 'Board game café'],
    Health: ['Pharmacy', 'Dentist check-up', 'Physio session'],
    'Other spending': ['Haircut', 'Postage', 'Dry cleaning', 'Charity donation'],
  };
  for (let i = 0; i <= days; i++) {
    const d = addDays(first, i); const day = Number(d.slice(8)); const wk = dow(d); const weekend = wk === 0 || wk === 6;
    if (day === 1) T(d, 'expense', 850, 'Rent & housing', 'Rent');
    if (day === 2) T(d, 'expense', 24, 'Subscriptions', 'Gym membership');
    if (day === 8) T(d, 'expense', rnd(r, 54, 88), 'Bills', 'Electricity & gas');
    if (day === 9) T(d, 'expense', 38.5, 'Insurance', 'Car insurance');
    if (day === 12) T(d, 'expense', 28, 'Bills', 'Broadband');
    if (day === 14) T(d, 'expense', 10.99, 'Subscriptions', 'Streaming');
    if (day === 16) T(d, 'expense', 10.99, 'Subscriptions', 'Music');
    if (day === 20) T(d, 'expense', 16, 'Bills', 'Phone plan');
    if (day === 28 && d <= today) T(d, 'income', 2450, 'Salary', 'Salary – Northfield Studio (fictional)');
    if (d === today) continue; // today's entries are added explicitly below
    if (r() < 0.22) T(d, 'expense', rnd(r, 11, 46), 'Groceries', pick(r, POOLS.Groceries));
    if (r() < (weekend ? 0.42 : 0.27)) T(d, 'expense', rnd(r, 5, weekend ? 38 : 16), 'Eating out', pick(r, POOLS['Eating out']));
    if (!weekend && r() < 0.34) T(d, 'expense', rnd(r, 2.8, 14), 'Transport', pick(r, POOLS.Transport));
    if (r() < 0.07) T(d, 'expense', rnd(r, 14, 72), 'Shopping', pick(r, POOLS.Shopping));
    if (r() < 0.08) T(d, 'expense', rnd(r, 8, 36), 'Entertainment', pick(r, POOLS.Entertainment));
    if (r() < 0.03) T(d, 'expense', rnd(r, 6, 32), 'Health', pick(r, POOLS.Health));
    if (r() < 0.04) T(d, 'expense', rnd(r, 5, 25), 'Other spending', pick(r, POOLS['Other spending']));
    if (r() < 0.012) T(d, 'income', rnd(r, 15, 80), 'Other income', 'Sold an old jacket');
  }
  // guarantee a realistic current month, whatever the date
  const monthStart = today.slice(0, 8) + '01';
  const yesterday = addDays(today, -1);
  const mine = (cat) => tx.filter((t) => t[1] === 'expense' && t[3] === cat && t[0] >= monthStart).reduce((s, t) => s + t[2], 0);
  if (mine('Groceries') < 30) T(yesterday, 'expense', 38.45, 'Groceries', 'Weekly shop');
  if (mine('Eating out') < 60) { T(yesterday, 'expense', 41.5, 'Eating out', 'Dinner with Sam'); T(addDays(today, -2), 'expense', 15.2, 'Eating out', 'Brunch'); }
  if (mine('Shopping') < 60) T(addDays(today, -2), 'expense', 64.99, 'Shopping', 'Winter jumper');
  T(today, 'expense', 12, 'Eating out', 'Lunch – noodle bar', 'Rainy day. Soup noodles were exactly right.');
  if (r() < 2) T(today, 'expense', 3.1, 'Transport', 'Bus fare');

  // memories from earlier years (for “On this day”)
  const y1 = sameDayYearsAgo(today, 1), y2 = sameDayYearsAgo(today, 2);
  T(y1, 'expense', 38, 'Eating out', 'Birthday dinner for Alex'); T(y1, 'expense', 6.4, 'Transport', 'Night bus');
  T(y2, 'expense', 22.5, 'Entertainment', 'Cinema – two tickets'); T(y2, 'expense', 9.8, 'Eating out', 'Late-night chips');

  await c.query(
    `INSERT INTO transactions (user_id,date,type,amount,category,description,notes,demo)
     SELECT $1, d, t, a, cat, ds, n, true FROM unnest($2::date[],$3::text[],$4::numeric[],$5::text[],$6::text[],$7::text[]) AS x(d,t,a,cat,ds,n)`,
    [userId, tx.map((t) => t[0]), tx.map((t) => t[1]), tx.map((t) => t[2]), tx.map((t) => t[3]), tx.map((t) => t[4]), tx.map((t) => t[5])]);

  // ── recurring rules matching the fixed items above (already posted up to today) ──
  const mk = (day) => first.slice(0, 8) + pad(day);
  const rules = [['income', 2450, 'Salary', 'Salary – Northfield Studio (fictional)', 28], ['expense', 850, 'Rent & housing', 'Rent', 1], ['expense', 38.5, 'Insurance', 'Car insurance', 9], ['expense', 28, 'Bills', 'Broadband', 12],
    ['expense', 16, 'Bills', 'Phone plan', 20], ['expense', 24, 'Subscriptions', 'Gym membership', 2], ['expense', 10.99, 'Subscriptions', 'Streaming', 14], ['expense', 10.99, 'Subscriptions', 'Music', 16]];
  for (const [type, amount, category, description, day] of rules) {
    const start = mk(day);
    await c.query('INSERT INTO recurring (user_id,type,amount,category,description,frequency,start_date,generated,demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)', [userId, type, amount, category, description, 'monthly', start, Rec.countUpTo(start, 'monthly', today)]);
  }

  // ── budgets (some comfortable, one nearly full, one over, so warnings are visible) ──
  const spent = (cat) => mine(cat);
  const fit = (cat, factor, floor) => Math.max(floor, Math.ceil((spent(cat) * factor) / 5) * 5);
  const budgets = [
    ['Groceries', fit('Groceries', 2.4, 300)], ['Eating out', fit('Eating out', 1.12, 90)], ['Transport', 80],
    ['Shopping', Math.max(60, Math.floor((spent('Shopping') * 0.92) / 5) * 5)], ['Entertainment', 70], ['Subscriptions', 60], ['Bills', 160],
  ];
  for (const [cat, amt] of budgets) await c.query('INSERT INTO budgets (user_id,category,amount,demo) VALUES ($1,$2,$3,true)', [userId, cat, amt]);

  // ── pots ──
  const potDefs = [['Emergency fund', 3000, 1200, 150], ['Japan trip', 2500, 400, 100], ['New laptop', 1400, 350, 60]];
  for (const [name, target, open, monthly] of potDefs) {
    const { rows } = await c.query('INSERT INTO pots (user_id,name,target,opening_balance,demo) VALUES ($1,$2,$3,$4,true) RETURNING id', [userId, name, target, open]);
    const id = rows[0].id;
    for (let m = 6; m >= 0; m--) {
      const d = fromStr(today); d.setUTCMonth(d.getUTCMonth() - m, 29); const ds = toStr(d);
      if (ds < today && ds >= first) await c.query('INSERT INTO pot_moves (user_id,pot_id,date,amount,note,demo) VALUES ($1,$2,$3,$4,$5,true)', [userId, id, ds, monthly, 'Monthly top-up']);
    }
    if (name === 'New laptop') await c.query('INSERT INTO pot_moves (user_id,pot_id,date,amount,note,demo) VALUES ($1,$2,$3,$4,$5,true)', [userId, id, addDays(today, -40), -45, 'Bought a new case']);
  }

  // ── assets & debts ──
  const hold = [
    ['asset', 'car', 'Hatchback (2017)', 6800], ['asset', 'investment', 'Index fund ISA', 5400], ['asset', 'other', 'Bike, camera & guitar', 1350], ['asset', 'savings', 'Cash ISA', 2100],
    ['debt', 'loan', 'Student loan', 18400], ['debt', 'credit_card', 'Credit card', 310],
  ];
  for (const [side, kind, name, value] of hold) await c.query('INSERT INTO holdings (user_id,side,kind,name,value,demo) VALUES ($1,$2,$3,$4,$5,true)', [userId, side, kind, name, value]);

  // ── daily logs ──
  const photoIds = [];
  const mkPhoto = async (seedN) => {
    const rr = rng(1000 + seedN);
    const svg = scene(seedN % 6, PALETTES[(seedN * 5 + 1) % PALETTES.length], rr);
    const { rows } = await c.query('INSERT INTO photos (user_id,mime,data,demo) VALUES ($1,$2,$3,true) RETURNING id', [userId, 'image/svg+xml', Buffer.from(svg)]);
    return rows[0].id;
  };
  const txOn = (d) => tx.filter((t) => t[0] === d);
  let showNow = pick(r, SHOWS), bookNow = pick(r, BOOKS), photoN = 0;
  const WB = { happiness: [6.0, 5.8, 6.1, 6.3, 6.5, 7.3, 7.8], productivity: [4.8, 6.5, 7.0, 7.0, 6.8, 6.0, 4.5], stress: [3.4, 6.0, 5.5, 5.4, 5.0, 3.8, 2.6], social: [5.5, 3.6, 4.2, 4.4, 4.8, 7.2, 7.4] };
  const lastN = 78;

  async function insertLog(date, full, forced = {}) {
    const wk = dow(date), weekend = wk === 0 || wk === 6;
    const bedMin = (weekend ? 23.6 : 22.9 + r() * 0.9) * 60 + (weekend ? r() * 70 : 0);
    const bed = hhmm(Math.round(bedMin / 5) * 5);
    const sleepMins = Math.round(clamp(rnd(r, 5.6, 8.9) * 60 + (weekend ? 30 : 0), 300, 600) / 5) * 5;
    const wake = hhmm((bedMin + sleepMins) % 1440);
    const hrs = sleepMins / 60;
    const adj = (hrs - 7) * 0.55;
    const noise = () => (r() + r() + r() - 1.5) * 2.2;
    const R = {
      happiness: clamp(Math.round(WB.happiness[wk] + adj + noise()), 1, 10), productivity: clamp(Math.round(WB.productivity[wk] + adj * 0.6 + noise()), 1, 10),
      energy: clamp(Math.round(5.8 + adj * 1.4 + noise()), 1, 10), stress: clamp(Math.round(WB.stress[wk] - adj * 0.5 + noise()), 1, 10),
      social: clamp(Math.round(WB.social[wk] + noise()), 1, 10), enjoyment: 0, satisfaction: 0,
    };
    R.enjoyment = clamp(Math.round(R.happiness * 0.7 + R.social * 0.2 + 1 + noise() * 0.4), 1, 10);
    R.satisfaction = clamp(Math.round((R.happiness + R.productivity) / 2 + noise() * 0.4), 1, 10);
    const ratings = {};
    for (const k of Object.keys(R)) if (full && r() > 0.08) ratings[k] = R[k];
    const acts = [];
    if (!weekend) acts.push({ type: 'working', label: pick(r, LABELS.working), duration: Math.round(rnd(r, 6, 9) * 60) });
    const extra = ['running', 'walking', 'gym', 'cooking', 'reading', 'socialising', 'cycling', 'film', 'creative', 'outdoors'];
    const nExtra = full ? 1 + Math.floor(r() * 2.4) : Math.floor(r() * 2);
    for (let k = 0; k < nExtra; k++) {
      const t = (weekend && r() < 0.5) ? pick(r, ['socialising', 'outdoors', 'film', 'cooking', 'running']) : pick(r, extra);
      if (acts.some((a) => a.type === t)) continue;
      const a = { type: t, label: pick(r, LABELS[t] || ['']) };
      if (t === 'running') { a.duration = Math.round(rnd(r, 25, 55)); a.distance = money(a.duration / rnd(r, 5.4, 6.6)); }
      if (t === 'walking') { a.duration = Math.round(rnd(r, 20, 75)); a.distance = money(a.duration / 12.5); }
      if (t === 'cycling') { a.duration = Math.round(rnd(r, 25, 90)); a.distance = money(a.duration / 3.6); }
      if (t === 'gym') a.duration = Math.round(rnd(r, 40, 70));
      if (t === 'reading') a.duration = Math.round(rnd(r, 20, 70));
      if (!a.label) delete a.label;
      acts.push(a);
    }
    const culture = {};
    if (full) {
      if (r() < 0.82) { const [s, a] = pick(r, SONGS); culture.song = s; culture.artist = a; }
      if (r() < (weekend ? 0.5 : 0.1)) culture.film = pick(r, FILMS);
      if (r() < 0.25) culture.show = showNow;
      if (r() < 0.35) culture.book = bookNow;
      if (r() < 0.12) culture.quote = pick(r, QUOTES);
      if (r() < 0.62) culture.moment = pick(r, MOMENTS);
    }
    if (r() < 0.03) showNow = pick(r, SHOWS); if (r() < 0.02) bookNow = pick(r, BOOKS);
    const phone = Math.round(rnd(r, 60, 220) / 5) * 5, comp = weekend ? Math.round(rnd(r, 30, 160) / 5) * 5 : Math.round(rnd(r, 100, 250) / 5) * 5, tv = Math.round(rnd(r, 0, weekend ? 180 : 90) / 5) * 5;
    const reflection = full ? pick(r, REFLECTIONS) : '';
    const prompts = {}; if (full && r() < 0.45) prompts.did = pick(r, DID);
    if (full && r() < 0.25 && culture.moment) prompts.best = culture.moment;
    let photo = null;
    if (full && (forced.photo || r() < 0.2)) photo = await mkPhoto(photoN++);
    if (photo) photoIds.push(photo);
    const sleep = { bed, wake, minutes: sleepMins, quality: clamp(Math.round(2.4 + (hrs - 5.5) * 0.7 + rnd(r, -0.7, 0.8)), 1, 5) };
    if (full && r() < 0.12) sleep.notes = pick(r, ['Woke once around 3am.', 'Slept through – lovely.', 'Neighbours were noisy.', 'Dreamt about the sea.']);
    const screen = { total: phone + comp + tv, phone, computer: comp + tv };
    if (full && r() < 0.1) screen.comments = pick(r, ['Too much scrolling in bed.', 'Mostly work, honestly.', 'Barely touched my phone after dinner.']);
    const o = { reflection, prompts, ratings: full ? ratings : {}, sleep: full ? sleep : {}, screen: full ? screen : {}, activities: acts, culture, photo_id: photo, completed: full, ...forced.override };
    await c.query(
      `INSERT INTO daily_logs (user_id,date,reflection,prompts,ratings,sleep,screen,activities,culture,photo_id,completed,completed_at,demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 THEN ($2::date + time '22:15')::timestamptz END, true)`,
      [userId, date, o.reflection, o.prompts, o.ratings, o.sleep, o.screen, JSON.stringify(o.activities), o.culture, o.photo_id, o.completed]);
  }

  for (let i = lastN; i >= 1; i--) {
    const d = addDays(today, -i);
    if (i > 1 && r() > 0.87) continue; // some days simply weren't logged – no guilt
    await insertLog(d, !(i > 2 && r() < 0.06), {});
  }

  // memories from previous years
  const memory = async (date, o) => {
    const ph = await mkPhoto(20 + photoIds.length);
    await c.query(
      `INSERT INTO daily_logs (user_id,date,reflection,prompts,ratings,sleep,screen,activities,culture,photo_id,completed,completed_at,demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true, ($2::date + time '22:30')::timestamptz, true)
       ON CONFLICT (user_id,date) DO NOTHING`,
      [userId, date, o.reflection, o.prompts || {}, o.ratings, o.sleep, o.screen, JSON.stringify(o.activities), o.culture, ph]);
  };
  await memory(y1, {
    reflection: 'Alex’s birthday. Dinner turned into three hours of stories and bad singing. Walked home in the cold, completely happy.',
    prompts: { best: 'Everyone singing along in the restaurant.' },
    ratings: { happiness: 9, productivity: 4, satisfaction: 9, energy: 6, social: 10, stress: 2, enjoyment: 9 },
    sleep: { bed: '00:40', wake: '08:30', minutes: 470, quality: 4 }, screen: { total: 190, phone: 130, computer: 60 },
    activities: [{ type: 'socialising', label: 'Birthday dinner' }, { type: 'walking', label: 'Walk home', duration: 35, distance: 2.8 }],
    culture: { song: 'Dreams', artist: 'Fleetwood Mac', moment: 'Walking home after midnight, still humming.', film: '' },
  });
  await memory(y2, {
    reflection: 'First proper autumn day. Leaves everywhere. Went to the cinema on a whim and had chips on the way home.',
    ratings: { happiness: 8, productivity: 5, satisfaction: 8, energy: 7, social: 6, stress: 3, enjoyment: 8 },
    sleep: { bed: '23:30', wake: '07:30', minutes: 480, quality: 4 }, screen: { total: 240, phone: 120, computer: 120 },
    activities: [{ type: 'film', label: 'Cinema' }, { type: 'outdoors', label: 'Park in the leaves' }],
    culture: { song: 'Harvest Moon', artist: 'Neil Young', film: 'Paddington 2', quote: 'Be where your feet are.' },
  });

  await c.query('UPDATE settings SET has_demo = true, starting_balance = $2 WHERE user_id = $1', [userId, DEMO_START]);
}

async function clear(c, userId) {
  for (const t of ['daily_logs', 'photos', 'pot_moves', 'pots', 'transactions', 'recurring', 'holdings', 'budgets']) await c.query(`DELETE FROM ${t} WHERE demo = true`);
  await c.query('UPDATE settings SET has_demo = false, starting_balance = CASE WHEN starting_balance = $2 THEN 0 ELSE starting_balance END WHERE user_id = $1', [userId, DEMO_START]);
}

module.exports = { seed, clear, pickToday, DEMO_START, addDays, toStr };
