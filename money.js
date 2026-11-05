import { h, clear, icon, field, select, segmented, modal, toast, confirmDialog, todayStr, addDays, monthKey, addMonths, monthTitle, longDate, shortDate, money, money0, round2, parse, ymd, refresh, plural, FREQ, occurrence, perMonth, freqText } from '../util.js';
import { S, available, monthTotals, spentByCategory, totals, potBalance, potMoves, saveSettings, savePot, deletePot, addPotMove, deletePotMove, saveHolding, deleteHolding, saveBudget, deleteBudget, saveRecurring, deleteRecurring } from '../store.js';
import { EXPENSE_CATS, INCOME_CATS, PRESETS, catIcon, txRow, openTxModal, parseAmount } from '../ui.js';

const TABS = [['transactions', 'Transactions'], ['recurring', 'Bills & income'], ['budgets', 'Budgets'], ['savings', 'Savings pots'], ['worth', 'Net worth']];

export function renderMoney(q) {
  const tab = TABS.some(([k]) => k === q.tab) ? q.tab : 'transactions';
  const body = tab === 'recurring' ? recurringTab() : tab === 'budgets' ? budgetsTab() : tab === 'savings' ? savingsTab() : tab === 'worth' ? worthTab() : transactionsTab();
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title' }, 'Money'), h('p', { class: 'page-sub' }, 'Quietly in the background. Add things as they happen — everything else updates itself.')),
      h('button', { class: 'btn primary', onClick: () => openTxModal({ onDone: () => refresh() }) }, '+ Add transaction')),
    h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('a', { href: k === 'transactions' ? '#/money' : `#/money?tab=${k}`, class: tab === k ? 'on' : '' }, l))),
    body);
}

function startingBalanceModal(done) {
  const inp = h('input', { type: 'text', inputmode: 'decimal', value: String(S.d.settings.starting_balance) });
  const err = h('div', { class: 'form-err' });
  const close = modal({ title: 'Starting balance', body: h('form', { onSubmit: async (e) => {
    e.preventDefault(); const v = parseAmount(inp.value); if (!Number.isFinite(v)) { err.textContent = 'Enter a number.'; return; }
    try { await saveSettings({ starting_balance: round2(v) }); close(); toast('Starting balance updated'); done(); } catch (ex) { err.textContent = ex.message; }
  } }, h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'The money you had before your first recorded transaction. Your available balance is this, plus income, minus spending and money moved into savings pots.'),
    field('Starting balance', inp), err, h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))) });
}

