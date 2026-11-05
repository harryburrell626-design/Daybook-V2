import { api } from './api.js';
import { setCurrency, round2, monthKey, todayStr, addDays } from './util.js';

export const S = { user: null, d: null, logs: new Map(), demoDismissed: false };

function index() {
  S.logs = new Map(S.d.logs.map((l) => [l.date, l]));
  setCurrency(S.d.settings.currency);
}
export async function loadAll() { S.d = await api('GET', `/data?today=${todayStr()}`); index(); }
export function clearAll() { S.user = null; S.d = null; S.logs = new Map(); S.demoDismissed = false; }

// ───────── derived finance numbers (everything flows from the transaction list) ─────────
export const txs = () => S.d.transactions;
export function potBalance(p) { return round2(p.opening_balance + S.d.potMoves.filter((m) => m.pot_id === p.id).reduce((s, m) => s + m.amount, 0)); }
export const potMoves = (id) => S.d.potMoves.filter((m) => m.pot_id === id);
export function available() {
  let b = Number(S.d.settings.starting_balance);
  for (const t of S.d.transactions) b += t.type === 'income' ? t.amount : -t.amount;
  for (const m of S.d.potMoves) b -= m.amount; // money moved into a pot has left the available balance
  return round2(b);
}
export function monthTotals(ym) {
  let income = 0, spending = 0;
  for (const t of S.d.transactions) if (monthKey(t.date) === ym) { if (t.type === 'income') income += t.amount; else spending += t.amount; }
  return { income: round2(income), spending: round2(spending) };
}
export function spentByCategory(ym) {
  const o = {};
  for (const t of S.d.transactions) if (t.type === 'expense' && monthKey(t.date) === ym) o[t.category] = round2((o[t.category] || 0) + t.amount);
  return o;
}
export function totals() {
  const savings = round2(S.d.pots.reduce((s, p) => s + potBalance(p), 0));
  const assets = round2(S.d.holdings.filter((h) => h.side === 'asset').reduce((s, h) => s + h.value, 0));
  const debts = round2(S.d.holdings.filter((h) => h.side === 'debt').reduce((s, h) => s + h.value, 0));
  const avail = available();
  return { available: avail, savings, assets, debts, net: round2(avail + savings + assets - debts) };
}
export const txOn = (date) => S.d.transactions.filter((t) => t.date === date);
export function dayFinance(date) {
  const l = txOn(date); let spent = 0, income = 0;
  for (const t of l) { if (t.type === 'expense') spent += t.amount; else income += t.amount; }
  return { list: l, spent: round2(spent), income: round2(income), count: l.length };
}
export const hasLog = (date) => S.logs.has(date);
export const getLog = (date) => S.logs.get(date);

// A log "has content" when anything meaningful was recorded
export function logHasContent(l) {
  return !!(l.completed || l.reflection?.trim() || Object.keys(l.prompts || {}).length || Object.keys(l.ratings || {}).length || Object.keys(l.sleep || {}).length ||
    Object.keys(l.screen || {}).length || (l.activities || []).length || Object.keys(l.culture || {}).length || l.photo_id);
}
export const loggedDates = () => [...S.logs.values()].filter((l) => l.completed || logHasContent(l)).map((l) => l.date).sort();
export function onThisDay(date) {
  const out = []; const md = date.slice(5);
  for (let y = 1; y <= 12; y++) {
    const d = `${Number(date.slice(0, 4)) - y}-${md}`; const l = S.logs.get(d);
    if (l && logHasContent(l)) out.push({ yearsAgo: y, log: l });
  }
  return out;
}
export const moodScore = (l) => { const r = l.ratings || {}; const v = ['happiness', 'satisfaction', 'enjoyment'].map((k) => r[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// ───────── mutations: call the API, then update the local copy ─────────
const sortTx = () => S.d.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
export async function saveTx(t, id) {
  const row = id ? await api('PUT', `/transactions/${id}`, t) : await api('POST', '/transactions', t);
  if (id) S.d.transactions = S.d.transactions.map((x) => (x.id === id ? row : x)); else S.d.transactions.unshift(row);
  sortTx(); return row;
}
export async function deleteTx(id) { await api('DELETE', `/transactions/${id}`); S.d.transactions = S.d.transactions.filter((t) => t.id !== id); }

export async function savePot(p, id) {
  const row = id ? await api('PUT', `/pots/${id}`, p) : await api('POST', '/pots', p);
  if (id) S.d.pots = S.d.pots.map((x) => (x.id === id ? row : x)); else S.d.pots.push(row);
  return row;
}
export async function deletePot(id) { await api('DELETE', `/pots/${id}`); S.d.pots = S.d.pots.filter((p) => p.id !== id); S.d.potMoves = S.d.potMoves.filter((m) => m.pot_id !== id); }
export async function addPotMove(potId, m) { const row = await api('POST', `/pots/${potId}/moves`, m); S.d.potMoves.unshift(row); S.d.potMoves.sort((a, b) => (a.date < b.date ? 1 : -1)); return row; }
export async function deletePotMove(id) { await api('DELETE', `/pot-moves/${id}`); S.d.potMoves = S.d.potMoves.filter((m) => m.id !== id); }

export async function saveHolding(hd, id) {
  const row = id ? await api('PUT', `/holdings/${id}`, hd) : await api('POST', '/holdings', hd);
  if (id) S.d.holdings = S.d.holdings.map((x) => (x.id === id ? row : x)); else S.d.holdings.push(row);
  return row;
}
export async function deleteHolding(id) { await api('DELETE', `/holdings/${id}`); S.d.holdings = S.d.holdings.filter((x) => x.id !== id); }

export async function saveBudget(category, amount) {
  const row = await api('PUT', '/budgets', { category, amount });
  const i = S.d.budgets.findIndex((b) => b.category === category);
  if (i >= 0) S.d.budgets[i] = row; else S.d.budgets.push(row);
  return row;
}
export async function deleteBudget(category) { await api('DELETE', `/budgets/${encodeURIComponent(category)}`); S.d.budgets = S.d.budgets.filter((b) => b.category !== category); }

export async function saveSettings(patch) { S.d.settings = await api('PUT', '/settings', patch); setCurrency(S.d.settings.currency); }

export async function saveLog(date, body, opts) {
  const row = await api('PUT', `/logs/${date}`, body, opts);
  S.logs.set(date, row);
  const i = S.d.logs.findIndex((l) => l.date === date);
  if (i >= 0) S.d.logs[i] = row; else S.d.logs.push(row);
  return row;
}
export async function deleteLog(date) {
  await api('DELETE', `/logs/${date}`);
  S.logs.delete(date); S.d.logs = S.d.logs.filter((l) => l.date !== date);
}
// Recurring bills / fixed income: the server posts due transactions, so reload everything afterwards
export async function saveRecurring(r, id) {
  const body = { ...r, today: todayStr() };
  if (id) await api('PUT', `/recurring/${id}`, body); else await api('POST', '/recurring', body);
  await loadAll();
}
export async function deleteRecurring(id) { await api('DELETE', `/recurring/${id}`); await loadAll(); }
export const photoUrl = (id) => `/api/photos/${id}`;
export { todayStr, addDays };
