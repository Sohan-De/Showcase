/**
 * "Tarifs" page: everything about brands, models, repair types and prices on ONE page.
 *   1. pick a brand (or "Toutes")   2. pick a model   3. edit its repairs and prices.
 * Add / rename / hide / delete happens right where the item is shown.
 */
import { listBrands, listModels, listRepairTypes, pricesForModel, upsertPrices, insertRow, updateRow, deleteRow } from './adminApi.js';
import { uploadImage } from './images.js';
import { icon } from '../icons.js';
import { el, toast, withBusy, fmtDate, field, confirmDialog, formDialog, friendlyError } from './ui.js';

const ICON_CHOICES = [['screen', 'Écran'], ['battery', 'Batterie'], ['plug', 'Connecteur'], ['back', 'Vitre arrière'], ['camera', 'Photo'], ['drop', 'Eau'], ['code', 'Logiciel'], ['wrench', 'Autre']];

const S = { brands: [], models: [], types: [], brandId: 'all', modelId: null, existing: new Map(), dirty: new Map() };
let brandsBox, brandBar, modelsBox, modelBar, repairsBox, saveBar;

const nextOrder = (list) => list.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1;
const brandOf = (id) => S.brands.find((b) => b.id === id);
const modelOf = (id) => S.models.find((m) => m.id === id);
const guardLeave = () => !S.dirty.size || confirm('Vous avez des modifications non enregistrées. Les abandonner ?');

/** Run a write, toast the result, then reload everything. */
async function act(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok, 'success'); await reload(); return r; }
  catch (e) { console.error(e); toast(friendlyError(e), 'error', 7000); }
}

async function reload() {
  [S.brands, S.models, S.types] = await Promise.all([listBrands(), listModels(), listRepairTypes()]);
  if (S.brandId !== 'all' && !brandOf(S.brandId)) S.brandId = 'all';
  if (S.modelId && !modelOf(S.modelId)) { S.modelId = null; S.dirty.clear(); }
  renderBrands(); renderModels(); await renderRepairs();
}

