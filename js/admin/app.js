/** Admin shell: auth guard, tab routing (hash), lazy panel init, logout. */
import { requireAdmin, logout } from './guard.js';
import { initPrices } from './prices.js';
import { initSettings } from './settings.js';
import { initMessages, refreshBadge } from './messages.js';

const PANELS = {
  tarifs: initPrices,
  boutique: initSettings,
  messages: initMessages,
};

// old bookmarks (#prix, #catalogue, #outils) now lead to the merged page
const ALIAS = { prix: 'tarifs', catalogue: 'tarifs', outils: 'tarifs' };

const auth = await requireAdmin();
if (auth) {
  document.body.classList.remove('is-checking');
  document.getElementById('who').textContent = auth.session.user.email;
  document.getElementById('logout').addEventListener('click', logout);

  const loaded = new Set();
  const show = async () => {
    const h = location.hash.slice(1);
    const key = PANELS[ALIAS[h] || h] ? (ALIAS[h] || h) : 'tarifs';
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== key; });
    document.querySelectorAll('.tabbar a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${key}`)));
    if (key === 'messages') loaded.delete(key); // always refresh
    if (!loaded.has(key)) { loaded.add(key); await PANELS[key](document.querySelector(`[data-panel="${key}"] .panel-body`)); }
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', show);
  show();
  refreshBadge();
}
