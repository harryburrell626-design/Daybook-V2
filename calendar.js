import { h, clear, icon, todayStr, addDays, monthKey, addMonths, monthTitle, longDate, shortDate, dayNum, parse, ymd, money, durText, segmented, modal, refresh, dowIndexMon, monShort, plural, fmt1 } from '../util.js';
import { S, logHasContent, getLog, dayFinance, onThisDay } from '../store.js';
import { ACT_LABEL, RATINGS, excerpt } from '../constants.js';
import { photoImg, txRow, openTxModal, mediaIcon } from '../ui.js';

export function renderCalendar(q) {
  const tab = ['photos', 'library'].includes(q.tab) ? q.tab : 'calendar';
  const tabs = h('div', { class: 'tabs' }, [['calendar', 'Calendar'], ['photos', 'Photos'], ['library', 'Songs, films & books']].map(([k, l]) => h('a', { href: k === 'calendar' ? '#/calendar' : `#/calendar?tab=${k}`, class: tab === k ? 'on' : '' }, l)));
  const head = h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, 'Looking back'), h('p', { class: 'page-sub' }, 'Every day you’ve kept, in one place.')));
  return h('div', null, head, tabs, tab === 'photos' ? photosTab() : tab === 'library' ? libraryTab(q) : calendarTab(q));
}

