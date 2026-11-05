import { h, field, todayStr, toast } from '../util.js';
import { api } from '../api.js';
import { S } from '../store.js';

export function renderAuth(mode, q, onAuthed) {
  const err = h('div', { class: 'form-err', role: 'alert' });
  const info = h('div', { class: 'small muted', style: { marginTop: '12px' }, role: 'status' });
  const btn = (label) => h('button', { class: 'btn primary', type: 'submit' }, label);
  let card;

  const run = async (b, fn) => { err.textContent = ''; b.disabled = true; try { await fn(); } catch (e) { err.textContent = e.message; } finally { b.disabled = false; } };

  if (mode === 'signup') {
    const name = h('input', { type: 'text', autocomplete: 'given-name', placeholder: 'Optional', maxlength: 60 });
    const email = h('input', { type: 'email', autocomplete: 'email', required: true, inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
    const pw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10, maxlength: 200 });
    const demo = h('input', { type: 'checkbox', checked: true });
    const b = btn('Create account');
    card = h('form', { onSubmit: (e) => { e.preventDefault(); run(b, async () => {
      const { user } = await api('POST', '/auth/signup', { name: name.value, email: email.value, password: pw.value, demo: demo.checked, today: todayStr() });
      S.user = user; await onAuthed();
    }); } },
      h('h2', null, 'Create your Daybook'), field('First name', name), field('Email', email), field('Password', pw, 'At least 10 characters. A few random words works well.'),
      h('label', { class: 'check' }, demo, h('span', null, 'Start with fictional demo data so I can look around. I can clear it any time.')), err, b);
  } else if (mode === 'forgot') {
    const email = h('input', { type: 'email', autocomplete: 'email', required: true, inputmode: 'email', autocapitalize: 'none' });
    const b = btn('Send reset link');
    card = h('form', { onSubmit: (e) => { e.preventDefault(); run(b, async () => {
      const r = await api('POST', '/auth/forgot', { email: email.value });
      info.textContent = r.message;
      if (r.devLink) info.append(h('div', { class: 'devlink' }, h('b', null, 'Local development: '), 'email isn’t configured, so here’s your link: ', h('a', { href: r.devLink }, r.devLink)));
    }); } }, h('h2', null, 'Reset your password'), h('p', { class: 'muted small', style: { marginBottom: '14px' } }, 'Enter your email and we’ll send you a link to choose a new password.'), field('Email', email), err, b, info);
  } else if (mode === 'reset') {
    const pw = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10, maxlength: 200 });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10, maxlength: 200 });
    const b = btn('Set new password');
    card = h('form', { onSubmit: (e) => { e.preventDefault(); run(b, async () => {
      if (pw.value !== pw2.value) throw new Error('The two passwords don’t match.');
      await api('POST', '/auth/reset', { token: q.token || '', password: pw.value });
      toast('Password updated. Please sign in.'); location.hash = '#/login';
    }); } }, h('h2', null, 'Choose a new password'), field('New password', pw, 'At least 10 characters.'), field('Confirm password', pw2), err, b);
  } else {
    const email = h('input', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
    const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, maxlength: 200 });
    const b = btn('Sign in');
    card = h('form', { onSubmit: (e) => { e.preventDefault(); run(b, async () => {
      const { user } = await api('POST', '/auth/login', { email: email.value, password: pw.value });
      S.user = user; await onAuthed();
    }); } }, h('h2', null, 'Welcome back'), field('Email', email), field('Password', pw), err, b);
  }

  const links = mode === 'login'
    ? [h('a', { href: '#/forgot' }, 'Forgot password?'), h('a', { href: '#/signup' }, 'Create an account')]
    : [h('a', { href: '#/login' }, 'Back to sign in')];
  return h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'auth-brand' }, h('span', { class: 'brand' }, h('span', { class: 'brand-mark' }), 'Daybook'), h('p', null, 'Your money and your days, in one private place.')),
    h('div', { class: 'card' }, card), h('div', { class: 'auth-links' }, links),
    h('p', { class: 'tiny faint', style: { textAlign: 'center', marginTop: '22px' } }, 'Private by design. Your records are only visible to you.')));
}