export async function initPrices(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  brandsBox = el('div', { class: 'chips-row', 'aria-label': 'Marques' });
  brandBar = el('div', { class: 'action-bar', hidden: true });
  modelsBox = el('div', { class: 'model-grid' });
  modelBar = el('div', { class: 'action-bar', hidden: true });
  repairsBox = el('div');
  saveBar = el('div', { class: 'savebar', hidden: true },
    el('span', { id: 'p-count' }),
    el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'p-save', text: 'Enregistrer', onclick: (e) => withBusy(e.currentTarget, save, 'Prix enregistrés ✔') }));

  container.replaceChildren(
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '1' }), 'Marque'), brandsBox, brandBar),
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '2' }), 'Modèle'), modelsBox, modelBar),
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '3' }), 'Réparations et prix'), repairsBox),
    saveBar);

  document.addEventListener('click', (e) => document.querySelectorAll('.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu[open]').forEach((m) => { m.open = false; }); });
  window.addEventListener('beforeunload', (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  try { await reload(); } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Impossible de charger les données. Rechargez la page.' })); }
}

// ------------------------------------------------------------------ 1. brands
function renderBrands() {
  const chip = (label, count, id, hidden) => el('button', { class: `chip${hidden ? ' is-off' : ''}`, type: 'button', 'aria-pressed': String(S.brandId === id), onclick: () => selectBrand(id) },
    label, count != null ? el('span', { class: 'chip__n', text: count }) : null, hidden ? el('span', { class: 'tag', text: 'masquée' }) : null);
  brandsBox.replaceChildren(
    chip('Toutes', S.models.length, 'all'),
    ...S.brands.map((b) => chip(b.name, S.models.filter((m) => m.brand_id === b.id).length, b.id, !b.is_active)),
    el('button', { class: 'chip chip--add', type: 'button', text: '+ Ajouter une marque', onclick: addBrand }));

  const b = brandOf(S.brandId);
  brandBar.hidden = !b;
  if (b) brandBar.replaceChildren(
    el('strong', { text: b.name }),
    el('button', { class: 'btn btn--sm', type: 'button', text: 'Renommer', onclick: () => editBrand(b) }),
    el('button', { class: 'btn btn--sm', type: 'button', text: b.is_active ? 'Masquer sur le site' : 'Afficher sur le site', onclick: () => act(() => updateRow('brands', b.id, { is_active: !b.is_active }), b.is_active ? 'Marque masquée' : 'Marque visible') }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Supprimer la marque', onclick: () => deleteBrand(b) }));
}

function selectBrand(id) {
  if (!guardLeave()) return;
  S.dirty.clear(); S.brandId = id; S.modelId = null;
  renderBrands(); renderModels(); renderRepairs();
}

async function addBrand() {
  const v = await formDialog({ title: 'Ajouter une marque', fields: [{ key: 'name', label: 'Nom de la marque', required: true, max: 60, placeholder: 'ex. Nokia' }], submitLabel: 'Ajouter' });
  if (!v) return;
  const row = await act(() => insertRow('brands', { name: v.name, sort_order: nextOrder(S.brands) }), 'Marque ajoutée ✔');
  if (row) selectBrand(row.id);
}
async function editBrand(b) {
  const v = await formDialog({ title: 'Renommer la marque', fields: [{ key: 'name', label: 'Nom', value: b.name, required: true, max: 60 }] });
  if (v) act(() => updateRow('brands', b.id, { name: v.name }), 'Marque renommée ✔');
}
async function deleteBrand(b) {
  const n = S.models.filter((m) => m.brand_id === b.id).length;
  const ok = await confirmDialog({ title: `Supprimer « ${b.name} » ?`, text: `${n ? `Ses ${n} modèle(s) et tous leurs prix seront aussi supprimés. ` : ''}Cette action est définitive. Pour la retirer du site sans rien perdre, utilisez plutôt « Masquer sur le site ».`, confirmLabel: 'Oui, supprimer', danger: true });
  if (ok) { S.brandId = 'all'; act(() => deleteRow('brands', b.id), 'Marque supprimée'); }
}

// ------------------------------------------------------------------ 2. models
function renderModels() {
  const list = S.models.filter((m) => S.brandId === 'all' || m.brand_id === S.brandId);
  modelsBox.replaceChildren(
    ...list.map((m) => el('button', { class: `model-card${m.is_active ? '' : ' is-off'}`, type: 'button', 'aria-pressed': String(S.modelId === m.id), onclick: () => selectModel(m.id) },
      m.image && /^https:\/\//.test(m.image) ? el('img', { src: m.image, alt: '', loading: 'lazy', width: 40, height: 40 }) : null,
      el('span', {}, el('small', { text: S.brandId === 'all' ? (brandOf(m.brand_id)?.name || '') : '' }), el('strong', { text: m.name }), m.is_active ? null : el('em', { text: 'masqué' })))),
    el('button', { class: 'model-card model-card--add', type: 'button', text: '+ Ajouter un modèle', onclick: addModel }));
  if (!list.length) modelsBox.prepend(el('p', { class: 'muted add-hint', text: 'Aucun modèle ici pour le moment.' }));

  const m = modelOf(S.modelId);
  modelBar.hidden = !m;
  if (m) modelBar.replaceChildren(
    el('strong', { text: `${brandOf(m.brand_id)?.name || ''} ${m.name}` }),
    el('button', { class: 'btn btn--sm', type: 'button', text: 'Renommer / image', onclick: () => editModel(m) }),
    el('button', { class: 'btn btn--sm', type: 'button', text: m.is_active ? 'Masquer sur le site' : 'Afficher sur le site', onclick: () => act(() => updateRow('models', m.id, { is_active: !m.is_active }), m.is_active ? 'Modèle masqué' : 'Modèle visible') }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Supprimer le modèle', onclick: () => deleteModel(m) }));
}

function selectModel(id) {
  if (id === S.modelId) return;
  if (!guardLeave()) return;
  S.dirty.clear(); S.modelId = id;
  renderModels(); renderRepairs();
  repairsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const modelFields = (m) => [
  ...(m ? [] : S.brandId === 'all' ? [{ key: 'brand_id', label: 'Marque', type: 'select', options: S.brands.map((b) => [b.id, b.name]), value: S.brands[0]?.id }] : []),
  { key: 'name', label: 'Nom du modèle', value: m?.name || '', required: true, max: 80, placeholder: 'ex. iPhone 15' },
  { key: 'image', label: 'Photo (facultative)', type: 'image', value: m?.image || '', hint: 'JPG, PNG ou WebP. Elle est réduite et stockée dans votre bucket Supabase.' },
];
/** undefined = keep, '' = remove, File = upload to the bucket and use the new public link. */
async function resolveImage(v, current) {
  if (v === undefined) return current ?? null;
  if (v === '') return null;
  return uploadImage(v);
}
async function addModel() {
  if (!S.brands.length) { toast('Ajoutez d’abord une marque.', 'error'); return; }
  const v = await formDialog({ title: 'Ajouter un modèle', fields: modelFields(null), submitLabel: 'Ajouter' });
  if (!v) return;
  const row = await act(async () => insertRow('models', { brand_id: v.brand_id || S.brandId, name: v.name, image: await resolveImage(v.image, null), sort_order: nextOrder(S.models) }), 'Modèle ajouté ✔');
  if (row) { S.brandId = row.brand_id; S.dirty.clear(); S.modelId = null; renderBrands(); selectModel(row.id); }
}
async function editModel(m) {
  const v = await formDialog({ title: 'Modifier le modèle', fields: modelFields(m) });
  if (v) act(async () => updateRow('models', m.id, { name: v.name, image: await resolveImage(v.image, m.image) }), 'Modèle modifié ✔');
}
async function deleteModel(m) {
  const ok = await confirmDialog({ title: `Supprimer « ${m.name} » ?`, text: 'Tous ses prix seront aussi supprimés. Cette action est définitive. Pour le retirer du site sans rien perdre, utilisez plutôt « Masquer sur le site ».', confirmLabel: 'Oui, supprimer', danger: true });
  if (ok) { S.modelId = null; S.dirty.clear(); act(() => deleteRow('models', m.id), 'Modèle supprimé'); }
}

// ------------------------------------------------------------------ 3. repairs + prices
async function renderRepairs() {
  const m = modelOf(S.modelId);
  saveBar.hidden = !m;
  if (!m) {
    repairsBox.replaceChildren(el('p', { class: 'msg', text: 'Choisissez un modèle ci-dessus pour voir et modifier ses prix.' }));
    return;
  }
  repairsBox.replaceChildren(el('p', { class: 'muted', text: 'Chargement des prix…' }));
  try {
    S.existing = new Map((await pricesForModel(m.id)).map((p) => [p.repair_type_id, p]));
  } catch (e) { console.error(e); repairsBox.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement. Réessayez.' })); return; }
  if (S.modelId !== m.id) return; // user already moved on
  S.dirty = new Map(); updateBar();
  const mine = S.types.filter((rt) => S.existing.has(rt.id));
  repairsBox.replaceChildren(
    el('p', { class: 'muted', text: 'Ces réparations appartiennent à ce modèle uniquement. Laissez le prix vide pour afficher « Sur devis ». Utilisez le curseur « Affiché » pour montrer ou cacher une réparation sur le site, et le menu ⋯ pour la modifier ou la retirer.' }),
    ...(mine.length ? mine.map(row) : [el('p', { class: 'msg', text: 'Aucune réparation pour ce modèle. Ajoutez la première ci-dessous.' })]),
    el('button', { class: 'btn', type: 'button', text: '+ Ajouter une réparation à ce modèle', onclick: addType }));
}

const svg = (name, cls = '') => { const t = document.createElement('template'); t.innerHTML = icon(name, cls); return t.content.firstElementChild; };

/** "⋯" menu with the actions of one repair. Closes on outside click / Esc (see initPrices). */
function actionMenu(items) {
  const list = el('div', { class: 'menu__list', role: 'menu' }, items.map(({ label, icon: ic, danger, run }) =>
    el('button', { class: `menu__item${danger ? ' menu__item--danger' : ''}`, type: 'button', role: 'menuitem', onclick: (e) => { e.currentTarget.closest('details').open = false; run(); } }, svg(ic), el('span', { text: label }))));
  return el('details', { class: 'menu' }, el('summary', { class: 'menu__btn', 'aria-label': 'Actions de la réparation', title: 'Actions' }, svg('dots')), list);
}

function row(rt) {
  const p = S.existing.get(rt.id);
  const orig = { price: p?.price ?? '', time: p?.est_time_minutes ?? '', avail: p ? p.is_available : false };
  const state = { ...orig };
  const hint = el('small', { class: 'hint', text: '' });
  const syncHint = () => { hint.textContent = state.price === '' ? 'Affiché « Sur devis » sur le site' : ''; };
  const mark = () => {
    const changed = String(state.price) !== String(orig.price) || String(state.time) !== String(orig.time) || state.avail !== orig.avail;
    if (changed) S.dirty.set(rt.id, { ...state }); else S.dirty.delete(rt.id);
    card.classList.toggle('is-dirty', changed);
    syncHint(); updateBar();
  };
  const sw = el('input', { type: 'checkbox', checked: state.avail, onchange: (e) => { state.avail = e.target.checked; mark(); } });
  const price = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0', step: '0.5', placeholder: '—', value: state.price, id: `pr-${rt.id}`,
    oninput: (e) => { state.price = e.target.value; if (state.price !== '' && !p) { state.avail = true; sw.checked = true; } mark(); } });
  const time = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', step: '5', placeholder: '—', value: state.time, id: `tm-${rt.id}`,
    oninput: (e) => { state.time = e.target.value; mark(); } });
  syncHint();
  const card = el('div', { class: `price-row${rt.is_active ? '' : ' is-off'}` },
    el('div', { class: 'price-row__title' },
      el('span', { class: 'rt-icon' }, svg(rt.icon || 'wrench')),
      el('div', {},
        el('strong', { text: rt.name_fr }),
        el('small', { text: p ? `Modifié le ${fmtDate(p.updated_at)}` : 'Pas encore de prix' })),
      rt.is_active ? null : el('span', { class: 'tag', text: 'type masqué' }),
      el('span', { class: 'dirty-chip', text: 'Non enregistré' })),
    el('div', { class: 'f f--price' }, el('label', { for: price.id, text: 'Prix' }), el('div', { class: 'affix' }, price, el('span', { text: '€' })), hint),
    el('div', { class: 'f f--time' }, el('label', { for: time.id, text: 'Durée' }), el('div', { class: 'affix' }, time, el('span', { text: 'min' }))),
    el('label', { class: 'switch price-row__shown' }, sw, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Affiché' })),
    actionMenu([
      { label: 'Modifier le type de réparation', icon: 'edit', run: () => editType(rt) },
      { label: 'Retirer de ce modèle', icon: 'minus', run: () => removeFromModel(rt) },
      { label: 'Supprimer partout', icon: 'trash', danger: true, run: () => deleteType(rt) },
    ]));
  return card;
}

function updateBar() {
  const c = document.getElementById('p-count'); if (!c) return;
  c.textContent = S.dirty.size ? `${S.dirty.size} modification${S.dirty.size > 1 ? 's' : ''} à enregistrer` : 'Aucune modification';
  document.getElementById('p-save').disabled = !S.dirty.size;
}

async function save() {
  const m = modelOf(S.modelId);
  const rows = [...S.dirty].map(([rtId, s]) => ({
    model_id: m.id, repair_type_id: rtId, currency: 'EUR',
    price: s.price === '' ? null : Math.max(0, Number(s.price)),
    est_time_minutes: s.time === '' ? null : Math.max(1, Math.round(Number(s.time))),
    is_available: !!s.avail,
  }));
  if (rows.some((r) => r.price !== null && Number.isNaN(r.price))) { toast('Un des prix n’est pas un nombre valide.', 'error'); throw new Error('Prix invalide'); }
  await upsertPrices(rows);
  await renderRepairs();
}

// repair types (shared by every model)
const typeFields = (t) => [
  { key: 'name_fr', label: 'Nom en français', value: t?.name_fr || '', required: true, max: 80, placeholder: 'ex. Remplacement écran' },
  { key: 'name_en', label: 'Nom en anglais', value: t?.name_en || '', required: true, max: 80, placeholder: 'ex. Screen replacement' },
  { key: 'icon', label: 'Icône', type: 'select', options: ICON_CHOICES, value: t?.icon || 'wrench' },
  ...(t ? [{ key: 'visible', label: 'Visible sur le site', type: 'select', options: [['1', 'Oui'], ['0', 'Non, masqué pour tous les modèles']], value: t.is_active ? '1' : '0' }] : []),
];
async function addType() {
  const m = modelOf(S.modelId); if (!m) return;
  const free = S.types.filter((rt) => !S.existing.has(rt.id));
  const v = await formDialog({
    title: `Ajouter une réparation à ${m.name}`,
    text: 'Elle apparaîtra uniquement sur ce modèle. Pour proposer la même réparation sur un autre modèle, ouvrez ce modèle et ajoutez-la aussi.',
    fields: [
      { key: 'type', label: 'Réparation', type: 'select', value: free[0]?.id ?? '', options: [...free.map((rt) => [rt.id, rt.name_fr]), ['', '+ Créer un nouveau type de réparation…']] },
      { key: 'name_fr', label: 'Nom en français', required: true, max: 80, placeholder: 'ex. Remplacement écran', showIf: { key: 'type', value: '' } },
      { key: 'name_en', label: 'Nom en anglais', required: true, max: 80, placeholder: 'ex. Screen replacement', showIf: { key: 'type', value: '' } },
      { key: 'icon', label: 'Icône', type: 'select', options: ICON_CHOICES, value: 'wrench', showIf: { key: 'type', value: '' } },
      { key: 'price', label: 'Prix (€) — laisser vide pour « Sur devis »', type: 'number', step: '0.5', placeholder: 'ex. 79' },
      { key: 'time', label: 'Durée (minutes)', type: 'number', step: '5', placeholder: 'ex. 45' },
    ],
    submitLabel: 'Ajouter la réparation',
  });
  if (!v) return;
  await act(async () => {
    let typeId = v.type;
    if (!typeId) typeId = (await insertRow('repair_types', { name_fr: v.name_fr, name_en: v.name_en, icon: v.icon, sort_order: nextOrder(S.types) })).id;
    // the price row is what links a repair to this model
    await upsertPrices([{ model_id: m.id, repair_type_id: typeId, currency: 'EUR', price: v.price, est_time_minutes: v.time == null ? null : Math.max(1, Math.round(v.time)), is_available: true }]);
  }, 'Réparation ajoutée à ce modèle ✔');
}
async function removeFromModel(rt) {
  const m = modelOf(S.modelId); const p = S.existing.get(rt.id); if (!m || !p) return;
  const ok = await confirmDialog({ title: `Retirer « ${rt.name_fr} » de ${m.name} ?`, text: 'Son prix sur ce modèle sera supprimé. Les autres modèles gardent cette réparation.', confirmLabel: 'Oui, retirer', danger: true });
  if (ok) act(() => deleteRow('prices', p.id), 'Retiré de ce modèle');
}
async function editType(t) {
  const v = await formDialog({ title: 'Modifier le type de réparation', text: 'Le changement concerne tous les modèles.', fields: typeFields(t) });
  if (!v) return;
  const { visible, ...rest } = v;
  act(() => updateRow('repair_types', t.id, { ...rest, is_active: visible === '1' }), 'Type modifié ✔');
}
async function deleteType(t) {
  const ok = await confirmDialog({ title: `Supprimer « ${t.name_fr} » ?`, text: 'Ce type de réparation disparaît de TOUS les modèles, avec tous ses prix. Cette action est définitive. Pour le retirer de ce modèle seulement, utilisez « Retirer de ce modèle ».', confirmLabel: 'Oui, supprimer', danger: true });
  if (ok) act(() => deleteRow('repair_types', t.id), 'Type supprimé');
}
