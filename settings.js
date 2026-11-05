import { h, clear, field, select, toast, modal, confirmDialog, todayStr, money, plural, refresh } from '../util.js';
import { api } from '../api.js';
import { S, saveSettings, loadAll } from '../store.js';
import { downloadBlob } from '../ui.js';

export function renderSettings() {
  const st = S.d.settings;
  const block = (title, desc, ...kids) => h('div', { class: 'card settings-block' }, h('h3', null, title), desc ? h('p', { class: 'd' }, desc) : null, ...kids);

  // profile
  const name = h('input', { type: 'text', maxlength: 60, value: st.display_name || '', placeholder: 'What should Daybook call you?' });
  const cur = select([['£', '£ Pound'], ['$', '$ Dollar'], ['€', '€ Euro']], st.currency);
  const bal = h('input', { type: 'text', inputmode: 'decimal', value: String(st.starting_balance) });
  const perr = h('div', { class: 'form-err' });
  const profile = block('Profile', null, h('form', { onSubmit: async (e) => {
    e.preventDefault(); perr.textContent = ''; const b = Number(bal.value.replace(/[£$€,\s]/g, ''));
    if (!Number.isFinite(b)) { perr.textContent = 'Starting balance must be a number.'; return; }
    try { await saveSettings({ display_name: name.value.trim(), currency: cur.value, starting_balance: b }); toast('Saved'); } catch (ex) { perr.textContent = ex.message; }
  } }, field('Name', name), h('div', { class: 'form-row' }, field('Currency', cur), field('Starting balance', bal, 'What you had before your first recorded transaction.')), perr, h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));

  // account
  const cp = h('input', { type: 'password', autocomplete: 'current-password' }), np = h('input', { type: 'password', autocomplete: 'new-password', minlength: 10 }), aerr = h('div', { class: 'form-err' });
  const account = block('Account', `Signed in as ${S.user.email}`, h('form', { onSubmit: async (e) => {
    e.preventDefault(); aerr.textContent = '';
    try { await api('POST', '/auth/change-password', { currentPassword: cp.value, newPassword: np.value }); cp.value = ''; np.value = ''; toast('Password changed. Other devices were signed out.'); } catch (ex) { aerr.textContent = ex.message; }
  } }, h('div', { class: 'form-row' }, field('Current password', cp), field('New password', np, 'At least 10 characters')), aerr,
    h('div', { class: 'row wrap', style: { marginTop: '14px' } }, h('button', { class: 'btn', type: 'submit' }, 'Change password'), h('button', { class: 'btn', type: 'button', onClick: async () => { try { await api('POST', '/auth/logout'); } catch { /* ignore */ } window.dispatchEvent(new Event('daybook:signout')); } }, 'Sign out'))));

  // data
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', 'aria-label': 'Choose backup file', onChange: async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch { toast('That file isn’t valid JSON.', true); return; }
    if (!(await confirmDialog('Restoring replaces everything currently in your Daybook (transactions, pots, logs, photos) with the contents of the backup. Consider downloading a backup first.', { okText: 'Replace with backup', title: 'Restore this backup?' }))) return;
    try { const r = await api('POST', '/import', { data }); await loadAll(); toast(`Restored ${plural(r.counts.transactions, 'transaction')} and ${plural(r.counts.logs, 'daily log')}`); refresh(); } catch (ex) { toast(ex.message, true); }
  } });
  const data = block('Your data', 'Everything is yours. Download it any time, or restore it later (or into a new account).',
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onClick: async () => { try { const d = await api('GET', '/export'); downloadBlob(new Blob([JSON.stringify(d)], { type: 'application/json' }), `daybook-backup-${todayStr()}.json`); toast('Backup downloaded'); } catch (ex) { toast(ex.message, true); } } }, 'Download full backup'),
      h('button', { class: 'btn', onClick: async () => { try { const r = await fetch('/api/export/transactions.csv', { credentials: 'same-origin' }); if (!r.ok) throw new Error('Export failed'); downloadBlob(await r.blob(), 'daybook-transactions.csv'); } catch (ex) { toast(ex.message, true); } } }, 'Export transactions (CSV)'),
      h('label', { class: 'btn' }, 'Restore from backup…', file)),
    h('p', { class: 'tiny faint', style: { marginTop: '10px' } }, 'The backup file includes your journal and photos. Keep it somewhere private.'));

  // demo
  const real = S.d.transactions.some((t) => !t.demo) || [...S.logs.values()].some((l) => !l.demo) || S.d.pots.some((p) => !p.demo) || S.d.holdings.some((x) => !x.demo);
  const demo = block('Demonstration data', st.has_demo ? 'You’re currently looking at fictional example data (marked by the banner at the top).' : 'Fictional example entries, handy for looking around. They’re always clearly separate from your own records.',
    h('div', { class: 'row wrap' },
      st.has_demo || !real ? h('button', { class: 'btn', onClick: async () => {
        if (st.has_demo && !(await confirmDialog('The example data is deleted and recreated fresh. Anything you added yourself stays.', { okText: 'Reset demo data', danger: false, title: 'Reset demo data?' }))) return;
        try { await api('POST', '/demo/reset', { today: todayStr() }); await loadAll(); S.demoDismissed = false; toast('Demo data loaded'); refresh(); } catch (ex) { toast(ex.message, true); }
      } }, st.has_demo ? 'Reset demo data' : 'Load demo data') : h('span', { class: 'small muted' }, 'Demo data can only be loaded into an empty account.'),
      st.has_demo ? h('button', { class: 'btn danger', onClick: async () => { if (!(await confirmDialog('All the example entries are removed. Your own records stay.', { okText: 'Clear demo data', title: 'Clear demo data?' }))) return; try { await api('DELETE', '/demo'); await loadAll(); toast('Demo data cleared'); refresh(); } catch (ex) { toast(ex.message, true); } } }, 'Clear demo data') : null));

  // danger
  const danger = block('Delete account', 'Permanently deletes your account and every record, journal entry and photo. This can’t be undone.',
    h('button', { class: 'btn danger', onClick: () => {
      const pw = h('input', { type: 'password', autocomplete: 'current-password' }), err = h('div', { class: 'form-err' });
      const close = modal({ title: 'Delete your account?', body: h('form', { onSubmit: async (e) => {
        e.preventDefault();
        try { await api('POST', '/auth/delete-account', { password: pw.value }); close(); toast('Your account was deleted.'); window.dispatchEvent(new Event('daybook:signout')); } catch (ex) { err.textContent = ex.message; }
      } }, h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Download a backup first if you want to keep anything. Enter your password to confirm.'), field('Password', pw), err,
        h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn danger solid', type: 'submit' }, 'Delete everything'))) });
    } }, 'Delete my account…'));

  return h('div', { class: 'log-wrap', style: { maxWidth: '680px' } }, h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, 'Settings'), h('p', { class: 'page-sub' }, 'Private to you. Only you can see your records.'))),
    profile, account, data, demo, danger,
    h('p', { class: 'tiny faint', style: { textAlign: 'center', marginTop: '18px' } }, 'Daybook — passwords are hashed with scrypt, and every record is protected by database row-level security.'));
}
