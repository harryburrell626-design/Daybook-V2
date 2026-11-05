import { api } from './api.js';
import { S, loadAll, clearAll } from './store.js';
import { h, s, icon, clear, todayStr, modal, toast, confirmDialog, refresh } from './util.js';
import { renderAuth } from './views/auth.js';
import { renderOverview } from './views/overview.js';
import { renderLog } from './views/log.js';
import { renderCalendar } from './views/calendar.js';
import { renderMoney } from './views/money.js';
import { renderInsights } from './views/insights.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');
const AUTH_ROUTES = ['login', 'signup', 'forgot', 'reset'];
let current = null; // {leave?: () => Promise}
let shell = null;
let routing = Promise.resolve();

const NAV = [
  ['overview', '#/', 'Overview', 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  ['today', '#/log/today', 'Today', 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 8h6M9 12h5'],
  ['calendar', '#/calendar', 'Calendar', 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4'],
  ['money', '#/money', 'Money', 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7V6a2 2 0 0 1 2-2h10M16 14h2'],
  ['insights', '#/insights', 'Insights', 'M5 20V10M12 20V4M19 20v-7'],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function buildShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map(([k, href, label]) => h('a', { href, 'data-k': k }, label)));
  const tab = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, NAV.map(([k, href, label, d]) => h('a', { href, 'data-k': k }, icon(d, ''), label)));
  const banner = h('div', { id: 'banner' });
  const main = h('main', { id: 'main', tabindex: '-1' });
  const el = h('div', { class: 'shell' },
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }), 'Daybook'), nav, h('div', { class: 'spacer' }),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings and account', title: 'Settings' }, icon('M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6')))),
    banner, main, tab);
  return { el, main, banner, links: [...nav.children, ...tab.children] };
}

function drawBanner() {
  clear(shell.banner);
  if (!S.d?.settings.has_demo || S.demoDismissed) return;
  shell.banner.append(h('div', { class: 'demo-banner' }, h('div', { class: 'demo-banner-in' },
    h('span', null, 'You’re exploring fictional demo data — none of these people, figures or entries are real.'),
    h('button', { onClick: async () => {
      if (!(await confirmDialog('This removes all the example entries. Anything you added yourself stays.', { okText: 'Clear demo data', title: 'Clear demo data?' }))) return;
      try { await api('DELETE', '/demo'); await loadAll(); toast('Demo data cleared'); refresh(); } catch (e) { toast(e.message, true); }
    } }, 'Clear demo data'),
    h('button', { onClick: () => { S.demoDismissed = true; drawBanner(); } }, 'Dismiss'))));
}

async function route() {
  if (current?.leave) { try { await current.leave(); } catch { /* ignore */ } }
  current = null;
  const { parts, q } = parseHash();
  const first = parts[0] || '';
  const authRoute = AUTH_ROUTES.includes(first);

  if (!S.user) {
    if (!authRoute) { history.replaceState(null, '', '#/login'); return route(); }
    shell = null; document.body.dataset.zone = ''; clear(app);
    app.append(renderAuth(first, q, async () => { try { await loadAll(); } catch (e) { toast(e.message, true); } location.hash = '#/'; }));
    return;
  }
  if (authRoute) { history.replaceState(null, '', '#/'); return route(); }
  if (!S.d) { try { await loadAll(); } catch (e) { clear(app); app.append(h('div', { class: 'auth' }, h('div', { class: 'auth-card card' }, h('p', null, e.message), h('button', { class: 'btn', onClick: () => location.reload() }, 'Try again')))); return; } }

  if (!shell || !app.contains(shell.el)) { clear(app); shell = buildShell(); app.append(shell.el); }
  drawBanner();

  let key = 'overview', view;
  const scrollY = window.scrollY;
  if (first === '' ) { view = renderOverview(); }
  else if (first === 'log') {
    let date = parts[1] === 'today' || !parts[1] ? todayStr() : parts[1];
    key = date === todayStr() ? 'today' : 'calendar';
    document.body.dataset.zone = 'log';
    view = renderLog(date, q);
  } else if (first === 'calendar') { key = 'calendar'; view = renderCalendar(q); }
  else if (first === 'money') { key = 'money'; view = renderMoney(q); }
  else if (first === 'insights') { key = 'insights'; view = renderInsights(q); }
  else if (first === 'settings') { key = ''; view = renderSettings(); }
  else { history.replaceState(null, '', '#/'); return route(); }
  if (first !== 'log') document.body.dataset.zone = '';

  for (const a of shell.links) a.classList.toggle('on', a.dataset.k === key);
  const node = view?.el || view;
  current = view?.el ? view : null;
  clear(shell.main); shell.main.append(node);
  if (window.__refreshing) { window.scrollTo(0, scrollY); window.__refreshing = false; } else window.scrollTo(0, 0);
  document.title = 'Daybook';
}
const queueRoute = () => { routing = routing.then(route).catch((e) => console.error(e)); };

window.addEventListener('hashchange', queueRoute);
window.addEventListener('daybook:refresh', () => { window.__refreshing = true; queueRoute(); });
window.addEventListener('daybook:unauth', () => { if (S.user) { clearAll(); toast('Please sign in again.', true); location.hash = '#/login'; queueRoute(); } });
window.addEventListener('daybook:signout', () => { clearAll(); shell = null; location.hash = '#/login'; queueRoute(); });
window.addEventListener('pagehide', () => { current?.pagehide?.(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') current?.pagehide?.(); });

(async function boot() {
  try { const { user } = await api('GET', '/auth/me'); S.user = user; await loadAll(); } catch { S.user = null; }
  queueRoute();
})();
