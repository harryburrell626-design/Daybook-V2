// The Daily Log — the heart of Daybook. One page per calendar day, autosaved.
import { h, clear, icon, field, longDate, relDay, todayStr, addDays, isDate, money, durText, toast, confirmDialog, go, refresh, plural, avg, fmt1 } from '../util.js';
import { S, saveLog, deleteLog, dayFinance, available, logHasContent, onThisDay, getLog } from '../store.js';
import { RATINGS, ACTIVITIES, ACT_LABEL, PROMPTS, excerpt } from '../constants.js';
import { txForm, txRow, openTxModal, uploadPhoto, photoImg } from '../ui.js';

const STEPS = [['money', 'Money'], ['day', 'Your day'], ['feel', 'How it felt'], ['body', 'Rest'], ['did', 'What you did'], ['keep', 'Keep'], ['finish', 'Finish']];
const blank = () => ({ reflection: '', prompts: {}, ratings: {}, sleep: {}, screen: {}, activities: [], culture: {}, photo_id: null, completed: false });
const clone = (o) => JSON.parse(JSON.stringify(o));
const minsBetween = (bed, wake) => { if (!bed || !wake) return null; const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number); let d = wh * 60 + wm - (bh * 60 + bm); if (d <= 0) d += 1440; return d; };

function durationInput({ value, onChange, label }) {
  const hh = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 24, placeholder: '0', 'aria-label': `${label} hours` });
  const mm = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 59, placeholder: '0', 'aria-label': `${label} minutes` });
  const set = (v) => { if (v == null) { hh.value = ''; mm.value = ''; } else { hh.value = String(Math.floor(v / 60)); mm.value = String(v % 60); } };
  const read = () => { if (hh.value === '' && mm.value === '') return null; return Math.min(1440, Math.max(0, (Number(hh.value) || 0) * 60 + (Number(mm.value) || 0))); };
  const emit = () => onChange(read());
  hh.addEventListener('input', emit); mm.addEventListener('input', emit);
  set(value);
  const el = h('div', { class: 'dur' }, hh, h('span', null, 'h'), mm, h('span', null, 'm'));
  el.set = set; return el;
}

