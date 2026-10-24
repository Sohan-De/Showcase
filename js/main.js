/**
 * Shared bootstrap for every public page: i18n, nav, scroll reveal,
 * live opening status, and live shop settings (phone, hours, promo…).
 * Page-specific modules `await ready` from here.
 */
import { SHOP_DEFAULTS } from './config.js';
import { initI18n, onLangChange, getLang, t } from './i18n.js';
import { initNav, initReveal } from './ui.js';
import { renderHoursTable, updateStatusBadges } from './hours.js';
import { getSettings } from './api.js';

document.documentElement.classList.add('js');

export const shop = { ...SHOP_DEFAULTS };
let promo = null;

export const waUrl = (text = '') => `https://wa.me/${shop.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const waText = (model) => t('wa.msg', { model: model?.trim() || t('wa.generic') });

function refreshWhatsApp() {
  document.querySelectorAll('[data-wa]').forEach((a) => {
    if (!a.hasAttribute('data-wa-custom')) a.href = waUrl(waText(''));
  });
}

function renderHours() {
  document.querySelectorAll('[data-hours-body]').forEach((tb) => renderHoursTable(tb, shop.hours));
  updateStatusBadges(shop.hours);
}

function renderPromo() {
  document.getElementById('promo')?.remove();
  if (!promo?.enabled) return;
  const text = getLang() === 'en' ? promo.text_en || promo.text_fr : promo.text_fr;
  if (!text) return;
  const bar = document.createElement('div');
  bar.id = 'promo'; bar.className = 'promo'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Promo');
  if (/^https?:\/\//i.test(promo.link || '')) {
    const a = document.createElement('a'); a.href = promo.link; a.textContent = text; a.rel = 'noopener'; bar.append(a);
  } else bar.textContent = text; // textContent: admin text is never parsed as HTML
  document.body.prepend(bar);
}

function applyShop() {
  document.querySelectorAll('[data-phone-link]').forEach((a) => { a.href = `tel:${shop.phone.replace(/[^\d+]/g, '')}`; });
  document.querySelectorAll('[data-phone-text]').forEach((s) => { s.textContent = shop.phone; });
  document.querySelectorAll('[data-facebook]').forEach((a) => { if (/^https?:\/\//i.test(shop.facebook)) a.href = shop.facebook; });
  document.querySelectorAll('[data-review-link]').forEach((a) => { if (/^https?:\/\//i.test(shop.google_review_url)) a.href = shop.google_review_url; });
  refreshWhatsApp();
  renderHours();
  renderPromo();
}

async function loadSettings() {
  try {
    const s = await getSettings();
    if (s.shop) Object.assign(shop, s.shop);
    promo = s.promo || null;
  } catch (err) {
    console.warn('Settings unavailable, using defaults.', err);
  }
  applyShop();
}

async function boot() {
  initNav();
  await initI18n();
  initReveal();
  renderHours();
  refreshWhatsApp();
  onLangChange(() => { applyShop(); });
  setInterval(() => updateStatusBadges(shop.hours), 60_000);
  // Settings are non-critical: fetch when the browser is idle.
  (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(loadSettings);
}

export const ready = boot();
