// DOM helpers, dates, money, modal, toast
const SVGNS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
// h('div', {class:'x', onClick: fn}, ...children). Text is always inserted as text (never HTML), so user content can't inject markup.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue; if (k === 'class') el.setAttribute('class', v); else el.setAttribute(k, v); }
  append(el, kids);
  return el;
}
export const icon = (d, cls = 'ico') => s('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' }, ...[].concat(d).map((p) => (p.startsWith('<circle') ? s('circle', { cx: 12, cy: 12, r: 9 }) : s('path', { d: p }))));
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ── dates (all handled as local YYYY-MM-DD strings) ──
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (str) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const todayStr = () => ymd(new Date());
export const addDays = (str, n) => { const d = parse(str); d.setDate(d.getDate() + n); return ymd(d); };
export const monthKey = (str) => str.slice(0, 7);
export const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && ymd(parse(s)) === s;
const F = (o) => new Intl.DateTimeFormat('en-GB', o);
const fLong = F({ weekday: 'long', day: 'numeric', month: 'long' }), fLongY = F({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fShort = F({ day: 'numeric', month: 'short' }), fShortY = F({ day: 'numeric', month: 'short', year: 'numeric' });
const fMonth = F({ month: 'long', year: 'numeric' }), fMon = F({ month: 'short' }), fDow = F({ weekday: 'short' }), fWd = F({ weekday: 'long' });
export const longDate = (s, withYear) => (withYear ? fLongY : fLong).format(parse(s));
export const shortDate = (s, withYear) => (withYear ? fShortY : fShort).format(parse(s));
export const monthTitle = (ym) => fMonth.format(parse(ym + '-01'));
export const monShort = (s) => fMon.format(parse(s));
export const dowShort = (s) => fDow.format(parse(s));
export const weekday = (s) => fWd.format(parse(s));
export const dowIndexMon = (s) => (parse(s).getDay() + 6) % 7; // Mon=0
export const dayNum = (s) => Number(s.slice(8));
export function relDay(s) {
  const t = todayStr();
  if (s === t) return 'Today'; if (s === addDays(t, -1)) return 'Yesterday'; if (s === addDays(t, 1)) return 'Tomorrow';
  return shortDate(s, s.slice(0, 4) !== t.slice(0, 4));
}
export const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };

// ── money ──
let CUR = '£';
export const setCurrency = (c) => { CUR = c || '£'; };
export const money = (n, { sign = false, dp = 2 } = {}) => {
  const neg = n < 0; const v = Math.abs(n);
  const str = v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (neg ? '−' : sign && n > 0 ? '+' : '') + CUR + str;
};
export const money0 = (n) => money(Math.round(n), { dp: 0 });
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const durText = (mins) => { if (mins == null) return '–'; const hh = Math.floor(mins / 60), m = Math.round(mins % 60); return hh ? (m ? `${hh}h ${m}m` : `${hh}h`) : `${m}m`; };
export const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
export const fmt1 = (n) => (n == null ? '–' : (Math.round(n * 10) / 10).toString());
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + 's'}`;
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); }; return d; };

// ── toast & modal ──
let toastEl;
export function toast(msg, err = false) {
  toastEl?.remove();
  toastEl = h('div', { class: 'toast' + (err ? ' err' : ''), role: 'status' }, msg);
  document.body.append(toastEl);
  const el = toastEl;
  setTimeout(() => el.remove(), err ? 5000 : 2600);
}
export function modal({ title, body, wide = false, onClose }) {
  const prevFocus = document.activeElement;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prevFocus?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: close }, icon('M6 6l12 12M18 6L6 18'))),
    h('div', { class: 'modal-body' }, body));
  const overlay = h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === overlay) close(); } }, panel);
  document.body.append(overlay); document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  setTimeout(() => panel.querySelector('input:not([type=hidden]), textarea, select')?.focus({ preventScroll: true }), 30);
  return close;
}
export function confirmDialog(message, { okText = 'Delete', danger = true, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const close = modal({
      title, onClose: () => finish(false),
      body: h('div', null, h('p', { class: 'muted' }, message),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onClick: () => close() }, 'Cancel'),
          h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), onClick: () => { finish(true); close(); } }, okText))),
    });
  });
}

// ── form bits ──
export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lab' }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
export function select(options, value, props = {}) {
  return h('select', props, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === value }, l); }));
}
export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  const draw = (cur) => { clear(el); for (const [v, l] of options) el.append(h('button', { type: 'button', class: v === cur ? 'on' : '', onClick: () => { draw(v); onChange(v); } }, l)); };
  draw(value); return el;
}
export const link = (href, cls, ...kids) => h('a', { href, class: cls }, ...kids);
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const refresh = () => window.dispatchEvent(new Event('daybook:refresh'));

// ── recurring schedules (mirror of server/recurring.js) ──
export const FREQ = [['weekly', 'Weekly'], ['fortnightly', 'Every 2 weeks'], ['four_weekly', 'Every 4 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Every 3 months'], ['yearly', 'Yearly']];
const FDAYS = { weekly: 7, fortnightly: 14, four_weekly: 28 }, FMONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
export function occurrence(start, freq, n) {
  const [y, m, day] = start.split('-').map(Number);
  const f = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (FDAYS[freq]) return f(new Date(Date.UTC(y, m - 1, day + FDAYS[freq] * n)));
  const total = (m - 1) + FMONTHS[freq] * n, ty = y + Math.floor(total / 12), tm = total % 12;
  return f(new Date(Date.UTC(ty, tm, Math.min(day, new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()))));
}
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
export const perMonth = (amount, freq) => amount * ({ weekly: 52 / 12, fortnightly: 26 / 12, four_weekly: 13 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[freq]);
export function freqText(freq, start) {
  const day = Number(start.slice(8));
  if (freq === 'monthly') return `Monthly on the ${ordinal(day)}`;
  if (freq === 'quarterly') return `Every 3 months from the ${ordinal(day)}`;
  if (freq === 'yearly') return `Yearly on ${shortDate(start)}`;
  return `${FREQ.find((x) => x[0] === freq)[1]} on ${weekday(start)}s`;
}