// ───────────── transactions ─────────────
function transactionsTab() {
  const today = todayStr();
  const f = { period: 'month', from: '', to: '', cat: '', type: '', text: '' };
  let limit = 100;
  const list = h('div'), summary = h('div'), customBox = h('div', { class: 'form-row hidden', style: { marginTop: '10px' } });
  const range = () => {
    if (f.period === 'month') return [monthKey(today) + '-01', '9999-12-31'];
    if (f.period === 'last') { const m = addMonths(monthKey(today), -1); return [m + '-01', m + '-31']; }
    if (f.period === '30') return [addDays(today, -29), '9999-12-31'];
    if (f.period === 'year') return [today.slice(0, 4) + '-01-01', '9999-12-31'];
    if (f.period === 'custom') return [f.from || '0000-01-01', f.to || '9999-12-31'];
    return ['0000-01-01', '9999-12-31'];
  };
  function draw() {
    clear(list); clear(summary);
    const [a, b] = range(); const t = f.text.trim().toLowerCase();
    const rows = S.d.transactions.filter((x) => x.date >= a && x.date <= b && (!f.cat || x.category === f.cat) && (!f.type || x.type === f.type) && (!t || (x.description + ' ' + x.notes + ' ' + x.category).toLowerCase().includes(t)));
    const inc = round2(rows.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0)), out = round2(rows.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0));
    summary.append(h('div', { class: 'row gap-l wrap' }, h('div', null, h('div', { class: 'stat-label' }, 'In'), h('div', { class: 'stat pos' }, money(inc))), h('div', null, h('div', { class: 'stat-label' }, 'Out'), h('div', { class: 'stat' }, money(out))),
      h('div', null, h('div', { class: 'stat-label' }, 'Net'), h('div', { class: 'stat' }, money(round2(inc - out), { sign: true }))), h('div', { class: 'right muted small' }, plural(rows.length, 'transaction'))));
    if (!rows.length) { list.append(h('div', { class: 'empty' }, S.d.transactions.length ? 'Nothing matches those filters.' : 'No transactions yet. Add your first one with the button above.')); return; }
    let lastD = '', box;
    for (const r of rows.slice(0, limit)) {
      if (r.date !== lastD) {
        lastD = r.date; const dayRows = rows.filter((x) => x.date === r.date);
        const net = round2(dayRows.reduce((s, x) => s + (x.type === 'income' ? x.amount : -x.amount), 0));
        list.append(h('div', { class: 'day-head' }, h('span', null, longDate(r.date, r.date.slice(0, 4) !== today.slice(0, 4))), h('span', { class: 'num' }, money(net, { sign: true }))));
        box = h('div', { class: 'list' }); list.append(box);
      }
      box.append(h('div', null, txRow(r, () => openTxModal({ tx: r, onDone: () => { draw(); drawHead(); } }))));
    }
    if (rows.length > limit) list.append(h('div', { style: { textAlign: 'center', marginTop: '16px' } }, h('button', { class: 'btn', onClick: () => { limit += 100; draw(); } }, `Show more (${rows.length - limit} left)`)));
  }
  const headBox = h('div');
  function drawHead() {
    clear(headBox);
    headBox.append(h('div', { class: 'row between wrap' }, h('div', null, h('div', { class: 'stat-label' }, 'Available balance'), h('div', { class: 'big', style: { color: available() < 0 ? 'var(--bad)' : '' } }, money(available()))),
      h('div', { class: 'right' }, h('div', { class: 'small muted' }, 'Starting balance ', h('b', { class: 'num' }, money(S.d.settings.starting_balance))), h('button', { class: 'link', onClick: () => startingBalanceModal(() => { drawHead(); draw(); }) }, 'Edit'))));
  }
  drawHead();
  const periodSel = select([['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom range…']], f.period, { 'aria-label': 'Period', onChange: (e) => { f.period = e.target.value; customBox.classList.toggle('hidden', f.period !== 'custom'); limit = 100; draw(); } });
  customBox.append(h('input', { type: 'date', 'aria-label': 'From', onChange: (e) => { f.from = e.target.value; draw(); } }), h('input', { type: 'date', 'aria-label': 'To', onChange: (e) => { f.to = e.target.value; draw(); } }));
  const filters = h('div', null,
    h('div', { class: 'grid g4', style: { gap: '10px' } }, periodSel,
      select([['', 'All categories'], ...[...EXPENSE_CATS, ...INCOME_CATS].map((c) => [c, c])], '', { 'aria-label': 'Category', onChange: (e) => { f.cat = e.target.value; limit = 100; draw(); } }),
      select([['', 'Spending & income'], ['expense', 'Spending only'], ['income', 'Income only']], '', { 'aria-label': 'Type', onChange: (e) => { f.type = e.target.value; limit = 100; draw(); } }),
      h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search transactions', onInput: (e) => { f.text = e.target.value; limit = 100; draw(); } })), customBox);
  draw();
  return h('div', { class: 'stack' }, h('div', { class: 'card' }, headBox), h('div', { class: 'card' }, filters, h('hr', { class: 'sep' }), summary, list));
}

// ───────────── budgets ─────────────
function budgetsTab() {
  let ym = monthKey(todayStr());
  const box = h('div', { class: 'stack' });
  function editBudget(cat, existing) {
    const inp = h('input', { type: 'text', inputmode: 'decimal', value: existing ? String(existing.amount) : '', placeholder: '0.00' }); const err = h('div', { class: 'form-err' });
    const close = modal({ title: `${cat} budget`, body: h('form', { onSubmit: async (e) => {
      e.preventDefault(); const v = parseAmount(inp.value); if (!(v > 0)) { err.textContent = 'Enter an amount greater than zero.'; return; }
      try { await saveBudget(cat, round2(v)); close(); toast('Budget saved'); draw(); } catch (ex) { err.textContent = ex.message; }
    } }, h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'A monthly limit for this category. It repeats every month.'), field('Monthly budget', inp), err,
      h('div', { class: 'modal-actions' }, existing ? h('button', { type: 'button', class: 'btn danger left', onClick: async () => { try { await deleteBudget(cat); close(); toast('Budget removed'); draw(); } catch (ex) { err.textContent = ex.message; } } }, 'Remove') : null,
        h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))) });
  }
  function draw() {
    clear(box);
    const spent = spentByCategory(ym), budgets = [...S.d.budgets].sort((a, b) => EXPENSE_CATS.indexOf(a.category) - EXPENSE_CATS.indexOf(b.category));
    const totBud = round2(budgets.reduce((s, b) => s + b.amount, 0)), totSpent = round2(budgets.reduce((s, b) => s + (spent[b.category] || 0), 0));
    box.append(h('div', { class: 'card' }, h('div', { class: 'cal-head', style: { marginBottom: '8px' } },
      h('div', null, h('div', { class: 'cal-title' }, monthTitle(ym)), h('div', { class: 'small muted' }, budgets.length ? `${money(totSpent)} spent of ${money(totBud)} budgeted · ${money(round2(totBud - totSpent))} ${totBud - totSpent >= 0 ? 'left' : 'over'}` : 'No budgets yet')),
      h('div', { class: 'row gap-s' }, h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onClick: () => { ym = addMonths(ym, -1); draw(); } }, icon('M15 5l-7 7 7 7')), h('button', { class: 'icon-btn', 'aria-label': 'Next month', onClick: () => { ym = addMonths(ym, 1); draw(); } }, icon('M9 5l7 7-7 7'))))));
    if (budgets.length) {
      const list = h('div', { class: 'card' });
      budgets.forEach((b, i) => {
        const sp = spent[b.category] || 0, pct = sp / b.amount, left = round2(b.amount - sp);
        const cls = pct >= 1 ? 'bad' : pct >= 0.8 ? 'warn' : '';
        list.append(h('div', { class: 'li click', style: { alignItems: 'flex-start', borderTop: i ? '1px solid var(--line2)' : '0', padding: '14px 2px' }, role: 'button', tabindex: '0', onClick: () => editBudget(b.category, b), onKeydown: (e) => { if (e.key === 'Enter') editBudget(b.category, b); } },
          catIcon(b.category),
          h('div', { class: 'grow' }, h('div', { class: 'row between' }, h('div', { class: 't' }, b.category, pct >= 1 ? h('span', { class: 'tag bad', style: { marginLeft: '8px' } }, 'Over budget') : pct >= 0.8 ? h('span', { class: 'tag warn', style: { marginLeft: '8px' } }, `${Math.round(pct * 100)}% used`) : null), h('div', { class: 'small muted num' }, `${money(sp)} / ${money(b.amount)}`)),
            h('div', { class: 'progress ' + cls, style: { margin: '9px 0 6px' }, role: 'progressbar', 'aria-valuenow': Math.round(pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${b.category} budget used` }, h('i', { style: { width: `${Math.min(100, pct * 100)}%` } })),
            h('div', { class: 'tiny ' + (left < 0 ? 'neg' : 'muted') }, left >= 0 ? `${money(left)} remaining` : `${money(-left)} over`))));
      });
      box.append(list);
    } else box.append(h('div', { class: 'card empty' }, 'Set a monthly budget for any category below to see progress here.'));
    const un = EXPENSE_CATS.filter((c) => !S.d.budgets.some((b) => b.category === c));
    if (un.length) box.append(h('div', { class: 'card' }, h('div', { class: 'section-title' }, 'Add a budget'), h('div', { class: 'chips' }, un.map((c) => h('button', { class: 'chip', onClick: () => editBudget(c, null) }, c + (spent[c] ? ` · ${money0(spent[c])} spent` : ''))))));
  }
  draw(); return box;
}

// ───────────── savings pots ─────────────
function potModal(pot, done) {
  const name = h('input', { type: 'text', maxlength: 80, value: pot?.name || '', placeholder: 'e.g. Holiday', required: true });
  const target = h('input', { type: 'text', inputmode: 'decimal', value: pot ? String(pot.target || '') : '', placeholder: '0.00 (optional)' });
  const open = h('input', { type: 'text', inputmode: 'decimal', value: pot ? String(pot.opening_balance || '') : '', placeholder: '0.00' });
  const err = h('div', { class: 'form-err' });
  const close = modal({ title: pot ? 'Edit savings pot' : 'New savings pot', body: h('form', { onSubmit: async (e) => {
    e.preventDefault(); const t = target.value.trim() ? parseAmount(target.value) : 0, o = open.value.trim() ? parseAmount(open.value) : 0;
    if (!(t >= 0) || !(o >= 0)) { err.textContent = 'Amounts must be zero or more.'; return; }
    try { await savePot({ name: name.value.trim(), target: round2(t), opening_balance: round2(o) }, pot?.id); close(); toast(pot ? 'Pot updated' : 'Pot created'); done(); } catch (ex) { err.textContent = ex.message; }
  } }, field('Name', name), h('div', { class: 'form-row' }, field('Target', target), field(pot ? 'Opening balance' : 'Already saved', open, 'Money already in the pot before you track deposits here.')), err,
    h('div', { class: 'modal-actions' }, pot ? h('button', { type: 'button', class: 'btn danger left', onClick: async () => {
      if (!(await confirmDialog('The pot and its history are deleted. Money you deposited stays out of your available balance only if you re-add it elsewhere — consider withdrawing first.', { okText: 'Delete pot', title: `Delete “${pot.name}”?` }))) return;
      try { await deletePot(pot.id); close(); toast('Pot deleted'); done(); } catch (ex) { err.textContent = ex.message; }
    } }, 'Delete') : null, h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, pot ? 'Save' : 'Create pot'))) });
}
function moveModal(pot, kind, done) {
  let k = kind;
  const amt = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', required: true });
  const date = h('input', { type: 'date', value: todayStr(), required: true });
  const note = h('input', { type: 'text', maxlength: 200, placeholder: 'Optional note' });
  const err = h('div', { class: 'form-err' });
  const hint = h('div', { class: 'small muted', style: { marginBottom: '12px' } });
  const setHint = () => { hint.textContent = k === 'deposit' ? `Moves money out of your available balance (${money(available())}) into “${pot.name}”.` : `Moves money from “${pot.name}” (${money(potBalance(pot))}) back to your available balance.`; };
  const seg = segmented([['deposit', 'Deposit'], ['withdraw', 'Withdraw']], k, (v) => { k = v; setHint(); }); setHint();
  const close = modal({ title: pot.name, body: h('form', { onSubmit: async (e) => {
    e.preventDefault(); const v = parseAmount(amt.value); if (!(v > 0)) { err.textContent = 'Enter an amount greater than zero.'; return; }
    try { await addPotMove(pot.id, { amount: k === 'deposit' ? round2(v) : -round2(v), date: date.value, note: note.value.trim() }); close(); toast(k === 'deposit' ? 'Deposited' : 'Withdrawn'); done(); } catch (ex) { err.textContent = ex.message; }
  } }, seg, h('div', { style: { height: '12px' } }), hint, h('div', { class: 'form-row' }, field('Amount', amt), field('Date', date)), field('Note', note), err,
    h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))) });
}
function savingsTab() {
  const box = h('div', { class: 'stack' }); const open = new Set();
  function draw() {
    clear(box);
    const T = totals();
    box.append(h('div', { class: 'card row between wrap' }, h('div', null, h('div', { class: 'stat-label' }, 'Total in savings pots'), h('div', { class: 'big' }, money(T.savings))), h('button', { class: 'btn', onClick: () => potModal(null, draw) }, '+ New pot')));
    if (!S.d.pots.length) { box.append(h('div', { class: 'card empty' }, 'No pots yet. Create one for something you’re saving towards.')); return; }
    const grid = h('div', { class: 'grid g2', style: { alignItems: 'start' } });
    for (const p of S.d.pots) {
      const bal = potBalance(p), pct = p.target > 0 ? Math.min(1, bal / p.target) : null, moves = potMoves(p.id);
      grid.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', null, p.name), h('button', { class: 'link', onClick: () => potModal(p, draw) }, 'Edit')),
        h('div', { class: 'big', style: { fontSize: '32px' } }, money(bal)),
        p.target > 0 ? h('div', null, h('div', { class: 'progress ' + (pct >= 1 ? 'good' : ''), style: { margin: '12px 0 6px' }, role: 'progressbar', 'aria-valuenow': Math.round(pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${p.name} progress` }, h('i', { style: { width: `${pct * 100}%` } })),
          h('div', { class: 'small muted' }, pct >= 1 ? `Target of ${money(p.target)} reached 🎉`.replace(' 🎉', '') : `${Math.round(pct * 100)}% of ${money(p.target)} · ${money(round2(p.target - bal))} to go`)) : h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'No target set'),
        h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { class: 'btn small primary', onClick: () => moveModal(p, 'deposit', draw) }, 'Deposit'), h('button', { class: 'btn small', onClick: () => moveModal(p, 'withdraw', draw) }, 'Withdraw'),
          moves.length ? h('button', { class: 'btn small ghost right', onClick: () => { open.has(p.id) ? open.delete(p.id) : open.add(p.id); draw(); } }, open.has(p.id) ? 'Hide history' : 'History') : null),
        open.has(p.id) ? h('div', { class: 'list', style: { marginTop: '12px' } }, moves.map((m) => h('div', { class: 'li' }, h('div', { class: 'grow' }, h('div', { class: 't' }, m.note || (m.amount > 0 ? 'Deposit' : 'Withdrawal')), h('div', { class: 's' }, shortDate(m.date, true))),
          h('div', { class: 'amt ' + (m.amount > 0 ? 'in' : '') }, money(m.amount, { sign: true })),
          h('button', { class: 'icon-btn', 'aria-label': 'Delete this movement', onClick: async () => { if (await confirmDialog('Remove this movement? Your available balance will adjust.', { okText: 'Remove' })) { try { await deletePotMove(m.id); draw(); } catch (e) { toast(e.message, true); } } } }, icon('M6 6l12 12M18 6L6 18'))))) : null));
    }
    box.append(grid, h('p', { class: 'tiny faint' }, 'Deposits leave your available balance and withdrawals return to it, so your net worth stays the same.'));
  }
  draw(); return box;
}

