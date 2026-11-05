// Shared UI pieces: category icons, transaction form/modal/rows, photos
import { h, s, icon, field, select, segmented, modal, toast, confirmDialog, todayStr, money, shortDate, round2, clear, FREQ } from './util.js';
import { api } from './api.js';
import * as St from './store.js';

export const EXPENSE_CATS = ['Rent & housing', 'Bills', 'Groceries', 'Eating out', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Insurance', 'Subscriptions', 'Debt repayments', 'Other spending'];
export const INCOME_CATS = ['Salary', 'Pension & benefits', 'Other income'];
const CAT_ICON = {
  'Rent & housing': 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', Bills: 'M13 2L4 14h7l-1 8 9-12h-7z',
  Groceries: 'M4 9h16l-1.6 10a2 2 0 0 1-2 1.7H7.6a2 2 0 0 1-2-1.7zM8 9l3-5M16 9l-3-5', 'Eating out': 'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
  Transport: 'M5 4h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM4 11h16M8 21v-3M16 21v-3', Shopping: 'M5 8h14l1 12H4zM9 8V6a3 3 0 0 1 6 0v2',
  Entertainment: 'M4 5h16v14H4zM4 9h16M4 15h16M8 5v14M16 5v14', Health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  Insurance: 'M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z', 'Debt repayments': 'M4 8h16v10H4zM4 12h16M8 16h3', 'Pension & benefits': 'M12 4v12M7 11l5 5 5-5M5 20h14',
  Subscriptions: 'M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5', Salary: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  'Other income': 'M12 8v8M8 12h8M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'Other spending': 'M6 12h.01M12 12h.01M18 12h.01',
};
export const catIcon = (cat) => h('div', { class: 'cat-ico' }, s('svg', { viewBox: '0 0 24 24' }, s('path', { d: CAT_ICON[cat] || CAT_ICON['Other spending'], 'stroke-width': cat === 'Other spending' ? 3 : null })));

export const MEDIA_ICON = {
  song: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z', film: 'M4 5h16v14H4zM4 9h16M4 15h16M8 5v14M16 5v14',
  show: 'M3 6h18v11H3zM8 21h8M12 17v4', book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
};
export const mediaIcon = (k) => h('div', { class: 'media-kind' }, s('svg', { viewBox: '0 0 24 24' }, s('path', { d: MEDIA_ICON[k] })));

export const PRESETS = {
  expense: [['Rent', 'Rent & housing', 'monthly'], ['Council tax', 'Bills', 'monthly'], ['Energy', 'Bills', 'monthly'], ['Water', 'Bills', 'monthly'], ['Broadband', 'Bills', 'monthly'], ['Phone plan', 'Bills', 'monthly'],
    ['Car insurance', 'Insurance', 'monthly'], ['Home insurance', 'Insurance', 'monthly'], ['Streaming', 'Subscriptions', 'monthly'], ['Gym', 'Subscriptions', 'monthly'], ['Loan repayment', 'Debt repayments', 'monthly']],
  income: [['Salary', 'Salary', 'monthly'], ['Pension', 'Pension & benefits', 'monthly'], ['Benefits', 'Pension & benefits', 'four_weekly'], ['Wages (weekly)', 'Salary', 'weekly']],
};
export function parseAmount(v) {
  const n = Number(String(v).replace(/[£$€,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function txRow(t, onClick) {
  return h('div', { class: 'li click', role: 'button', tabindex: '0', onClick, onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } },
    catIcon(t.category),
    h('div', { class: 'grow' }, h('div', { class: 't' }, t.description || t.category), h('div', { class: 's' }, t.category + (t.recurring_id ? ' · recurring' : '') + (t.notes ? ' · note' : ''))),
    h('div', { class: 'amt ' + (t.type === 'income' ? 'in' : '') }, (t.type === 'income' ? '+' : '−') + money(t.amount)));
}

// Form used both in the modal and (compact) inside the Daily Log. Saves via the API; updates the store.
export function txForm({ tx = null, date = todayStr(), type = 'expense', compact = false, onSaved, onDeleted, onCancel }) {
  let curType = tx?.type || type;
  const amount = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', value: tx ? String(tx.amount) : '', 'aria-label': 'Amount', autocomplete: 'off', enterkeyhint: compact ? 'done' : 'next' });
  const desc = h('input', { type: 'text', placeholder: compact ? 'What was it for?' : 'e.g. Lunch with Sam', value: tx?.description || '', maxlength: 200, 'aria-label': 'Description', enterkeyhint: 'done' });
  const dateIn = h('input', { type: 'date', value: tx?.date || date, required: true, 'aria-label': 'Date' });
  const notes = h('textarea', { rows: 2, placeholder: 'Optional note', maxlength: 2000, style: { minHeight: '64px' } }, tx?.notes || '');
  const cat = h('select', { 'aria-label': 'Category' });
  const fillCats = () => { clear(cat); const cats = curType === 'income' ? INCOME_CATS : EXPENSE_CATS; const want = cats.includes(tx?.category) && curType === tx?.type ? tx.category : cats[curType === 'income' ? 0 : 2]; for (const c of cats) cat.append(h('option', { value: c, selected: c === want }, c)); cat.value = want; };
  fillCats();
  const err = h('div', { class: 'form-err', role: 'alert' });
  const typeSeg = segmented([['expense', 'Spending'], ['income', 'Income']], curType, (v) => { curType = v; fillCats(); });
  const repeat = select([['', 'Doesn’t repeat'], ...FREQ], '', { 'aria-label': 'Repeats' });
  const repeatHint = h('div', { class: 'small muted', style: { marginTop: '6px' } });
  const syncHint = () => { if (!tx && !compact) saveBtn.textContent = repeat.value ? 'Add recurring' : 'Add transaction'; repeatHint.textContent = repeat.value ? (dateIn.value < todayStr() ? 'Repeats from this date. Occurrences up to today are added to your history now; the rest are added automatically as they fall due.' : 'Daybook adds this automatically each time it’s due. Manage it under Money → Bills & income.') : ''; };
  repeat.addEventListener('change', syncHint); dateIn.addEventListener('change', syncHint);
  const presetBox = h('div', { class: 'chips', style: { marginBottom: '14px' } });
  const drawPresets = () => { clear(presetBox); for (const [label, c, f] of PRESETS[curType]) presetBox.append(h('button', { type: 'button', class: 'chip tiny', onClick: () => { desc.value = label; if (![...cat.options].some((o) => o.value === c)) fillCats(); cat.value = c; repeat.value = f; syncHint(); amount.focus(); } }, label)); };
  if (!tx && !compact) { drawPresets(); typeSeg.addEventListener('click', () => setTimeout(() => { drawPresets(); repeat.value = ''; syncHint(); }, 0)); }
  const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, tx ? 'Save changes' : compact ? 'Add' : repeat.value ? 'Add recurring' : 'Add transaction');

  const submit = async (e) => {
    e.preventDefault(); err.textContent = '';
    const a = parseAmount(amount.value);
    if (!(a > 0)) { err.textContent = 'Enter an amount greater than zero.'; amount.focus(); return; }
    if (!dateIn.value) { err.textContent = 'Choose a date.'; return; }
    saveBtn.disabled = true;
    try {
      if (!tx && !compact && repeat.value) {
        await St.saveRecurring({ type: curType, amount: round2(a), category: cat.value, description: desc.value.trim(), notes: notes.value, frequency: repeat.value, start_date: dateIn.value });
        onSaved?.(null, true); return;
      }
      const row = await St.saveTx({ type: curType, amount: round2(a), date: dateIn.value, category: cat.value, description: desc.value.trim(), notes: compact ? (tx?.notes || '') : notes.value }, tx?.id);
      if (compact) { amount.value = ''; desc.value = ''; amount.focus(); }
      onSaved?.(row);
    } catch (ex) { err.textContent = ex.message; } finally { saveBtn.disabled = false; }
  };
  const del = tx && h('button', { class: 'btn danger left', type: 'button', onClick: async () => {
    if (!(await confirmDialog('This will remove the transaction and update your balance.', { okText: 'Delete' }))) return;
    try { await St.deleteTx(tx.id); onDeleted?.(); } catch (ex) { err.textContent = ex.message; }
  } }, 'Delete');

  if (compact) {
    return h('form', { class: 'add-tx', onSubmit: submit },
      h('div', { class: 'row between wrap', style: { marginBottom: '10px' } }, typeSeg, h('span', { class: 'tiny muted' }, `Adds to ${shortDate(dateIn.value)}`)),
      h('div', { class: 'r1' }, amount, desc),
      h('div', { class: 'r2' }, cat, saveBtn), err);
  }
  return h('form', { onSubmit: submit },
    h('div', { style: { marginBottom: '14px' } }, typeSeg),
    !tx ? presetBox : null,
    h('div', { class: 'form-row' }, field('Amount', amount), field('Date', dateIn)),
    field('Category', cat), field('Description', desc),
    !tx ? field('Repeats', repeat, null) : null, !tx ? repeatHint : null,
    field('Notes', notes), tx?.recurring_id ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'This came from a recurring bill or income. Changing it here only affects this one.') : null, err,
    h('div', { class: 'modal-actions' }, del, h('button', { class: 'btn', type: 'button', onClick: onCancel }, 'Cancel'), saveBtn));
}
export function openTxModal({ tx = null, date, type, onDone } = {}) {
  const close = modal({ title: tx ? 'Edit transaction' : 'Add transaction', body: txForm({
    tx, date, type, onCancel: () => close(), onSaved: (row, rec) => { close(); toast(rec ? 'Recurring item added' : tx ? 'Transaction updated' : 'Transaction added'); onDone?.(row); },
    onDeleted: () => { close(); toast('Transaction deleted'); onDone?.(null); },
  }) });
}

// ── photos ──
export function photoImg(id, cls = '', alt = 'Photo of the day') { return h('img', { src: St.photoUrl(id), alt, class: cls, loading: 'lazy', decoding: 'async' }); }

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  return await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('That image couldn’t be read. Try a JPEG or PNG.')); }; im.src = u; });
}
export async function uploadPhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const img = await decode(file);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight, max = 1800, k = Math.min(1, max / Math.max(w0, h0));
  const cv = document.createElement('canvas'); cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
  if (!blob) throw new Error('That image couldn’t be processed.');
  return (await api('POST', '/photos', blob, { raw: true })).id;
}
export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
