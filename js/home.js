/** Home page: price preview ("À partir de …") + lazy Google Maps. */
import { ready } from './main.js';
import { getPricePreview } from './api.js';
import { onLangChange, t } from './i18n.js';
import { el, iconEl, formatPrice, repairName, skeletons, stateBlock } from './ui.js';

await ready;

const box = document.getElementById('price-preview');
let data = null;

function render() {
  if (!box || !data) return;
  box.replaceChildren(...data.map(({ price, type }) =>
    el('div', { class: 'card preview__item' },
      el('span', { class: 'icon-box' }, iconEl(type.icon)),
      el('h3', { text: repairName(type) }),
      el('span', { class: 'from', text: t('pv.from') }),
      el('span', { class: 'amount', text: formatPrice(price) }),
    )));
}

async function load() {
  if (!box) return;
  box.setAttribute('aria-busy', 'true');
  box.replaceChildren(skeletons(4, '170px'));
  try {
    data = await getPricePreview();
    if (!data.length) throw new Error('empty');
    render();
  } catch (err) {
    console.warn(err);
    box.replaceChildren(stateBlock({ text: t('pv.error'), error: true }));
  } finally {
    box.removeAttribute('aria-busy');
  }
}

onLangChange(render);
load();

// Shop gallery: click a photo to see it full size (native <dialog>: Esc and backdrop click close it).
document.querySelectorAll('.tile').forEach((tile) => tile.addEventListener('click', () => {
  const small = tile.querySelector('img');
  const dlg = el('dialog', { class: 'lightbox', 'aria-label': small.alt },
    el('img', { src: tile.dataset.full, alt: small.alt, width: tile.dataset.w, height: tile.dataset.h }),
    el('button', { class: 'btn btn--sm', type: 'button', text: t('lb.close'), onclick: () => dlg.close() }));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}));

// Click-to-load map: no third-party request or cookie until the visitor agrees.
document.querySelectorAll('[data-map-load]').forEach((btn) => btn.addEventListener('click', () => {
  const wrap = btn.closest('.map');
  const frame = document.createElement('iframe');
  frame.src = wrap.dataset.src;
  frame.title = t('map.title');
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  wrap.replaceChildren(frame);
}));