function calendarTab(q) {
  const today = todayStr();
  let month = /^\d{4}-\d{2}$/.test(q.m || '') ? q.m : monthKey(today);
  let sel = q.d && /^\d{4}-\d{2}-\d{2}$/.test(q.d) ? q.d : today;
  if (q.d) month = monthKey(sel);
  const gridBox = h('div'), panel = h('div', { class: 'day-panel' }), title = h('div', { class: 'cal-title' });

  const txDates = new Set(S.d.transactions.map((t) => t.date));
  function drawGrid() {
    clear(gridBox); title.textContent = monthTitle(month);
    const first = month + '-01', lead = dowIndexMon(first), start = addDays(first, -lead);
    const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': monthTitle(month) });
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => grid.append(h('div', { class: 'cal-dow' }, d)));
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i); if (i >= 35 && monthKey(d) !== month) break;
      const l = getLog(d), has = l && logHasContent(l), future = d > today;
      const marks = h('div', { class: 'marks' });
      if (has) marks.append(h('span', { class: 'm log ' + (l.completed ? '' : 'part'), title: l.completed ? 'Daily log completed' : 'Daily log started' }));
      if (txDates.has(d)) marks.append(h('span', { class: 'm tx', title: 'Has transactions' }));
      const label = `${longDate(d, true)}${has ? (l.completed ? ', log completed' : ', log started') : ''}${txDates.has(d) ? ', has transactions' : ''}`;
      grid.append(h('button', { class: ['cal-day', monthKey(d) !== month ? 'out' : '', d === today ? 'today' : '', d === sel ? 'sel' : ''].join(' '), 'aria-label': label, 'aria-pressed': d === sel ? 'true' : 'false',
        onClick: () => { sel = d; if (monthKey(d) !== month) month = monthKey(d); drawGrid(); drawPanel(); }, onDblclick: () => { if (!future) location.hash = `#/log/${d}`; } },
        l?.photo_id ? h('span', { class: 'ph', title: 'Has a photo' }) : null, h('span', { class: 'n' }, dayNum(d)), marks));
    }
    gridBox.append(grid);
  }
  function drawPanel() {
    clear(panel);
    const l = getLog(sel), has = l && logHasContent(l), f = dayFinance(sel), future = sel > today;
    const card = h('div', { class: 'card ' + (has ? 'warm' : '') });
    card.append(h('div', { class: 'card-head' }, h('h3', { class: 'serif', style: { fontSize: '21px', fontWeight: 500 } }, longDate(sel, true)),
      future ? null : h('a', { class: 'btn small ' + (has ? '' : 'warm'), href: `#/log/${sel}` }, has ? (l.completed ? 'Open log' : 'Continue log') : 'Write this day’s log')));
    if (future) card.append(h('p', { class: 'muted' }, 'This day hasn’t happened yet.'));
    if (has) {
      const row = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } });
      const col = h('div', { class: 'grow stack' });
      col.append(h('p', { class: 'serif', style: { fontSize: '17px', lineHeight: 1.55 } }, excerpt(l)));
      const r = l.ratings || {}; const rt = RATINGS.filter(([k]) => r[k] != null);
      if (rt.length) col.append(h('div', { class: 'chips' }, rt.slice(0, 4).map(([k, n]) => h('span', { class: 'tag' }, `${n.replace('General ', '')} ${r[k]}`))));
      const c = l.culture || {}, bits = [];
      if (c.song) bits.push(['song', c.song + (c.artist ? ' — ' + c.artist : '')]); if (c.film) bits.push(['film', c.film]); if (c.show) bits.push(['show', c.show]); if (c.book) bits.push(['book', c.book]);
      bits.forEach(([k, t]) => col.append(h('div', { class: 'media-li', style: { padding: '2px 0' } }, mediaIcon(k), h('div', { class: 'small' }, t))));
      if ((l.activities || []).length) col.append(h('div', { class: 'chips' }, l.activities.map((a) => h('span', { class: 'chip tiny' }, a.label || ACT_LABEL[a.type]))));
      if (l.sleep?.minutes != null) col.append(h('div', { class: 'tiny muted' }, `Slept ${durText(l.sleep.minutes)}` + (l.screen?.total != null ? ` · Screens ${durText(l.screen.total)}` : '')));
      row.append(col);
      if (l.photo_id) row.append(h('div', { style: { width: '120px', flex: 'none' } }, photoImg(l.photo_id, '', 'Photo from this day')));
      card.append(row);
      if (l.photo_id) row.lastChild.firstChild.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px';
    } else if (!future) card.append(h('p', { class: 'muted small' }, 'No log for this day. That’s fine — you can add one now if you like.'));
    if (!future) {
      card.append(h('hr', { class: 'sep' }), h('div', { class: 'row between' }, h('div', { class: 'small muted' }, f.count ? `${money(f.spent)} spent${f.income ? ` · ${money(f.income)} in` : ''}` : 'No transactions'),
        h('button', { class: 'btn small ghost', onClick: () => openTxModal({ date: sel, onDone: () => { refresh(); } }) }, '+ Add')));
      if (f.count) card.append(h('div', { class: 'list' }, f.list.map((t) => h('div', null, txRow(t, () => openTxModal({ tx: t, onDone: () => refresh() }))))));
    }
    panel.append(card);
  }
  const otd = onThisDay(today)[0];
  const nav = h('div', { class: 'cal-head' }, title, h('div', { class: 'row gap-s' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onClick: () => { month = addMonths(month, -1); drawGrid(); } }, icon('M15 5l-7 7 7 7')),
    h('button', { class: 'btn small', onClick: () => { month = monthKey(today); sel = today; drawGrid(); drawPanel(); } }, 'Today'),
    h('button', { class: 'icon-btn', 'aria-label': 'Next month', onClick: () => { month = addMonths(month, 1); drawGrid(); } }, icon('M9 5l7 7-7 7'))));
  drawGrid(); drawPanel();
  return h('div', null,
    otd ? h('a', { class: 'card otd', href: `#/log/${otd.log.date}`, style: { textDecoration: 'none', marginBottom: '16px' } }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'On this day'), h('h3', null, otd.yearsAgo === 1 ? 'One year ago…' : `${otd.yearsAgo} years ago…`), h('p', { style: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, excerpt(otd.log))), otd.log.photo_id ? photoImg(otd.log.photo_id) : null) : null,
    h('div', { class: 'card' }, nav, gridBox, h('div', { class: 'legend' },
      h('span', null, h('i', { class: 'm', style: { background: 'var(--warm)' } }), 'Log completed'), h('span', null, h('i', { class: 'm', style: { boxShadow: 'inset 0 0 0 1.5px var(--warm)' } }), 'Log started'),
      h('span', null, h('i', { class: 'm', style: { background: 'var(--ink3)', borderRadius: '2px', height: '3px' } }), 'Has transactions'))),
    panel);
}

