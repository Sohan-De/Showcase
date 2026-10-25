/** Login page: Supabase Auth email + password. No sign-up flow exists on purpose. */
import { getClient } from '../client.js';

const form = document.getElementById('login-form');
const msg = document.getElementById('login-msg');
const btn = form.querySelector('button[type=submit]');
const show = (text) => { msg.textContent = text; msg.hidden = !text; };

if (new URLSearchParams(location.search).has('denied')) show('Ce compte n’a pas les droits d’administration.');

// Already signed in? Go straight to the dashboard.
getClient().then(async (db) => {
  const { data: { session } } = await db.auth.getSession();
  if (session && !location.search.includes('denied')) location.replace(new URL('../../admin/index.html', import.meta.url).href);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show('');
  btn.disabled = true; btn.textContent = 'Connexion…';
  try {
    const db = await getClient();
    const { error } = await db.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
    if (error) throw error;
    location.replace(new URL('../../admin/index.html', import.meta.url).href);
  } catch (err) {
    console.error(err);
    show(/invalid login/i.test(err.message) ? 'E-mail ou mot de passe incorrect.' : 'Connexion impossible. Vérifiez votre connexion internet et réessayez.');
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
});