// ───────────── assets, debts, net worth ─────────────
const KIND = { asset: [['car', 'Car'], ['property', 'Property'], ['investment', 'Investment'], ['savings', 'Savings'], ['other', 'Other possession']], debt: [['loan', 'Loan'], ['credit_card', 'Credit card'], ['other', 'Other debt']] };
function holdingModal(side, item, done) {
  const name = h('input', { type: 'text', maxlength: 100, value: item?.name || '', required: true, placeholder: side === 'asset' ? 'e.g. Family car' : 'e.g. Student loan' });
  const kind = select(KIND[side], item?.kind || KIND[side][0][0]);
  const val = h('input', { type: 'text', inputmode: 'decimal', value: item ? String(item.value) : '', required: true, placeholder: '0.00' });
  const notes = h('textarea', { rows: 2, maxlength: 1000, style: { minHeight: '64px' } }, item?.notes || '');
  const err = h('div', { class: 'form-err' });
  const word = side === 'asset' ? 'asset' : 'debt';
  const close = modal({ title: item ? `Edit ${word}` : `Add ${word}`, body: h('form', { onSubmit: async (e) => {
    e.preventDefault(); const v = parseAmount(val.value); if (!(v >= 0)) { err.textContent = 'Enter a value of zero or more.'; return; }
    try { await saveHolding({ side, kind: kind.value, name: name.value.trim(), value: round2(v), notes: notes.value }, item?.id); close(); toast('Saved'); done(); } catch (ex) { err.textContent = ex.message; }
  } }, field('Name', name), h('div', { class: 'form-row' }, field('Type', kind), field(side === 'asset' ? 'Current value' : 'Amount owed', val)), field('Notes', notes), err,
    h('div', { class: 'modal-actions' }, item ? h('button', { type: 'button', class: 'btn danger left', onClick: async () => { if (await confirmDialog(`Delete this ${word}?`)) { try { await deleteHolding(item.id); close(); toast('Deleted'); done(); } catch (ex) { err.textContent = ex.message; } } } }, 'Delete') : null,
      h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))) });
}
function worthTab() {
  const box = h('div', { class: 'stack' });
  function draw() {
    clear(box); const T = totals();
    box.append(h('div', { class: 'card' }, h('div', { class: 'stat-label' }, 'Net worth'), h('div', { class: 'big', style: { color: T.net < 0 ? 'var(--bad)' : '' } }, money(T.net)),
      h('div', { class: 'row wrap small muted', style: { marginTop: '14px', gap: '6px 16px' } }, h('span', null, 'Available ', h('b', { class: 'num' }, money(T.available))), '+', h('span', null, 'Savings pots ', h('b', { class: 'num' }, money(T.savings))), '+', h('span', null, 'Assets ', h('b', { class: 'num' }, money(T.assets))), '−', h('span', null, 'Debts ', h('b', { class: 'num' }, money(T.debts))))));
    const grid = h('div', { class: 'grid g2', style: { alignItems: 'start' } });
    for (const side of ['asset', 'debt']) {
      const items = S.d.holdings.filter((x) => x.side === side), label = side === 'asset' ? 'Assets' : 'Debts', total = side === 'asset' ? T.assets : T.debts;
      grid.append(h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h3', null, label), h('div', { class: 'stat', style: { marginTop: '2px' } }, money(total))), h('button', { class: 'btn small', onClick: () => holdingModal(side, null, draw) }, '+ Add')),
        items.length ? h('div', { class: 'list' }, items.map((x) => h('div', { class: 'li click', role: 'button', tabindex: '0', onClick: () => holdingModal(side, x, draw), onKeydown: (e) => { if (e.key === 'Enter') holdingModal(side, x, draw); } },
          h('div', { class: 'grow' }, h('div', { class: 't' }, x.name), h('div', { class: 's' }, KIND[side].find((k) => k[0] === x.kind)?.[1] || x.kind)), h('div', { class: 'amt' }, money(x.value))))) : h('div', { class: 'empty' }, side === 'asset' ? 'Cars, property, investments, savings or other possessions.' : 'Loans, credit cards or other debts.')));
    }
    box.append(grid);
  }
  draw(); return box;
}