function photosTab() {
  const items = [...S.logs.values()].filter((l) => l.photo_id).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!items.length) return h('div', { class: 'card empty' }, 'No photos yet. Add a “photo of the day” to any log and it will appear here.');
  const out = h('div'); let lastM = '';
  let grid;
  for (const l of items) {
    const m = monthKey(l.date);
    if (m !== lastM) { lastM = m; out.append(h('div', { class: 'month-label' }, monthTitle(m))); grid = h('div', { class: 'photo-grid' }); out.append(grid); }
    grid.append(h('button', { class: 'photo-tile', 'aria-label': `Photo from ${longDate(l.date, true)}`, onClick: () => {
      const c = l.culture || {};
      const close = modal({ title: longDate(l.date, true), wide: true, body: h('div', { class: 'lightbox' }, photoImg(l.photo_id, '', 'Photo of the day'),
        h('div', { style: { padding: '14px 4px 0' } }, h('p', { class: 'serif', style: { fontSize: '17px' } }, excerpt(l)), c.song ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, '♪ ' + c.song + (c.artist ? ' — ' + c.artist : '')) : null,
          h('div', { class: 'modal-actions' }, h('a', { class: 'btn warm', href: `#/log/${l.date}`, onClick: () => close() }, 'Open this day')))) });
    } }, photoImg(l.photo_id, '', ''), h('span', null, shortDate(l.date, true))));
  }
  return h('div', null, h('p', { class: 'muted small' }, plural(items.length, 'photo'), ' kept so far.'), out);
}

function libraryTab(q) {
  const KINDS = [['song', 'Songs'], ['film', 'Films'], ['show', 'TV'], ['book', 'Books']];
  let kind = KINDS.some(([k]) => k === q.kind) ? q.kind : 'song';
  const box = h('div');
  const all = [...S.logs.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  function draw() {
    clear(box);
    const rows = [];
    for (const l of all) { const c = l.culture || {}; if (c[kind]) rows.push({ date: l.date, title: c[kind], sub: kind === 'song' ? c.artist : '' }); }
    if (!rows.length) { box.append(h('div', { class: 'card empty' }, 'Nothing saved here yet.')); return; }
    const counts = {}; rows.forEach((r) => { counts[r.title] = (counts[r.title] || 0) + 1; });
    let lastM = ''; let card;
    box.append(h('p', { class: 'muted small', style: { marginBottom: '6px' } }, `${plural(rows.length, 'entry', 'entries')}, ${plural(Object.keys(counts).length, 'different title')}.`));
    for (const r of rows) {
      const m = monthKey(r.date);
      if (m !== lastM) { lastM = m; box.append(h('div', { class: 'month-label' }, monthTitle(m))); card = h('div', { class: 'card list', style: { padding: '6px 16px' } }); box.append(card); }
      card.append(h('a', { class: 'media-li', href: `#/log/${r.date}`, style: { textDecoration: 'none' } }, mediaIcon(kind),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.title), r.sub ? h('div', { class: 'small muted' }, r.sub) : null),
        counts[r.title] > 1 ? h('span', { class: 'tag' }, `×${counts[r.title]}`) : null, h('span', { class: 'tiny muted', style: { minWidth: '56px', textAlign: 'right' } }, shortDate(r.date))));
    }
  }
  draw();
  return h('div', null, h('div', { style: { marginBottom: '8px' } }, segmented(KINDS, kind, (v) => { kind = v; draw(); })), box);
}
