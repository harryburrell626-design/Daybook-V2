import { h, clear, todayStr, addDays, monthKey, addMonths, monthTitle, shortDate, longDate, money, money0, round2, avg, fmt1, durText, plural, weekday, dowIndexMon, monShort } from '../util.js';
import { S, logHasContent, potBalance, spentByCategory, moodScore, monthTotals } from '../store.js';
import { RATINGS, RATING_LABEL, ACT_LABEL, excerpt } from '../constants.js';
import { lineChart, columnChart, hbars } from '../charts.js';
import { photoImg, catIcon } from '../ui.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const note = (...t) => h('p', { class: 'obs' }, ...t);

export function renderInsights() {
  const today = todayStr();
  const logs = [...S.logs.values()].filter((l) => logHasContent(l) && l.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  let metric = 'happiness', days = 30;
  const root = h('div', { class: 'stack-l' });
  const head = h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('div', null, h('h1', { class: 'page-title' }, 'Insights'), h('p', { class: 'page-sub' }, 'Patterns in your own records. They’re observations, not explanations.')));

  if (logs.length < 3 && !S.d.transactions.length) { return h('div', null, head, h('div', { class: 'card empty', style: { marginTop: '20px' } }, 'Insights appear as you keep your log and record your money. A few days in, they start to get interesting.')); }

  const moodBox = h('div', { class: 'grid g2', style: { alignItems: 'start' } });
  function drawMood() {
    clear(moodBox);
    const from = addDays(today, -(days - 1));
    const inRange = logs.filter((l) => l.date >= from && l.ratings?.[metric] != null);
    const name = RATING_LABEL[metric];
    const data = inRange.map((l) => ({ x: l.date, y: l.ratings[metric] }));
    const a = avg(data.map((d) => d.y));
    moodBox.append(h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, `${name} over time`), h('div', { class: 'seg' }, [30, 90].map((n) => h('button', { class: days === n ? 'on' : '', onClick: () => { days = n; drawMood(); } }, `${n} days`)))),
      lineChart({ data, from, to: today, yMin: 1, yMax: 10, ticks: [1, 5, 10], ref: a }),
      data.length ? note(`Average ${fmt1(a)}/10 across ${plural(data.length, 'rated day')}. The dashed line marks your average.`) : note('No ratings in this period yet.')));
    const by = DOW.map(() => []);
    for (const l of logs) if (l.ratings?.[metric] != null) by[dowIndexMon(l.date)].push(l.ratings[metric]);
    const means = by.map((v) => (v.length >= 2 ? avg(v) : null)); const have = means.map((m, i) => [m, i]).filter(([m]) => m != null);
    const total = by.reduce((s, v) => s + v.length, 0);
    let obs = note('Rate a few more days to see how the week shapes up.');
    if (have.length >= 3) { const hi = have.reduce((a, b) => (b[0] > a[0] ? b : a)), lo = have.reduce((a, b) => (b[0] < a[0] ? b : a)); obs = note(`${name} averages highest on ${DOW[hi[1]]}s (${fmt1(hi[0])}) and lowest on ${DOW[lo[1]]}s (${fmt1(lo[0])}), across ${plural(total, 'rated day')}.`); }
    moodBox.append(h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, `${name} by weekday`)),
      columnChart({ items: DOW.map((d, i) => ({ label: d, value: means[i], hl: have.length > 1 && means[i] === Math.max(...have.map((x) => x[0])) })), max: 10, fmt: (v) => fmt1(v) }), obs));
  }
  const metricChips = h('div', { class: 'chips metric-chips' });
  const drawChips = () => { clear(metricChips); for (const [k, n] of RATINGS) metricChips.append(h('button', { class: 'chip' + (metric === k ? ' on' : ''), onClick: () => { metric = k; drawChips(); drawMood(); } }, n)); };
  drawChips(); drawMood();

  // sleep
  const sleepLogs = logs.filter((l) => l.sleep?.minutes != null);
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const sleepAvg = avg(sleepLogs.filter((l) => l.date >= addDays(today, -29)).map((l) => l.sleep.minutes));
  const grp = [['Under 6½h', (m) => m < 390], ['6½–7½h', (m) => m >= 390 && m <= 450], ['Over 7½h', (m) => m > 450]].map(([label, f]) => {
    const v = logs.filter((l) => l.sleep?.minutes != null && l.ratings?.happiness != null && f(l.sleep.minutes)).map((l) => l.ratings.happiness); return { label, n: v.length, mean: v.length >= 4 ? avg(v) : null };
  });
  const sleepNote = grp.every((g) => g.mean != null)
    ? note(`On days after under 6½ hours of sleep you rated happiness ${fmt1(grp[0].mean)} on average (${grp[0].n} days), versus ${fmt1(grp[2].mean)} after more than 7½ hours (${grp[2].n} days). A pattern in your records — not necessarily a cause.`)
    : note('With a few more days of sleep and happiness ratings, you’ll see how the two line up.');
  const sleepCard = h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, 'Sleep'), sleepAvg != null ? h('div', { class: 'small muted' }, 'Average ', h('b', null, durText(Math.round(sleepAvg))), ' · last 30 days') : null),
    columnChart({ items: last14.map((d) => ({ label: String(Number(d.slice(8))), value: S.logs.get(d)?.sleep?.minutes != null ? S.logs.get(d).sleep.minutes / 60 : null, hl: true })), max: 10, fmt: (v) => fmt1(v) + 'h', ref: 7, refLabel: '7h' }),
    h('div', { class: 'tiny faint' }, 'Hours slept, last 14 nights'), h('hr', { class: 'sep' }),
    h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Happiness by hours slept'),
    columnChart({ items: grp.map((g) => ({ label: `${g.label}`, value: g.mean, hl: true })), max: 10, height: 150, fmt: (v) => fmt1(v) }), sleepNote);

  // screens
  const from30 = addDays(today, -29);
  const scr = logs.filter((l) => l.date >= from30 && l.screen?.total != null);
  const scrData = scr.map((l) => ({ x: l.date, y: Math.round((l.screen.total / 60) * 10) / 10 }));
  const scrMax = Math.max(4, Math.ceil(Math.max(0, ...scrData.map((d) => d.y)) / 2) * 2);
  const screenCard = h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, 'Screen time'), scr.length ? h('div', { class: 'small muted' }, 'Average ', h('b', null, durText(Math.round(avg(scr.map((l) => l.screen.total))))), ' / day') : null),
    lineChart({ data: scrData, from: from30, to: today, yMin: 0, yMax: scrMax, ticks: [0, scrMax / 2, scrMax], fmt: (v) => v + 'h' }), scr.length ? note(`From ${plural(scr.length, 'day')} with screen time recorded in the last 30 days.`) : note('Add screen time to your logs to see the trend.'));

  // activities
  const from90 = addDays(today, -89), cnt = {};
  for (const l of logs) if (l.date >= from90) for (const a of l.activities || []) cnt[a.type] = (cnt[a.type] || 0) + 1;
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const dist = {}; for (const l of logs) if (l.date >= from90) for (const a of l.activities || []) if (a.type === 'running' && a.distance) dist.run = (dist.run || 0) + a.distance;
  const actCard = h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, 'What your days are made of'), h('span', { class: 'small muted' }, 'last 90 days')),
    top.length ? hbars(top.map(([t, n]) => ({ label: ACT_LABEL[t] || t, value: n, text: `${n}×` })), { color: 'var(--warm)' }) : h('div', { class: 'empty' }, 'Record activities to see what fills your days.'),
    dist.run ? note(`You logged ${fmt1(dist.run)} km of running in this period.`) : null);

  // spending
  const ym = monthKey(today), sp = Object.entries(spentByCategory(ym)).sort((a, b) => b[1] - a[1]);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  const mData = months.map((m) => ({ m, ...monthTotals(m) }));
  const spendCard = h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, 'Where the money went'), h('span', { class: 'small muted' }, monthTitle(ym))),
    sp.length ? hbars(sp.slice(0, 8).map(([c, v]) => ({ label: c, value: v, text: money(v) }))) : h('div', { class: 'empty' }, 'No spending recorded this month yet.'), h('hr', { class: 'sep' }),
    h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Spending, last six months'),
    columnChart({ items: mData.map((d, i) => ({ label: monShort(d.m + '-01'), value: d.spending || null, hl: i === 5 })), fmt: (v) => money0(v), height: 170 }),
    (() => { const full = mData.slice(0, 5).filter((d) => d.spending > 0); return full.length >= 2 ? note(`The previous ${full.length} months averaged ${money0(avg(full.map((d) => d.spending)))} of spending.`) : null; })());

  // savings
  const potsCard = h('div', { class: 'card insight' }, h('div', { class: 'card-head' }, h('h3', null, 'Savings progress'), h('a', { class: 'link', href: '#/money?tab=savings' }, 'Pots')),
    S.d.pots.length ? h('div', { class: 'stack' }, S.d.pots.map((p) => { const b = potBalance(p), pct = p.target > 0 ? Math.min(100, (b / p.target) * 100) : null;
      return h('div', null, h('div', { class: 'row between small' }, h('span', null, p.name), h('span', { class: 'muted num' }, pct != null ? `${money0(b)} of ${money0(p.target)}` : money0(b))), pct != null ? h('div', { class: 'progress ' + (pct >= 100 ? 'good' : ''), style: { marginTop: '6px' } }, h('i', { style: { width: pct + '%' } })) : null); })) : h('div', { class: 'empty' }, 'Create a savings pot to track progress.'));

  // best days
  const scored = logs.map((l) => ({ l, s: moodScore(l) })).filter((x) => x.s != null).sort((a, b) => b.s - a.s || (a.l.date < b.l.date ? 1 : -1)).slice(0, 5);
  const bestCard = h('div', { class: 'card insight warm' }, h('div', { class: 'card-head' }, h('h3', null, 'Your best-rated days')),
    scored.length ? h('div', null, scored.map(({ l, s }) => h('a', { class: 'entry', href: `#/log/${l.date}` }, h('div', { class: 'd' }, h('b', null, Number(l.date.slice(8))), h('span', null, monShort(l.date))), h('div', { class: 'grow' }, h('div', { class: 'ex' }, excerpt(l)), h('span', { class: 'mood' }, h('i'), `${fmt1(s)}/10 across happiness, satisfaction & enjoyment`)), l.photo_id ? photoImg(l.photo_id) : null))) : h('div', { class: 'empty' }, 'Rate happiness, satisfaction or enjoyment to see your standout days.'));

  // culture
  const artists = {}, films = {};
  for (const l of logs) { const c = l.culture || {}; if (c.artist) artists[c.artist] = (artists[c.artist] || 0) + 1; if (c.film) films[c.film] = (films[c.film] || 0) + 1; }
  const ta = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 5), tf = Object.entries(films).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cultureCard = h('div', { class: 'card insight warm' }, h('div', { class: 'card-head' }, h('h3', null, 'On repeat'), h('a', { class: 'link', href: '#/calendar?tab=library' }, 'Library')),
    ta.length || tf.length ? h('div', { class: 'stack' }, ta.length ? h('div', null, h('div', { class: 'section-title' }, 'Most-saved artists'), hbars(ta.map(([a, n]) => ({ label: a, value: n, text: `${n}×` })), { color: 'var(--warm)' })) : null,
      tf.length ? h('div', null, h('div', { class: 'section-title', style: { marginTop: '12px' } }, 'Films you’ve logged'), hbars(tf.map(([a, n]) => ({ label: a, value: n, text: `${n}×` })), { color: 'var(--warm)' })) : null) : h('div', { class: 'empty' }, 'Save songs and films in your daily logs to see favourites emerge.'));

  root.append(head, h('div', null, metricChips, moodBox), h('div', { class: 'grid g2', style: { alignItems: 'start' } }, sleepCard, screenCard), h('div', { class: 'grid g2', style: { alignItems: 'start' } }, spendCard, actCard), h('div', { class: 'grid g2', style: { alignItems: 'start' } }, bestCard, cultureCard), potsCard);
  return root;
}
