/**
 * Tiny i18n layer. French text is already in the static HTML (SEO + no flash),
 * so we only touch the DOM when the visitor's language differs from French.
 *
 * Markup:  data-i18n="key"          -> textContent
 *          data-i18n-html="key"     -> innerHTML (trusted dictionary only)
 *          data-i18n-attr="aria-label:key;title:key2"
 */
import { LANGS, DEFAULT_LANG } from './config.js';

let dict = {};
let fallback = {};
let lang = DEFAULT_LANG;
const listeners = new Set();

function detect() {
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage may be blocked */ }
  return DEFAULT_LANG; // French by default, as requested
}

async function load(l) {
  return (await import(`../i18n/${l}.js`)).default;
}

export const getLang = () => lang;
export const onLangChange = (fn) => listeners.add(fn);

/** Translate with {placeholder} substitution. Falls back to French, then the key. */
export function t(key, vars) {
  let s = dict[key] ?? fallback[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return s;
}

export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
  root.querySelectorAll('[data-year]').forEach((el) => { el.textContent = t(el.dataset.i18n || 'foot.rights', { year: new Date().getFullYear() }); });

  // Per-page <title> and meta description
  const page = document.body.dataset.page;
  if (page) {
    document.title = t(`meta.${page}.title`);
    document.querySelector('meta[name="description"]')?.setAttribute('content', t(`meta.${page}.desc`));
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t(`meta.${page}.title`));
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t(`meta.${page}.desc`));
  }
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

export async function initI18n() {
  lang = detect();
  dict = await load(lang);
  fallback = lang === DEFAULT_LANG ? dict : await load(DEFAULT_LANG);
  if (lang !== DEFAULT_LANG) applyDom(); else {
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  document.querySelectorAll('.lang button').forEach((btn) =>
    btn.addEventListener('click', () => setLang(btn.dataset.lang)),
  );
}

export async function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem('lang', next); } catch { /* ignore */ }
  dict = await load(next);
  applyDom();
  listeners.forEach((fn) => fn(next));
}
