import { h, greeting, longDate, shortDate, todayStr, addDays, monthKey, money, money0, dayNum, monShort, avg, fmt1, parse, plural } from '../util.js';
import { S, available, monthTotals, totals, logHasContent, onThisDay, getLog, moodScore } from '../store.js';
import { ACT_LABEL, excerpt } from '../constants.js';
import { sparkline } from '../charts.js';
import { openTxModal, txRow, photoImg, mediaIcon } from '../ui.js';
import { refresh } from '../util.js';

export function renderOverview() {
  const today = todayStr(), ym = monthKey(today);
  const T = totals(), M = monthTotals(ym), name = S.d.settings.display_name;
  const log = getLog(today);
  const state = log?.completed ? 'done' : log && logHasContent(log) ? 'prog' : 'none';

  const tonight = h('div', { class: 'card tonight' },
    h('div', null,
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, h('span', { class: 'state-dot ' + state }), state === 'done' ? 'Today’s log is complete' : state === 'prog' ? 'Today’s log is in progress' : 'Today’s log hasn’t been started'),
      h('h3', null, state === 'done' ? 'Today is in the book.' : state === 'prog' ? 'Pick up where you left off.' : 'How was today?'),
      h('p', { class: 'muted', style: { marginTop: '8px', fontSize: '15px' } },
        state === 'done' ? 'You can open it any time to add a song, a photo or a thought you forgot.' : state === 'prog' ? 'Everything you’ve written so far is saved.' : 'A few quiet minutes before bed. There’s no wrong time and nothing to catch up on.')),
    h('div', { class: 'row wrap' },
      h('a', { class: 'btn warm', href: '#/log/today' }, state === 'done' ? 'Open today’s log' : state === 'prog' ? 'Continue' : 'Start tonight’s log'),
      state !== 'none' ? null : h('span', { class: 'tiny muted' }, 'About 3–5 minutes')));

  const hero = h('div', { class: 'card' },
    h('div', { class: 'row between wrap', style: { alignItems: 'flex-start' } },
      h('div', null, h('div', { class: 'stat-label' }, 'Available balance'), h('div', { class: 'big', style: { marginTop: '4px', color: T.available < 0 ? 'var(--bad)' : '' } }, money(T.available))),
      h('button', { class: 'btn small', onClick: () => openTxModal({ onDone: refresh }) }, '+ Add transaction')),
    h('div', { class: 'row gap-l', style: { marginTop: '22px' } },
      h('div', null, h('div', { class: 'stat-label' }, 'Income this month'), h('div', { class: 'stat pos' }, money(M.income))),
      h('div', null, h('div', { class: 'stat-label' }, 'Spending this month'), h('div', { class: 'stat' }, money(M.spending)))));

  const mini = h('div', { class: 'card' }, h('div', { class: 'mini-stats' },
    [['Savings', T.savings], ['Assets', T.assets], ['Debts', T.debts], ['Net worth', T.net]].map(([l, v]) =>
      h('div', null, h('div', { class: 'stat-label' }, l), h('div', { class: 'stat', style: { color: l === 'Net worth' && v < 0 ? 'var(--bad)' : '' } }, money0(v))))),
    h('div', { class: 'row between', style: { marginTop: '12px' } }, h('span', { class: 'tiny faint' }, 'Net worth = balance + savings + assets − debts'), h('a', { class: 'link', href: '#/money?tab=worth' }, 'Details')));

  const recent = S.d.transactions.filter((t) => t.date <= today).slice(0, 5);
  const txCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Recent transactions'), h('a', { class: 'link', href: '#/money' }, 'See all')),
    recent.length ? h('div', { class: 'list' }, recent.map((t) => h('div', null, txRow(t, () => openTxModal({ tx: t, onDone: refresh }))))) : h('div', { class: 'empty' }, 'No transactions yet. Add one to see your balance move.'));

  // Life side
  const logs = [...S.logs.values()].filter((l) => logHasContent(l) && l.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const entries = logs.slice(0, 4);
  const entryCard = h('div', { class: 'card warm' },
    h('div', { class: 'card-head' }, h('h3', null, 'Recent entries'), h('a', { class: 'link', href: '#/calendar' }, 'Calendar')),
    entries.length ? h('div', null, entries.map((l) => {
      const ms = moodScore(l);
      return h('a', { class: 'entry', href: `#/log/${l.date}` },
        h('div', { class: 'd' }, h('b', null, dayNum(l.date)), h('span', null, monShort(l.date))),
        h('div', { class: 'grow' }, h('div', { class: 'ex' }, excerpt(l)), ms != null ? h('span', { class: 'mood' }, h('i'), `Felt about ${fmt1(l.ratings.happiness ?? ms)}/10`) : null),
        l.photo_id ? photoImg(l.photo_id) : null);
    })) : h('div', { class: 'empty' }, 'Your entries will gather here.'));

  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const hv = last14.map((d) => S.logs.get(d)?.ratings?.happiness ?? null);
  const hAvg = avg(hv.filter((v) => v != null));
  const moodCard = h('div', { class: 'card warm' },
    h('div', { class: 'card-head' }, h('h3', null, 'Mood lately'), h('a', { class: 'link', href: '#/insights' }, 'Insights')),
    hAvg == null ? h('div', { class: 'empty' }, 'Rate a few days and a gentle trend appears here.') :
      h('div', null, h('div', { class: 'row between' }, h('div', null, h('div', { class: 'stat serif' }, fmt1(hAvg), h('span', { class: 'muted small' }, ' / 10 happiness')), h('div', { class: 'small muted' }, `Average over ${plural(hv.filter((v) => v != null).length, 'logged day')} in the last two weeks`)),
        h('div', { style: { color: 'var(--ink)' } }, sparkline(hv, { w: 130, hgt: 44 })))));

  const weekAct = {};
  for (let i = 0; i < 7; i++) for (const a of S.logs.get(addDays(today, -i))?.activities || []) weekAct[a.type] = (weekAct[a.type] || 0) + 1;
  const actEntries = Object.entries(weekAct).sort((a, b) => b[1] - a[1]);
  const actCard = h('div', { class: 'card warm' },
    h('div', { class: 'card-head' }, h('h3', null, 'This week, you…')),
    actEntries.length ? h('div', { class: 'chips' }, actEntries.map(([t, n]) => h('span', { class: 'chip' }, ACT_LABEL[t] || t, n > 1 ? ` ×${n}` : ''))) : h('div', { class: 'empty' }, 'Activities you record will show up here.'));

  const saved = [];
  for (const l of logs) {
    const c = l.culture || {};
    if (c.song) saved.push(['song', c.song, c.artist, l.date]); if (c.film) saved.push(['film', c.film, 'Film', l.date]);
    if (c.show) saved.push(['show', c.show, 'TV', l.date]); if (c.book) saved.push(['book', c.book, 'Book', l.date]);
    if (saved.length >= 12) break;
  }
  const seen = new Set(); const uniq = saved.filter(([k, t]) => { const key = k + t; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5);
  const savedCard = h('div', { class: 'card warm' },
    h('div', { class: 'card-head' }, h('h3', null, 'Recently saved'), h('a', { class: 'link', href: '#/calendar?tab=library' }, 'Library')),
    uniq.length ? h('div', null, uniq.map(([k, t, sub, d]) => h('a', { class: 'media-li', href: `#/log/${d}`, style: { textDecoration: 'none' } }, mediaIcon(k),
      h('div', { class: 'grow' }, h('div', { class: 't', style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t), h('div', { class: 's small muted' }, sub || '')),
      h('span', { class: 'tiny muted' }, shortDate(d))))) : h('div', { class: 'empty' }, 'Songs, films and books you save will collect here.'));

  const otd = onThisDay(today)[0];
  const otdCard = otd ? h('a', { class: 'card otd', href: `#/log/${otd.log.date}`, style: { textDecoration: 'none' } },
    h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'On this day'), h('h3', null, otd.yearsAgo === 1 ? 'One year ago…' : `${otd.yearsAgo} years ago…`),
      h('p', { style: { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, excerpt(otd.log)),
      otd.log.culture?.song ? h('p', { class: 'small', style: { opacity: .7, marginTop: '8px', fontFamily: 'var(--sans)' } }, '♪ ' + otd.log.culture.song + (otd.log.culture.artist ? ' — ' + otd.log.culture.artist : '')) : null),
    otd.log.photo_id ? photoImg(otd.log.photo_id) : null) : null;

  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head', style: { marginBottom: 0 } }, h('div', null, h('h1', { class: 'hello' }, `${greeting()}${name ? ', ' + name : ''}`), h('p', { class: 'page-sub' }, longDate(today)))),
    h('div', { class: 'grid g-hero' }, hero, tonight),
    mini,
    otdCard,
    h('div', { class: 'grid g2', style: { alignItems: 'start' } }, txCard, entryCard),
    h('div', { class: 'grid g3', style: { alignItems: 'start' } }, moodCard, actCard, savedCard));
}
