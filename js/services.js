/** Services page: fills each repair card with its live "À partir de" price from Supabase. */
import { ready } from './main.js';
import { getPricePreview } from './api.js';
import { onLangChange } from './i18n.js';
import { formatPrice } from './ui.js';

await ready;

let best = null;

function render() {
  document.querySelectorAll('[data-price-icon]').forEach((tag) => {
    const row = best?.find((r) => r.type.icon === tag.dataset.priceIcon);
    tag.hidden = !row;
    if (row) tag.querySelector('strong').textContent = formatPrice(row.price);
  });
}

onLangChange(render);
try {
  best = await getPricePreview();
  render();
} catch (err) {
  console.warn('Prices unavailable on services page.', err); // cards simply show no price tag
}
