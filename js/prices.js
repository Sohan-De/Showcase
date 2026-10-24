/** Prices page: Brand -> Model (with search) -> repairs, all from Supabase. */
import { ready } from './main.js';
import { getBrands, getModels, getPricesForModel } from './api.js';
import { onLangChange, t } from './i18n.js';
import { el, iconEl, formatPrice, formatDuration, formatDate, repairName, skeletons, stateBlock } from './ui.js';

await ready;

const $ = (id) => document.getElementById(id);
const brandsBox = $('brands'), modelsBox = $('models'), resultsBox = $('results'), searchInput = $('model-search'), countEl = $('model-count');
const steps = [...document.querySelectorAll('.steps-nav li')];

const state = { brands: [], models: [], brandId: null, model: null, query: '' };

const setStep = (n) => steps.forEach((li, i) => li.classList.toggle('is-active', i === n - 1));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function renderBrands() {
  if (!state.brands.length) { brandsBox.replaceChildren(stateBlock({ text: t('pr.nobrand') })); return; }
  brandsBox.replaceChildren(...state.brands.map((b) =>
    el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(b.id === state.brandId), text: b.name,
      onclick: () => { state.brandId = b.id; state.query = ''; searchInput.value = ''; state.model = null; renderAll(); modelsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
    })));
}

function visibleModels() {
  const q = norm(state.query.trim());
  if (q) return state.models.filter((m) => norm(m.name).includes(q) || norm(brandName(m.brand_id)).includes(q));
  return state.brandId ? state.models.filter((m) => m.brand_id === state.brandId) : [];
}
const brandName = (id) => state.brands.find((b) => b.id === id)?.name ?? '';

function renderModels() {
  const list = visibleModels();
  countEl.textContent = list.length ? t('pr.count', { n: list.length }) : '';
  if (!state.brandId && !state.query.trim()) { modelsBox.replaceChildren(el('p', { class: 'note', text: t('pr.pick') })); return; }
  if (!list.length) { modelsBox.replaceChildren(stateBlock({ text: t('pr.nomodel', { q: state.query }) })); return; }
  modelsBox.replaceChildren(...list.map((m) =>
    el('button', {
      class: 'model-btn', type: 'button', 'aria-pressed': String(state.model?.id === m.id),
      onclick: () => selectModel(m),
    }, /^https:\/\//.test(m.image || '') ? el('img', { src: m.image, alt: '', loading: 'lazy', width: 56, height: 56 }) : null,
      el('span', { class: 'model-btn__txt' }, el('small', { text: brandName(m.brand_id) }), el('strong', { text: m.name })))));
}

async function selectModel(model) {
  state.model = model;
  renderModels();
  setStep(3);
  resultsBox.setAttribute('aria-busy', 'true');
  resultsBox.replaceChildren(skeletons(5, '78px'));
  resultsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    state.rows = await getPricesForModel(model.id);
    renderResults();
  } catch (err) {
    console.error(err);
    resultsBox.replaceChildren(stateBlock({ title: t('pr.error.t'), text: t('pr.error.d'), error: true, retry: () => selectModel(model) }));
  } finally {
    resultsBox.removeAttribute('aria-busy');
  }
}

function renderResults() {
  const { model, rows } = state;
  if (!model) { resultsBox.replaceChildren(); return; }
  const head = el('div', { class: 'results-head' }, el('h2', { text: t('pr.results', { model: model.name }) }));
  if (!rows?.length) { resultsBox.replaceChildren(head, stateBlock({ text: t('pr.empty') })); return; }
  const latest = rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), '');
  const items = rows.map((r) => {
    const quote = r.price == null;
    const link = `contact.html?model=${encodeURIComponent(model.name)}&repair=${encodeURIComponent(repairName(r.repair_types))}`;
    return el('div', { class: 'card repair-row' },
      el('span', { class: 'icon-box' }, iconEl(r.repair_types.icon)),
      el('div', {},
        el('h3', { text: repairName(r.repair_types) }),
        r.est_time_minutes ? el('span', { class: 'time' }, iconEl('clock'), t('pr.time', { t: formatDuration(r.est_time_minutes) })) : null),
      el('span', { class: `price${quote ? ' quote' : ''}`, text: quote ? t('pr.quote') : formatPrice(r.price, r.currency) }),
      el('a', { class: 'btn btn--sm btn--ghost cta', href: link, text: t('pr.book') }));
  });
  // Show the CTA button on every row (kept in markup for keyboard users).
  items.forEach((i) => i.querySelector('.cta').style.display = 'inline-flex');
  resultsBox.replaceChildren(head, ...items, el('p', { class: 'note', text: `${t('pr.updated', { date: formatDate(latest) })}. ${t('pr.disclaimer')}` }));
}

function renderAll() {
  renderBrands(); renderModels(); renderResults();
  setStep(state.model ? 3 : state.brandId || state.query ? 2 : 1);
}

async function init() {
  brandsBox.replaceChildren(skeletons(5, '46px'));
  brandsBox.classList.add('chips');
  modelsBox.replaceChildren();
  try {
    [state.brands, state.models] = await Promise.all([getBrands(), getModels()]);
    renderAll();
    // Deep link: prices.html?q=iphone 13
    const q = new URLSearchParams(location.search).get('q');
    if (q) { searchInput.value = q; state.query = q; renderAll(); }
  } catch (err) {
    console.error(err);
    brandsBox.classList.remove('chips');
    brandsBox.replaceChildren(stateBlock({ title: t('pr.error.t'), text: t('pr.error.d'), error: true, retry: init }));
  }
}

let timer;
searchInput.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.query = searchInput.value; state.model = null; renderAll(); }, 150);
});
onLangChange(() => { if (state.brands.length) renderAll(); });
init();