export function renderLog(date, q) {
  const today = todayStr();
  if (!isDate(date)) { setTimeout(() => go('#/log/today'), 0); return h('div'); }
  if (date > today) {
    return h('div', { class: 'log-wrap' }, h('div', { class: 'card paper finish' }, h('h2', null, 'That day hasn’t happened yet'),
      h('p', { class: 'muted', style: { margin: '10px 0 20px' } }, 'Daybook is for looking back. Come back when the day is done.'), h('a', { class: 'btn warm', href: '#/log/today' }, 'Go to today')));
  }

  const existing = getLog(date);
  const draft = existing ? clone({ ...blank(), ...existing }) : blank();
  for (const k of ['prompts', 'ratings', 'sleep', 'screen', 'culture']) draft[k] ||= {};
  draft.activities ||= [];
  let mode = q.view === 'all' || q.view === 'guided' ? (q.view === 'all' ? 'all' : 'guided') : draft.completed ? 'all' : 'guided';
  let step = Math.max(0, STEPS.findIndex((s) => s[0] === q.step));
  let dirty = false, timer = null, saving = Promise.resolve(), justFinished = false;

  const statusEl = h('span', { class: 'saved', 'aria-live': 'polite' });
  const pillEl = h('span');
  const setStatus = (t, err = false) => { statusEl.textContent = t; statusEl.className = 'saved' + (err ? ' err' : ''); };
  const updatePill = () => {
    const done = draft.completed, has = logHasContent(draft);
    clear(pillEl); pillEl.append(h('span', { class: 'state-dot ' + (done ? 'done' : has ? 'prog' : '') }), done ? 'Completed' : has ? 'In progress' : 'Not started yet');
  };

  // ───── autosave ─────
  const snapshot = () => {
    const c = clone(draft);
    if (c.sleep.bed && c.sleep.wake && c.sleep.minutes == null) c.sleep.minutes = minsBetween(c.sleep.bed, c.sleep.wake);
    return c;
  };
  const flush = () => {
    clearTimeout(timer);
    if (!dirty) return saving;
    dirty = false;
    const body = snapshot();
    saving = saving.then(async () => {
      try { await saveLog(date, body); setStatus(draft.completed ? 'Saved' : 'Saved just now'); }
      catch (e) { dirty = true; setStatus(e.offline ? 'Offline — will retry' : 'Couldn’t save — will retry', true); timer = setTimeout(flush, 6000); }
    });
    return saving;
  };
  const touch = () => { dirty = true; setStatus('Saving…'); updatePill(); clearTimeout(timer); timer = setTimeout(flush, 700); };

  // ───── section builders ─────
  const section = (title, sub, ...kids) => h('section', { class: 'log-section' }, h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null, ...kids);

  function moneySection(guided) {
    const box = h('div');
    const draw = () => {
      clear(box);
      const f = dayFinance(date);
      box.append(
        h('div', { class: 'paper' },
          h('div', { class: 'money-sum' },
            h('div', null, h('div', { class: 'stat-label' }, 'Spent'), h('div', { class: 'stat' }, money(f.spent))),
            f.income ? h('div', null, h('div', { class: 'stat-label' }, 'Came in'), h('div', { class: 'stat pos' }, money(f.income))) : null,
            h('div', null, h('div', { class: 'stat-label' }, 'Balance now'), h('div', { class: 'stat' }, money(available())))),
          f.list.length ? h('div', { class: 'list' }, f.list.map((t) => h('div', null, txRow(t, () => openTxModal({ tx: t, onDone: () => { draw(); } }))))) : h('p', { class: 'muted small', style: { padding: '4px 0 2px' } }, 'Nothing recorded for this day yet.'),
          h('details', { open: guided || f.list.length === 0 }, h('summary', { class: 'small muted', style: { cursor: 'pointer', margin: '10px 0 0', listStyle: 'none' } }, '+ Add a transaction for this day'),
            txForm({ date, compact: true, onSaved: () => { draw(); } }))),
        h('p', { class: 'tiny faint', style: { marginTop: '8px' } }, 'Recorded here, it also appears in your Money history — no need to enter anything twice.'));
    };
    draw();
    return section('Money today', guided ? 'Check today’s money is up to date, then carry on.' : null, box);
  }

  function daySection() {
    const ta = h('textarea', { class: 'reflect', placeholder: 'Write freely — a line, a page, whatever today deserves.', 'aria-label': 'How was today?', maxlength: 30000, onInput: (e) => { draft.reflection = e.target.value; touch(); } }, draft.reflection);
    const open = new Set(PROMPTS.map((p) => p[0]).filter((k) => draft.prompts[k]));
    const pbox = h('div'), chips = h('div', { class: 'chips' });
    const drawPrompts = () => {
      clear(chips); clear(pbox);
      for (const [k, label] of PROMPTS) chips.append(h('button', { type: 'button', class: 'chip tiny' + (open.has(k) ? ' on' : ''), onClick: () => { open.has(k) ? open.delete(k) : open.add(k); drawPrompts(); } }, label));
      for (const [k, label] of PROMPTS) if (open.has(k)) pbox.append(h('div', { class: 'prompt-field' }, h('label', null, label), h('textarea', { rows: 2, maxlength: 5000, onInput: (e) => { draft.prompts[k] = e.target.value; if (!e.target.value) delete draft.prompts[k]; touch(); } }, draft.prompts[k] || '')));
    };
    drawPrompts();
    const otd = onThisDay(date)[0];
    return section('How was today?', null,
      otd ? h('a', { class: 'finance-chip', href: `#/log/${otd.log.date}`, style: { textDecoration: 'none', marginBottom: '12px', display: 'flex' } }, h('span', null, `On this day ${otd.yearsAgo === 1 ? 'a year' : otd.yearsAgo + ' years'} ago: “${excerpt(otd.log).slice(0, 90)}${excerpt(otd.log).length > 90 ? '…' : ''}”`)) : null,
      h('div', { class: 'paper' }, ta, h('div', { class: 'prompt-chips' }, h('div', { class: 'tiny muted', style: { marginBottom: '8px' } }, 'Need a nudge? Tap a prompt — they’re all optional.'), chips, pbox)));
  }

  function ratingCard([key, name, question, lo, hi]) {
    const set = draft.ratings[key] != null;
    const valEl = h('div', { class: 'rate-val' + (set ? '' : ' unset') }, set ? String(draft.ratings[key]) : '–');
    const input = h('input', { type: 'range', min: 1, max: 10, step: 1, value: set ? draft.ratings[key] : 5, class: set ? '' : 'unset', 'aria-label': `${name}: ${question}`, 'aria-valuetext': set ? String(draft.ratings[key]) : 'Not rated' });
    const clearBtn = h('button', { type: 'button', class: set ? '' : 'hidden' }, 'Clear');
    const paint = () => input.style.setProperty('--p', `${((input.value - 1) / 9) * 100}%`);
    const setVal = () => { draft.ratings[key] = Number(input.value); valEl.textContent = input.value; valEl.classList.remove('unset'); input.classList.remove('unset'); clearBtn.classList.remove('hidden'); input.setAttribute('aria-valuetext', input.value); paint(); touch(); };
    input.addEventListener('input', setVal);
    input.addEventListener('pointerup', () => { if (draft.ratings[key] == null) setVal(); });
    input.addEventListener('keydown', (e) => { if (draft.ratings[key] == null && /Arrow|Home|End|Page/.test(e.key)) setTimeout(() => { if (draft.ratings[key] == null) setVal(); }, 0); });
    clearBtn.addEventListener('click', () => { delete draft.ratings[key]; valEl.textContent = '–'; valEl.classList.add('unset'); input.classList.add('unset'); input.value = 5; clearBtn.classList.add('hidden'); paint(); touch(); });
    paint();
    return h('div', { class: 'paper rate' }, h('div', { class: 'rate-top' }, h('div', { class: 'rate-name' }, name), valEl), h('div', { class: 'rate-q' }, question), input,
      h('div', { class: 'rate-foot' }, h('span', null, lo), clearBtn, h('span', null, hi)));
  }
  const feelSection = () => section('How did it feel?', 'Slide to rate — or skip any you’d rather not. There are no right answers.', ...RATINGS.map(ratingCard));

  function bodySection() {
    const sl = draft.sleep, sc = draft.screen;
    // sleep
    const bed = h('input', { type: 'time', value: sl.bed || '', 'aria-label': 'Bedtime' }), wake = h('input', { type: 'time', value: sl.wake || '', 'aria-label': 'Wake time' });
    const dur = durationInput({ value: sl.minutes ?? minsBetween(sl.bed, sl.wake), label: 'Sleep', onChange: (v) => { if (v == null) delete sl.minutes; else sl.minutes = v; touch(); showTotal(); } });
    const total = h('div', { class: 'sleep-total' });
    const showTotal = () => { total.textContent = sl.minutes != null ? durText(sl.minutes) : '–'; };
    const recalc = () => {
      if (bed.value) sl.bed = bed.value; else delete sl.bed;
      if (wake.value) sl.wake = wake.value; else delete sl.wake;
      const m = minsBetween(sl.bed, sl.wake);
      if (m != null) { sl.minutes = m; dur.set(m); }
      showTotal(); touch();
    };
    bed.addEventListener('input', recalc); wake.addEventListener('input', recalc);
    const quick = (inp, times) => h('div', { class: 'chips', style: { marginTop: '8px' } }, times.map((t) => h('button', { type: 'button', class: 'chip tiny', onClick: () => { inp.value = t; recalc(); } }, t)));
    const qual = h('div', { class: 'dots' }); const QL = ['Poor', 'Fair', 'Okay', 'Good', 'Great'];
    const drawQ = () => { clear(qual); [1, 2, 3, 4, 5].forEach((n) => qual.append(h('button', { type: 'button', class: sl.quality === n ? 'on' : '', 'aria-label': `Sleep quality ${n} of 5, ${QL[n - 1]}`, 'aria-pressed': sl.quality === n ? 'true' : 'false', onClick: () => { if (sl.quality === n) delete sl.quality; else sl.quality = n; drawQ(); touch(); } }, String(n)))); };
    drawQ(); showTotal();
    const sleepCard = h('div', { class: 'paper sub-card' }, h('h4', null, 'Last night’s sleep', total),
      h('div', { class: 'form-row' }, h('div', null, field('Went to bed', bed), quick(bed, ['22:00', '22:30', '23:00', '23:30', '00:00', '00:30'])), h('div', null, field('Woke up', wake), quick(wake, ['06:30', '07:00', '07:30', '08:00', '08:30']))),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Total slept (fills in from the times, or enter it yourself)'), dur),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'How well did you sleep?'), qual, h('div', { class: 'tiny faint', style: { marginTop: '6px' } }, sl.quality ? '' : 'Optional')),
      field('Notes', h('input', { type: 'text', maxlength: 1000, placeholder: 'Anything about the night?', value: sl.notes || '', onInput: (e) => { if (e.target.value) sl.notes = e.target.value; else delete sl.notes; touch(); } })));
    // screen
    let totalDur, phoneDur, compDur;
    const sumOf = () => (sc.phone || 0) + (sc.computer || 0);
    const setK = (k, v) => { if (v == null) delete sc[k]; else sc[k] = v; };
    totalDur = durationInput({ value: sc.total, label: 'Total screen time', onChange: (v) => { setK('total', v); touch(); } });
    const part = (k) => (v) => { const wasAuto = sc.total == null || sc.total === sumOf(); setK(k, v); if (wasAuto && (sc.phone != null || sc.computer != null)) { sc.total = sumOf(); totalDur.set(sc.total); } touch(); };
    phoneDur = durationInput({ value: sc.phone, label: 'Phone', onChange: part('phone') });
    compDur = durationInput({ value: sc.computer, label: 'Computer or TV', onChange: part('computer') });
    const screenCard = h('div', { class: 'paper sub-card' }, h('h4', null, 'Screen time'),
      h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'From your phone’s Screen Time, or your best guess. Nothing is connected — you’re in control.'),
      h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Total'), totalDur, h('div', { class: 'chips', style: { marginTop: '8px' } }, [60, 120, 180, 240, 360].map((m) => h('button', { type: 'button', class: 'chip tiny', onClick: () => { sc.total = m; totalDur.set(m); touch(); } }, durText(m))))),
      h('div', { class: 'form-row one-m' }, h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Phone (optional)'), phoneDur), h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Computer / TV (optional)'), compDur)),
      field('Comments', h('input', { type: 'text', maxlength: 1000, placeholder: 'Optional', value: sc.comments || '', onInput: (e) => { if (e.target.value) sc.comments = e.target.value; else delete sc.comments; touch(); } })));
    return section('Rest & screens', 'Quick to fill in, and entirely optional.', sleepCard, screenCard);
  }

  function didSection() {
    const detail = h('div'), chips = h('div', { class: 'chips' });
    const draw = () => {
      clear(chips); clear(detail);
      for (const [t, label] of ACTIVITIES) chips.append(h('button', { type: 'button', class: 'chip' + (draft.activities.some((a) => a.type === t) ? ' on' : ''), 'aria-pressed': draft.activities.some((a) => a.type === t) ? 'true' : 'false', onClick: async () => {
        const i = draft.activities.findIndex((a) => a.type === t);
        if (i >= 0) { const a = draft.activities[i]; if ((a.desc || a.duration != null || a.distance != null || a.label) && !(await confirmDialog(`Remove “${label}” and its details?`, { okText: 'Remove', title: 'Remove activity?' }))) return; draft.activities.splice(i, 1); }
        else draft.activities.push({ type: t });
        draw(); touch();
      } }, label));
      for (const a of draft.activities) {
        const meta = ACTIVITIES.find((x) => x[0] === a.type)[2];
        const num = (k, v) => { if (v === '' || v == null) delete a[k]; else a[k] = Number(v); touch(); };
        detail.append(h('div', { class: 'act-detail' },
          h('div', { class: 'head' }, h('span', null, ACT_LABEL[a.type]), h('button', { type: 'button', class: 'btn ghost small', onClick: () => { draft.activities.splice(draft.activities.indexOf(a), 1); draw(); touch(); } }, 'Remove')),
          h('input', { type: 'text', maxlength: 60, placeholder: a.type === 'other' ? 'What was it?' : 'Give it a name (optional) — e.g. “Canal loop”', value: a.label || '', 'aria-label': 'Name', onInput: (e) => { if (e.target.value) a.label = e.target.value; else delete a.label; touch(); } }),
          h('div', { class: 'form-row3' },
            h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 1440, placeholder: 'Minutes', value: a.duration ?? '', 'aria-label': 'Duration in minutes', onInput: (e) => num('duration', e.target.value) }),
            meta.distance ? h('input', { type: 'number', inputmode: 'decimal', step: '0.01', min: 0, max: 5000, placeholder: 'Distance (km)', value: a.distance ?? '', 'aria-label': 'Distance in kilometres', onInput: (e) => num('distance', e.target.value) }) : null),
          h('textarea', { rows: 2, maxlength: 1000, placeholder: 'A few words about it (optional)', style: { marginTop: '10px', minHeight: '60px' }, onInput: (e) => { if (e.target.value) a.desc = e.target.value; else delete a.desc; touch(); } }, a.desc || '')));
      }
    };
    draw();
    return section('What did you do?', 'Tap everything that was part of your day. It’s a record, not a to-do list.', h('div', { class: 'paper' }, chips, detail));
  }

  function keepSection() {
    const c = draft.culture;
    const inp = (k, label, ph, max = 200) => field(label, h('input', { type: 'text', maxlength: max, placeholder: ph, value: c[k] || '', onInput: (e) => { if (e.target.value.trim()) c[k] = e.target.value; else delete c[k]; touch(); } }));
    const area = (k, label, ph, serif) => field(label, h('textarea', { rows: 2, maxlength: 1500, placeholder: ph, style: serif ? { fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '17px', minHeight: '70px' } : { minHeight: '70px' }, onInput: (e) => { if (e.target.value.trim()) c[k] = e.target.value; else delete c[k]; touch(); } }, c[k] || ''));
    const photoBox = h('div');
    const drawPhoto = () => {
      clear(photoBox);
      const pick = h('input', { type: 'file', accept: 'image/*', class: 'sr', 'aria-label': 'Choose a photo', onChange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        photoBox.replaceChildren(h('div', { class: 'photo-drop' }, 'Adding your photo…'));
        try { draft.photo_id = await uploadPhoto(f); touch(); } catch (ex) { toast(ex.message, true); }
        drawPhoto();
      } });
      if (draft.photo_id) photoBox.append(h('div', { class: 'photo-frame' }, photoImg(draft.photo_id), h('div', { class: 'btns' },
        h('label', { class: 'btn small' }, 'Replace', pick), h('button', { type: 'button', class: 'btn small', onClick: () => { draft.photo_id = null; touch(); drawPhoto(); } }, 'Remove'))));
      else photoBox.append(h('label', { class: 'photo-drop' }, pick, h('div', { style: { fontWeight: 600, color: 'var(--ink)' } }, 'Add a photo of the day'), h('div', { class: 'small' }, 'Take one or choose from your library')));
    };
    drawPhoto();
    return section('Keep something from today', 'Songs, films, a line you liked. Future you will be glad of these.',
      h('div', { class: 'paper' },
        h('div', { class: 'form-row' }, inp('song', 'Favourite song of the day', 'Title'), inp('artist', 'Artist', 'Who sang it')),
        h('div', { class: 'form-row', style: { marginTop: '14px' } }, inp('film', 'Film watched', 'Optional'), inp('show', 'TV show watched', 'Optional')),
        h('div', { style: { marginTop: '14px' } }, inp('book', 'Book read', 'Optional')),
        h('div', { style: { marginTop: '14px' } }, area('quote', 'Favourite quote', 'Something you read or heard', true)),
        h('div', { style: { marginTop: '14px' } }, area('moment', 'Best moment of the day', 'The one you’d want to remember')),
        h('div', { class: 'field' }, h('span', { class: 'lab' }, 'Photo of the day'), photoBox)));
  }

  function finishSection() {
    const box = h('div');
    const draw = () => {
      clear(box);
      const f = dayFinance(date), r = Object.values(draft.ratings);
      const glance = [];
      glance.push(f.count ? `${money(f.spent)} spent` : 'No spending recorded');
      if (draft.ratings.happiness != null) glance.push(`Happiness ${draft.ratings.happiness}/10`);
      if (draft.sleep.minutes != null) glance.push(`${durText(draft.sleep.minutes)} sleep`);
      if (draft.activities.length) glance.push(plural(draft.activities.length, 'activity', 'activities'));
      if (draft.culture.song) glance.push('♪ ' + draft.culture.song);
      if (draft.photo_id) glance.push('Photo added');
      if (draft.completed) {
        box.append(h('div', { class: 'paper finish' }, h('h2', null, justFinished ? 'Day saved. Goodnight.' : 'This day is complete'), h('p', { class: 'muted', style: { marginTop: '8px' } }, justFinished ? 'Thank you for taking a moment. It’s all kept safe.' : 'You can still change anything above — it saves as you go.'),
          h('div', { class: 'glance' }, glance.map((g) => h('span', null, g))),
          h('div', { class: 'row wrap', style: { justifyContent: 'center', marginTop: '20px' } },
            h('a', { class: 'btn warm', href: '#/' }, 'Back to overview'),
            mode === 'guided' ? h('button', { class: 'btn', onClick: () => { mode = 'all'; renderBody(); window.scrollTo(0, 0); } }, 'Read the whole page') : null,
            h('button', { class: 'btn ghost small', onClick: () => { draft.completed = false; justFinished = false; touch(); flush(); draw(); } }, 'Mark as not finished'))));
      } else {
        box.append(h('div', { class: 'paper finish' }, h('h2', null, 'Ready to close the day?'), h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Everything is optional — finish with as much or as little as you like.'),
          h('div', { class: 'glance' }, glance.map((g) => h('span', null, g))),
          h('div', { style: { marginTop: '20px' } }, h('button', { class: 'btn warm', onClick: async () => { draft.completed = true; justFinished = true; touch(); await flush(); draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Finish the day'))));
      }
    };
    draw();
    return h('section', { class: 'log-section' }, box);
  }

  // ───── layout ─────
  const body = h('div');
  const stepsEl = h('div', { class: 'steps', role: 'tablist', 'aria-label': 'Steps' });
  const navEl = h('div', { class: 'step-nav' });
  const builders = { money: () => moneySection(mode === 'guided'), day: daySection, feel: feelSection, body: bodySection, did: didSection, keep: keepSection, finish: finishSection };

  function renderBody() {
    clear(body); clear(stepsEl); clear(navEl);
    toggleBtn.textContent = mode === 'guided' ? 'Show whole page' : 'Guided mode';
    if (mode === 'all') {
      for (const [k] of STEPS) body.append(builders[k]());
      const ex = getLog(date);
      if (ex) body.append(h('div', { style: { textAlign: 'center', marginTop: '36px' } }, h('button', { class: 'btn ghost small danger', onClick: async () => {
        if (!(await confirmDialog('This permanently deletes the written log, ratings and photo for this day. Your transactions are not affected.', { okText: 'Delete this day’s log', title: 'Delete this log?' }))) return;
        clearTimeout(timer); dirty = false; await saving;
        try { await deleteLog(date); toast('Log deleted'); go('#/calendar'); } catch (e) { toast(e.message, true); }
      } }, 'Delete this day’s log')));
      return;
    }
    STEPS.forEach(([k, label], i) => stepsEl.append(h('button', { class: i < step ? 'done' : i === step ? 'on' : '', role: 'tab', 'aria-selected': i === step ? 'true' : 'false', 'aria-label': label, onClick: () => { step = i; renderBody(); window.scrollTo(0, 0); } }, h('i'), h('span', null, label))));
    body.append(builders[STEPS[step][0]]());
    if (step < STEPS.length - 1) navEl.append(
      step > 0 ? h('button', { class: 'btn', onClick: () => { step--; renderBody(); window.scrollTo(0, 0); } }, 'Back') : h('span'),
      h('button', { class: 'btn warm', onClick: () => { step++; renderBody(); window.scrollTo(0, 0); } }, step === STEPS.length - 2 ? 'Review & finish' : 'Continue'));
    else navEl.append(h('button', { class: 'btn', onClick: () => { step--; renderBody(); } }, 'Back'), h('span'));
  }

  const toggleBtn = h('button', { class: 'btn small', onClick: () => { mode = mode === 'guided' ? 'all' : 'guided'; renderBody(); } });
  const nav = (n, label, aria) => h('a', { class: 'icon-btn', href: `#/log/${addDays(date, n)}`, 'aria-label': aria, title: aria }, icon(label));
  const nextOk = addDays(date, 1) <= today;
  updatePill();
  if (existing) setStatus('Saved');

  const el = h('div', { class: 'log-wrap' },
    h('div', { class: 'log-head' }, h('div', null, h('div', { class: 'small muted', style: { fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em' } }, relDay(date) === 'Today' ? 'Today' : relDay(date) === 'Yesterday' ? 'Yesterday' : ''),
      h('h1', { class: 'log-date' }, longDate(date, date.slice(0, 4) !== today.slice(0, 4)))),
      h('div', { class: 'row gap-s' }, nav(-1, 'M15 5l-7 7 7 7', 'Previous day'), nextOk ? nav(1, 'M9 5l7 7-7 7', 'Next day') : null)),
    h('div', { class: 'log-status' }, pillEl, statusEl, h('span', { style: { marginLeft: 'auto' } }, toggleBtn)),
    stepsEl, body, navEl);
  renderBody();

  return {
    el,
    leave: async () => { await flush(); },
    pagehide: () => { if (dirty) { dirty = false; saveLog(date, snapshot(), { keepalive: true }).catch(() => {}); } },
  };
}
