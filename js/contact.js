/** Contact page: live WhatsApp link, validated form -> Supabase contact_messages. */
import { ready, waUrl, waText } from './main.js';
import { sendContact } from './api.js';
import { getLang, onLangChange, t } from './i18n.js';
import { CONTACT_COOLDOWN_S } from './config.js';

await ready;

const form = document.getElementById('contact-form');
const msgBox = document.getElementById('form-status');
const wa = document.getElementById('wa-main');
const modelInput = form.elements.model;
const loadedAt = Date.now();

// Prefill from prices page: contact.html?model=iPhone 13&repair=Écran
const params = new URLSearchParams(location.search);
if (params.get('model')) modelInput.value = params.get('model').slice(0, 100);
if (params.get('repair')) form.elements.message.value = `${params.get('repair').slice(0, 80)} — `;

function refreshWa() { wa.href = waUrl(waText(modelInput.value)); }
wa.setAttribute('data-wa-custom', '');
modelInput.addEventListener('input', refreshWa);
form.addEventListener('reset', () => setTimeout(refreshWa));
onLangChange(refreshWa);
refreshWa();

function fieldError(name, key) {
  const input = form.elements[name];
  const holder = input.closest('.field') || input.closest('.check');
  holder.querySelector('.field-error')?.remove();
  input.removeAttribute('aria-invalid');
  if (!key) return false;
  input.setAttribute('aria-invalid', 'true');
  const p = Object.assign(document.createElement('p'), { className: 'field-error', textContent: t(key) });
  p.id = `${name}-err`; input.setAttribute('aria-describedby', p.id);
  holder.append(p);
  return true;
}

function setStatus(type, text) {
  msgBox.hidden = !text;
  msgBox.dataset.type = type || '';
  msgBox.textContent = text || '';
}

function validate() {
  const f = form.elements;
  const phone = f.phone.value.trim(), email = f.email.value.trim();
  let bad = false;
  bad = fieldError('name', f.name.value.trim() ? null : 'f.req') || bad;
  bad = fieldError('message', f.message.value.trim().length >= 5 ? null : 'f.req') || bad;
  bad = fieldError('phone', phone || email ? null : 'f.needContact') || bad;
  bad = fieldError('email', !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'f.badEmail') || bad;
  bad = fieldError('consent', f.consent.checked ? null : 'f.needConsent') || bad;
  return !bad;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus();
  const f = form.elements;

  // Spam defences: honeypot (bots fill it), too-fast submit, per-browser cooldown.
  if (f.website.value || Date.now() - loadedAt < 2500) { setStatus('success', t('f.ok')); form.reset(); return; }
  if (!validate()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
  try {
    const last = Number(localStorage.getItem('contact_last') || 0);
    if (Date.now() - last < CONTACT_COOLDOWN_S * 1000) { setStatus('error', t('f.rate')); return; }
  } catch { /* storage blocked: server-side limit still applies */ }

  const btn = form.querySelector('[type=submit]');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = t('f.sending');
  try {
    await sendContact({
      name: f.name.value.trim(),
      phone: f.phone.value.trim() || null,
      email: f.email.value.trim() || null,
      model: f.model.value.trim() || null,
      message: f.message.value.trim(),
      lang: getLang(),
    });
    try { localStorage.setItem('contact_last', String(Date.now())); } catch { /* ignore */ }
    setStatus('success', t('f.ok'));
    form.reset();
  } catch (err) {
    console.error(err);
    setStatus('error', /rate_limited/.test(err?.message || '') ? t('f.rate') : t('f.err'));
  } finally {
    btn.disabled = false; btn.textContent = label;
    msgBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
