/** Small DOM + formatting helpers shared by public pages. */
import { icon } from './icons.js';
import { getLang, t } from './i18n.js';

/** Escape untrusted text before it is ever put in an HTML string. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Create an element safely: props set as properties/attributes, children as text nodes. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(c));
  return node;
}

/** Trusted SVG icon -> element. */
export function iconEl(name, cls) {
  const tpl = document.createElement('template');
  tpl.innerHTML = icon(name, cls);
  return tpl.content.firstElementChild;
}

export function formatPrice(price, currency = 'EUR') {
  if (price == null) return null;
  return new Intl.NumberFormat(getLang() === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency, minimumFractionDigits: Number.isInteger(+price) ? 0 : 2,
  }).format(price);
}

export function formatDuration(min) {
  if (!min) return null;
  if (min >= 1440) { const d = Math.round(min / 1440); return t(d > 1 ? 'time.days' : 'time.day', { n: d }); }
  if (min < 60) return t('time.min', { n: min });
  const h = Math.floor(min / 60), m = min % 60;
  return m ? t('time.hm', { h, m }) : t('time.h', { h });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Name of a repair type in the current language. */
export const repairName = (rt) => (getLang() === 'en' ? rt.name_en || rt.name_fr : rt.name_fr);

/** Skeleton placeholders. */
export function skeletons(count, height = '72px') {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) frag.append(el('div', { class: 'skeleton', style: `height:${height}`, 'aria-hidden': 'true' }));
  return frag;
}

/** Friendly error / empty state block. */
export function stateBlock({ title, text, retry, error = false }) {
  const box = el('div', { class: `state${error ? ' state--error' : ''}`, role: error ? 'alert' : 'status' });
  if (title) box.append(el('strong', { text: title }));
  box.append(el('span', { text }));
  if (retry) box.append(el('div', {}, el('button', { class: 'btn btn--primary', type: 'button', onclick: retry, text: t('pr.retry') })));
  return box;
}

/** Fade-in on scroll (IntersectionObserver). Content stays visible without JS. */
export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach((i) => io.observe(i));
}

/** Mobile menu toggle. */
export function initNav() {
  const btn = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  const set = (open) => { nav.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}
