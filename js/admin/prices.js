/** Prices tab: Brand -> Model -> inline edit price / time / availability. */
import { listBrands, listModels, listRepairTypes, pricesForModel, upsertPrices } from './adminApi.js';
import { el, $, toast, withBusy, fmtDate, field } from './ui.js';

let brands = [], models = [], types = [], current = null, dirty = new Map(), existing = new Map();
let root;

export async function initPrices(container) {
  root = container;
  root.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  try {
    [brands, models, types] = await Promise.all([listBrands(), listModels(), listRepairTypes()]);
  } catch (e) { root.replaceChildren(el('p', { class: 'msg msg--error', text: 'Impossible de charger le catalogue. Rechargez la page.' })); console.error(e); return; }

  const brandSel = el('select', { class: 'input input--lg', id: 'p-brand' }, el('option', { value: '', text: '— Choisir une marque —' }),
    brands.map((b) => el('option', { value: b.id, text: b.name + (b.is_active ? '' : ' (masquée)') })));
  const modelSel = el('select', { class: 'input input--lg', id: 'p-model', disabled: true }, el('option', { value: '', text: '— Choisir un modèle —' }));
  const table = el('div', { id: 'p-table' });
  const bar = el('div', { class: 'savebar', hidden: true },
    el('span', { id: 'p-count' }),
    el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'p-save', text: 'Enregistrer', onclick: (e) => withBusy(e.currentTarget, save, 'Prix enregistrés ✔') }));

  brandSel.addEventListener('change', () => {
    if (!guardLeave()) { brandSel.value = current?.brand_id || ''; return; }
    modelSel.replaceChildren(el('option', { value: '', text: '— Choisir un modèle —' }),
      ...models.filter((m) => m.brand_id === brandSel.value).map((m) => el('option', { value: m.id, text: m.name + (m.is_active ? '' : ' (masqué)') })));
    modelSel.disabled = !brandSel.value;
    current = null; table.replaceChildren(); bar.hidden = true;
  });
  modelSel.addEventListener('change', () => {
    if (!guardLeave()) { modelSel.value = current?.id || ''; return; }
    current = models.find((m) => m.id === modelSel.value) || null;
    loadModel();
  });

  root.replaceChildren(
    el('div', { class: 'picker-row' }, field('1. Marque', brandSel), field('2. Modèle', modelSel)),
    table, bar);
  window.addEventListener('beforeunload', (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });

  function guardLeave() { return !dirty.size || confirm('Vous avez des modifications non enregistrées. Les abandonner ?'); }

  async function loadModel() {
    dirty = new Map(); updateBar();
    if (!current) { table.replaceChildren(); return; }
    table.replaceChildren(el('p', { class: 'muted', text: 'Chargement des prix…' }));
    try {
      existing = new Map((await pricesForModel(current.id)).map((p) => [p.repair_type_id, p]));
      renderTable();
    } catch (e) { console.error(e); table.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement. Réessayez.' })); }
  }

  function renderTable() {
    if (!types.length) { table.replaceChildren(el('p', { class: 'msg', text: 'Ajoutez d’abord des types de réparation dans l’onglet Catalogue.' })); return; }
    table.replaceChildren(el('h2', { class: 'h-sub', text: `Réparations — ${current.name}` }), ...types.map(row));
  }

  function row(rt) {
    const p = existing.get(rt.id);
    const state = { price: p?.price ?? '', time: p?.est_time_minutes ?? '', avail: p ? p.is_available : false };
    const mark = () => {
      const orig = { price: p?.price ?? '', time: p?.est_time_minutes ?? '', avail: p ? p.is_available : false };
      const changed = String(state.price) !== String(orig.price) || String(state.time) !== String(orig.time) || state.avail !== orig.avail;
      if (changed) dirty.set(rt.id, { ...state }); else dirty.delete(rt.id);
      card.classList.toggle('is-dirty', changed);
      updateBar();
    };
    const price = el('input', { class: 'input input--lg', type: 'number', inputmode: 'decimal', min: '0', step: '0.5', placeholder: 'Sur devis', value: state.price, id: `pr-${rt.id}`,
      oninput: (e) => { state.price = e.target.value; if (state.price !== '' && !p) { state.avail = true; sw.input.checked = true; } mark(); } });
    const time = el('input', { class: 'input input--lg', type: 'number', inputmode: 'numeric', min: '1', step: '5', placeholder: 'min', value: state.time, id: `tm-${rt.id}`,
      oninput: (e) => { state.time = e.target.value; mark(); } });
    const sw = { input: el('input', { type: 'checkbox', checked: state.avail, onchange: (e) => { state.avail = e.target.checked; mark(); } }) };
    const card = el('div', { class: 'price-row' },
      el('div', { class: 'price-row__name' }, el('strong', { text: rt.name_fr }), rt.is_active ? null : el('span', { class: 'tag', text: 'type masqué' }),
        el('small', { class: 'muted', text: p ? `Modifié le ${fmtDate(p.updated_at)}` : 'Pas encore de prix' })),
      field('Prix (€)', price),
      field('Durée (minutes)', time),
      el('label', { class: 'switch' }, sw.input, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Affiché sur le site' })));
    return card;
  }

  function updateBar() {
    bar.hidden = !current;
    $('#p-count').textContent = dirty.size ? `${dirty.size} modification${dirty.size > 1 ? 's' : ''} à enregistrer` : 'Aucune modification';
    $('#p-save').disabled = !dirty.size;
  }

  async function save() {
    const rows = [...dirty].map(([rtId, s]) => ({
      model_id: current.id, repair_type_id: rtId, currency: 'EUR',
      price: s.price === '' ? null : Math.max(0, Number(s.price)),
      est_time_minutes: s.time === '' ? null : Math.max(1, Math.round(Number(s.time))),
      is_available: !!s.avail,
    }));
    if (rows.some((r) => r.price !== null && Number.isNaN(r.price))) { toast('Un des prix n’est pas un nombre valide.', 'error'); throw new Error('Prix invalide'); }
    await upsertPrices(rows);
    await loadModel();
  }
}