// ───────────── recurring bills & fixed income ─────────────
const nextDue = (r) => {
  if (!r.active) return null;
  const d = occurrence(r.start_date, r.frequency, r.generated);
  return r.end_date && d > r.end_date ? null : d;
};
function recurringModal(rule, type, done) {
  let curType = rule?.type || type;
  const name = h('input', { type: 'text', maxlength: 200, required: true, value: rule?.description || '', placeholder: 'e.g. Car insurance' });
  const amount = h('input', { type: 'text', inputmode: 'decimal', required: true, value: rule ? String(rule.amount) : '', placeholder: '0.00' });
  const cat = h('select'); const freq = select(FREQ, rule?.frequency || 'monthly');
  const start = h('input', { type: 'date', required: true, value: rule?.start_date || todayStr() });
  const end = h('input', { type: 'date', value: rule?.end_date || '' });
  const notes = h('textarea', { rows: 2, maxlength: 2000, style: { minHeight: '60px' } }, rule?.notes || '');
  const active = h('input', { type: 'checkbox', checked: rule ? rule.active : true });
  const err = h('div', { class: 'form-err', role: 'alert' });
  const presetBox = h('div', { class: 'chips', style: { marginBottom: '14px' } });
  const fillCats = () => { clear(cat); const cats = curType === 'income' ? INCOME_CATS : EXPENSE_CATS; const want = rule && rule.type === curType ? rule.category : cats[curType === 'income' ? 0 : 1]; for (const c of cats) cat.append(h('option', { value: c, selected: c === want }, c)); cat.value = want; };
  const drawPresets = () => { clear(presetBox); for (const [label, c, f] of PRESETS[curType]) presetBox.append(h('button', { type: 'button', class: 'chip tiny', onClick: () => { name.value = label; cat.value = c; freq.value = f; amount.focus(); } }, label)); };
  fillCats(); drawPresets();
  const hint = h('div', { class: 'hint' });
  const syncHint = () => { hint.textContent = !rule && start.value && start.value < todayStr() ? 'This start date is in the past: occurrences up to today will be added to your history now.' : rule ? 'Changes apply to future occurrences. Anything already in your history stays as it is.' : ''; };
  start.addEventListener('change', syncHint); syncHint();
  const seg = segmented([['expense', 'Bill / regular payment'], ['income', 'Fixed income']], curType, (v) => { curType = v; fillCats(); drawPresets(); });
  const close = modal({ title: rule ? 'Edit recurring item' : 'New recurring item', body: h('form', { onSubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; const a = parseAmount(amount.value);
    if (!(a > 0)) { err.textContent = 'Enter an amount greater than zero.'; return; }
    if (end.value && end.value < start.value) { err.textContent = 'The end date is before the start date.'; return; }
    try { await saveRecurring({ type: curType, amount: round2(a), category: cat.value, description: name.value.trim(), notes: notes.value, frequency: freq.value, start_date: start.value, end_date: end.value || null, active: active.checked }, rule?.id); close(); toast('Saved'); done(); } catch (ex) { err.textContent = ex.message; }
  } }, h('div', { style: { marginBottom: '14px' } }, seg), !rule ? presetBox : null, field('Name', name),
    h('div', { class: 'form-row' }, field('Amount', amount), field('Category', cat)), h('div', { class: 'form-row' }, field('Repeats', freq), field(rule ? 'Started on' : 'First date', start)), hint,
    field('Stops after (optional)', end, 'Leave empty for no end date. Useful for fixed-term loans and contracts.'), field('Notes', notes),
    rule ? h('label', { class: 'check' }, active, h('span', null, 'Active — untick to pause without deleting')) : null, err,
    h('div', { class: 'modal-actions' }, rule ? h('button', { type: 'button', class: 'btn danger left', onClick: async () => {
      if (!(await confirmDialog('No more will be added. Transactions already in your history are kept.', { okText: 'Delete', title: `Delete “${rule.description || rule.category}”?` }))) return;
      try { await deleteRecurring(rule.id); close(); toast('Deleted'); done(); } catch (ex) { err.textContent = ex.message; }
    } }, 'Delete') : null, h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))) });
}
function recurringTab() {
  const box = h('div', { class: 'stack' });
  const redraw = () => { draw(); };
  function draw() {
    clear(box); const today = todayStr();
    const live = S.d.recurring.filter((r) => r.active && (!r.end_date || r.end_date >= today));
    const inc = round2(live.filter((r) => r.type === 'income').reduce((s, r) => s + perMonth(r.amount, r.frequency), 0));
    const out = round2(live.filter((r) => r.type === 'expense').reduce((s, r) => s + perMonth(r.amount, r.frequency), 0));
    box.append(h('div', { class: 'card' }, h('div', { class: 'grid g3', style: { gap: '18px' } },
      h('div', null, h('div', { class: 'stat-label' }, 'Fixed income / month'), h('div', { class: 'stat pos' }, money(inc))),
      h('div', null, h('div', { class: 'stat-label' }, 'Regular bills / month'), h('div', { class: 'stat' }, money(out))),
      h('div', null, h('div', { class: 'stat-label' }, 'Left after bills'), h('div', { class: 'stat', style: { color: inc - out < 0 ? 'var(--bad)' : '' } }, money(round2(inc - out), { sign: true })))),
      h('p', { class: 'tiny faint', style: { marginTop: '12px' } }, 'Weekly and yearly items are averaged to a monthly figure. Each one is added to your transactions automatically on the day it’s due.')));
    for (const [type, title, empty, btn] of [['income', 'Fixed income', 'Add your salary, pension or any regular income and it will arrive in your balance on schedule.', '+ Add income'], ['expense', 'Bills & regular payments', 'Rent, car insurance, subscriptions… add them once and they’re recorded for you each time.', '+ Add bill']]) {
      const rules = S.d.recurring.filter((r) => r.type === type);
      rules.sort((a, b) => ((nextDue(a) || '9999') < (nextDue(b) || '9999') ? -1 : 1));
      box.append(h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, title), h('button', { class: 'btn small', onClick: () => recurringModal(null, type, redraw) }, btn)),
        rules.length ? h('div', { class: 'list' }, rules.map((r) => {
          const nd = nextDue(r), ended = r.end_date && r.end_date < today;
          return h('div', { class: 'li click', role: 'button', tabindex: '0', onClick: () => recurringModal(r, r.type, redraw), onKeydown: (e) => { if (e.key === 'Enter') recurringModal(r, r.type, redraw); } },
            catIcon(r.category), h('div', { class: 'grow' }, h('div', { class: 't' }, r.description || r.category, !r.active ? h('span', { class: 'tag', style: { marginLeft: '8px' } }, 'Paused') : ended ? h('span', { class: 'tag', style: { marginLeft: '8px' } }, 'Ended') : null),
              h('div', { class: 's' }, freqText(r.frequency, r.start_date) + (nd ? ` · next ${shortDate(nd, nd.slice(0, 4) !== today.slice(0, 4))}` : ''))),
            h('div', { class: 'amt ' + (r.type === 'income' ? 'in' : '') }, (r.type === 'income' ? '+' : '') + money(r.amount)));
        })) : h('div', { class: 'empty' }, empty)));
    }
  }
  draw(); return box;
}
