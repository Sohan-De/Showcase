/**
 * "Tarifs" page: everything about brands, models, repair types and prices on ONE page.
 *   1. pick a brand (or "All")   2. pick a model   3. edit its repairs and prices.
 * Add / rename / hide / delete happens right where the item is shown.
 */
import { listBrands, listModels, listRepairTypes, pricesForModel, upsertPrices, insertRow, updateRow, deleteRow } from './adminApi.js';
import { uploadImage } from './images.js';
import { icon } from '../icons.js';
import { el, toast, withBusy, fmtDate, field, confirmDialog, formDialog, friendlyError } from './ui.js';

const ICON_CHOICES = [['screen', 'Screen'], ['battery', 'Battery'], ['plug', 'Port'], ['back', 'Back glass'], ['camera', 'Camera'], ['drop', 'Water'], ['code', 'Software'], ['wrench', 'Other']];

const S = { brands: [], models: [], types: [], brandId: 'all', modelId: null, existing: new Map(), dirty: new Map() };
let brandsBox, brandBar, modelsBox, modelBar, repairsBox, saveBar;

const nextOrder = (list) => list.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1;
const brandOf = (id) => S.brands.find((b) => b.id === id);
const modelOf = (id) => S.models.find((m) => m.id === id);
const guardLeave = () => !S.dirty.size || confirm('You have unsaved changes. Discard them?');

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
  container.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  brandsBox = el('div', { class: 'chips-row', 'aria-label': 'Brands' });
  brandBar = el('div', { class: 'action-bar', hidden: true });
  modelsBox = el('div', { class: 'model-grid' });
  modelBar = el('div', { class: 'action-bar', hidden: true });
  repairsBox = el('div');
  saveBar = el('div', { class: 'savebar', hidden: true },
    el('span', { id: 'p-count' }),
    el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'p-save', text: 'Save', onclick: (e) => withBusy(e.currentTarget, save, 'Prices saved ✔') }));

  container.replaceChildren(
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '1' }), 'Brand'), brandsBox, brandBar),
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '2' }), 'Model'), modelsBox, modelBar),
    el('section', { class: 'step-sec' }, el('h2', { class: 'sec-title' }, el('span', { class: 'sec-no', text: '3' }), 'Repairs and prices'), repairsBox),
    saveBar);

  document.addEventListener('click', (e) => document.querySelectorAll('.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu[open]').forEach((m) => { m.open = false; }); });
  window.addEventListener('beforeunload', (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  try { await reload(); } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Could not load the data. Please reload the page.' })); }
}

// ------------------------------------------------------------------ 1. brands
function renderBrands() {
  const chip = (label, count, id, hidden) => el('button', { class: `chip${hidden ? ' is-off' : ''}`, type: 'button', 'aria-pressed': String(S.brandId === id), onclick: () => selectBrand(id) },
    label, count != null ? el('span', { class: 'chip__n', text: count }) : null, hidden ? el('span', { class: 'tag', text: 'hidden' }) : null);
  brandsBox.replaceChildren(
    chip('All', S.models.length, 'all'),
    ...S.brands.map((b) => chip(b.name, S.models.filter((m) => m.brand_id === b.id).length, b.id, !b.is_active)),
    el('button', { class: 'chip chip--add', type: 'button', text: '+ Add a brand', onclick: addBrand }));

  const b = brandOf(S.brandId);
  brandBar.hidden = !b;
  if (b) brandBar.replaceChildren(
    el('strong', { text: b.name }),
    el('button', { class: 'btn btn--sm', type: 'button', text: 'Rename', onclick: () => editBrand(b) }),
    el('button', { class: 'btn btn--sm', type: 'button', text: b.is_active ? 'Hide on the site' : 'Show on the site', onclick: () => act(() => updateRow('brands', b.id, { is_active: !b.is_active }), b.is_active ? 'Brand hidden' : 'Brand visible') }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Delete brand', onclick: () => deleteBrand(b) }));
}

function selectBrand(id) {
  if (!guardLeave()) return;
  S.dirty.clear(); S.brandId = id; S.modelId = null;
  renderBrands(); renderModels(); renderRepairs();
}

async function addBrand() {
  const v = await formDialog({ title: 'Add a brand', fields: [{ key: 'name', label: 'Brand name', required: true, max: 60, placeholder: 'e.g. Nokia' }], submitLabel: 'Add' });
  if (!v) return;
  const row = await act(() => insertRow('brands', { name: v.name, sort_order: nextOrder(S.brands) }), 'Brand added ✔');
  if (row) selectBrand(row.id);
}
async function editBrand(b) {
  const v = await formDialog({ title: 'Rename brand', fields: [{ key: 'name', label: 'Name', value: b.name, required: true, max: 60 }] });
  if (v) act(() => updateRow('brands', b.id, { name: v.name }), 'Brand renamed ✔');
}
async function deleteBrand(b) {
  const n = S.models.filter((m) => m.brand_id === b.id).length;
  const ok = await confirmDialog({ title: `Delete “${b.name}”?`, text: `${n ? `Its ${n} model(s) and all their prices will also be deleted. ` : ''}This cannot be undone. To remove it from the site without losing anything, use “Hide on the site” instead.`, confirmLabel: 'Yes, delete', danger: true });
  if (ok) { S.brandId = 'all'; act(() => deleteRow('brands', b.id), 'Brand deleted'); }
}

// ------------------------------------------------------------------ 2. models
function renderModels() {
  const list = S.models.filter((m) => S.brandId === 'all' || m.brand_id === S.brandId);
  modelsBox.replaceChildren(
    ...list.map((m) => el('button', { class: `model-card${m.is_active ? '' : ' is-off'}`, type: 'button', 'aria-pressed': String(S.modelId === m.id), onclick: () => selectModel(m.id) },
      m.image && /^https:\/\//.test(m.image) ? el('img', { src: m.image, alt: '', loading: 'lazy', width: 40, height: 40 }) : null,
      el('span', {}, el('small', { text: S.brandId === 'all' ? (brandOf(m.brand_id)?.name || '') : '' }), el('strong', { text: m.name }), m.is_active ? null : el('em', { text: 'hidden' })))),
    el('button', { class: 'model-card model-card--add', type: 'button', text: '+ Add a model', onclick: addModel }));
  if (!list.length) modelsBox.prepend(el('p', { class: 'muted add-hint', text: 'No models here yet.' }));

  const m = modelOf(S.modelId);
  modelBar.hidden = !m;
  if (m) modelBar.replaceChildren(
    el('strong', { text: `${brandOf(m.brand_id)?.name || ''} ${m.name}` }),
    el('button', { class: 'btn btn--sm', type: 'button', text: 'Rename / image', onclick: () => editModel(m) }),
    el('button', { class: 'btn btn--sm', type: 'button', text: m.is_active ? 'Hide on the site' : 'Show on the site', onclick: () => act(() => updateRow('models', m.id, { is_active: !m.is_active }), m.is_active ? 'Model hidden' : 'Model visible') }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Delete model', onclick: () => deleteModel(m) }));
}

function selectModel(id) {
  if (id === S.modelId) return;
  if (!guardLeave()) return;
  S.dirty.clear(); S.modelId = id;
  renderModels(); renderRepairs();
  repairsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const modelFields = (m) => [
  ...(m ? [] : S.brandId === 'all' ? [{ key: 'brand_id', label: 'Brand', type: 'select', options: S.brands.map((b) => [b.id, b.name]), value: S.brands[0]?.id }] : []),
  { key: 'name', label: 'Model name', value: m?.name || '', required: true, max: 80, placeholder: 'e.g. iPhone 15' },
  { key: 'image', label: 'Picture (optional)', type: 'image', value: m?.image || '', hint: 'JPG, PNG or WebP. It is resized and stored in your Supabase bucket.' },
];
/** undefined = keep, '' = remove, File = upload to the bucket and use the new public link. */
async function resolveImage(v, current) {
  if (v === undefined) return current ?? null;
  if (v === '') return null;
  return uploadImage(v);
}
async function addModel() {
  if (!S.brands.length) { toast('Add a brand first.', 'error'); return; }
  const v = await formDialog({ title: 'Add a model', fields: modelFields(null), submitLabel: 'Add' });
  if (!v) return;
  const row = await act(async () => insertRow('models', { brand_id: v.brand_id || S.brandId, name: v.name, image: await resolveImage(v.image, null), sort_order: nextOrder(S.models) }), 'Model added ✔');
  if (row) { S.brandId = row.brand_id; S.dirty.clear(); S.modelId = null; renderBrands(); selectModel(row.id); }
}
async function editModel(m) {
  const v = await formDialog({ title: 'Edit model', fields: modelFields(m) });
  if (v) act(async () => updateRow('models', m.id, { name: v.name, image: await resolveImage(v.image, m.image) }), 'Model updated ✔');
}
async function deleteModel(m) {
  const ok = await confirmDialog({ title: `Delete “${m.name}”?`, text: 'All its prices will also be deleted. This cannot be undone. To remove it from the site without losing anything, use “Hide on the site” instead.', confirmLabel: 'Yes, delete', danger: true });
  if (ok) { S.modelId = null; S.dirty.clear(); act(() => deleteRow('models', m.id), 'Model deleted'); }
}

// ------------------------------------------------------------------ 3. repairs + prices
async function renderRepairs() {
  const m = modelOf(S.modelId);
  saveBar.hidden = !m;
  if (!m) {
    repairsBox.replaceChildren(el('p', { class: 'msg', text: 'Pick a model above to see and edit its prices.' }));
    return;
  }
  repairsBox.replaceChildren(el('p', { class: 'muted', text: 'Loading prices…' }));
  try {
    S.existing = new Map((await pricesForModel(m.id)).map((p) => [p.repair_type_id, p]));
  } catch (e) { console.error(e); repairsBox.replaceChildren(el('p', { class: 'msg msg--error', text: 'Loading error. Please try again.' })); return; }
  if (S.modelId !== m.id) return; // user already moved on
  S.dirty = new Map(); updateBar();
  const mine = S.types.filter((rt) => S.existing.has(rt.id));
  repairsBox.replaceChildren(
    el('p', { class: 'muted', text: 'These repairs belong to this model only. Leave the price empty to show “On request”. Use the “Shown” switch to show or hide a repair on the site, and the ⋯ menu to edit or remove it.' }),
    ...(mine.length ? mine.map(row) : [el('p', { class: 'msg', text: 'No repairs for this model yet. Add the first one below.' })]),
    el('button', { class: 'btn', type: 'button', text: '+ Add a repair to this model', onclick: addType }));
}

const svg = (name, cls = '') => { const t = document.createElement('template'); t.innerHTML = icon(name, cls); return t.content.firstElementChild; };

/** "⋯" menu with the actions of one repair. Closes on outside click / Esc (see initPrices). */
function actionMenu(items) {
  const list = el('div', { class: 'menu__list', role: 'menu' }, items.map(({ label, icon: ic, danger, run }) =>
    el('button', { class: `menu__item${danger ? ' menu__item--danger' : ''}`, type: 'button', role: 'menuitem', onclick: (e) => { e.currentTarget.closest('details').open = false; run(); } }, svg(ic), el('span', { text: label }))));
  return el('details', { class: 'menu' }, el('summary', { class: 'menu__btn', 'aria-label': 'Repair actions', title: 'Actions' }, svg('dots')), list);
}

function row(rt) {
  const p = S.existing.get(rt.id);
  const orig = { price: p?.price ?? '', time: p?.est_time_minutes ?? '', avail: p ? p.is_available : false };
  const state = { ...orig };
  const hint = el('small', { class: 'hint', text: '' });
  const syncHint = () => { hint.textContent = state.price === '' ? 'Shown as “On request” on the site' : ''; };
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
        el('small', { text: p ? `Updated ${fmtDate(p.updated_at)}` : 'No price yet' })),
      rt.is_active ? null : el('span', { class: 'tag', text: 'type hidden' }),
      el('span', { class: 'dirty-chip', text: 'Unsaved' })),
    el('div', { class: 'f f--price' }, el('label', { for: price.id, text: 'Price' }), el('div', { class: 'affix' }, price, el('span', { text: '€' })), hint),
    el('div', { class: 'f f--time' }, el('label', { for: time.id, text: 'Time' }), el('div', { class: 'affix' }, time, el('span', { text: 'min' }))),
    el('label', { class: 'switch price-row__shown' }, sw, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Shown' })),
    actionMenu([
      { label: 'Edit repair type', icon: 'edit', run: () => editType(rt) },
      { label: 'Remove from this model', icon: 'minus', run: () => removeFromModel(rt) },
      { label: 'Delete everywhere', icon: 'trash', danger: true, run: () => deleteType(rt) },
    ]));
  return card;
}

function updateBar() {
  const c = document.getElementById('p-count'); if (!c) return;
  c.textContent = S.dirty.size ? `${S.dirty.size} change${S.dirty.size > 1 ? 's' : ''} to save` : 'No changes';
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
  if (rows.some((r) => r.price !== null && Number.isNaN(r.price))) { toast('One of the prices is not a valid number.', 'error'); throw new Error('Invalid price'); }
  await upsertPrices(rows);
  await renderRepairs();
}

// repair types (shared by every model)
const typeFields = (t) => [
  { key: 'name_fr', label: 'Name in French', value: t?.name_fr || '', required: true, max: 80, placeholder: 'e.g. Remplacement écran' },
  { key: 'name_en', label: 'Name in English', value: t?.name_en || '', required: true, max: 80, placeholder: 'e.g. Screen replacement' },
  { key: 'icon', label: 'Icon', type: 'select', options: ICON_CHOICES, value: t?.icon || 'wrench' },
  ...(t ? [{ key: 'visible', label: 'Visible on the site', type: 'select', options: [['1', 'Yes'], ['0', 'No, hidden for all models']], value: t.is_active ? '1' : '0' }] : []),
];
async function addType() {
  const m = modelOf(S.modelId); if (!m) return;
  const free = S.types.filter((rt) => !S.existing.has(rt.id));
  const v = await formDialog({
    title: `Add a repair to ${m.name}`,
    text: 'It will only appear on this model. To offer the same repair on another model, open that model and add it there too.',
    fields: [
      { key: 'type', label: 'Repair', type: 'select', value: free[0]?.id ?? '', options: [...free.map((rt) => [rt.id, rt.name_fr]), ['', '+ Create a new repair type…']] },
      { key: 'name_fr', label: 'Name in French', required: true, max: 80, placeholder: 'e.g. Remplacement écran', showIf: { key: 'type', value: '' } },
      { key: 'name_en', label: 'Name in English', required: true, max: 80, placeholder: 'e.g. Screen replacement', showIf: { key: 'type', value: '' } },
      { key: 'icon', label: 'Icon', type: 'select', options: ICON_CHOICES, value: 'wrench', showIf: { key: 'type', value: '' } },
      { key: 'price', label: 'Price (€) — leave empty for “On request”', type: 'number', step: '0.5', placeholder: 'e.g. 79' },
      { key: 'time', label: 'Time (minutes)', type: 'number', step: '5', placeholder: 'e.g. 45' },
    ],
    submitLabel: 'Add repair',
  });
  if (!v) return;
  await act(async () => {
    let typeId = v.type;
    if (!typeId) typeId = (await insertRow('repair_types', { name_fr: v.name_fr, name_en: v.name_en, icon: v.icon, sort_order: nextOrder(S.types) })).id;
    // the price row is what links a repair to this model
    await upsertPrices([{ model_id: m.id, repair_type_id: typeId, currency: 'EUR', price: v.price, est_time_minutes: v.time == null ? null : Math.max(1, Math.round(v.time)), is_available: true }]);
  }, 'Repair added to this model ✔');
}
async function removeFromModel(rt) {
  const m = modelOf(S.modelId); const p = S.existing.get(rt.id); if (!m || !p) return;
  const ok = await confirmDialog({ title: `Remove “${rt.name_fr}” from ${m.name}?`, text: 'Its price on this model is deleted. Other models keep this repair.', confirmLabel: 'Yes, remove', danger: true });
  if (ok) act(() => deleteRow('prices', p.id), 'Removed from this model');
}
async function editType(t) {
  const v = await formDialog({ title: 'Edit repair type', text: 'The change applies to every model.', fields: typeFields(t) });
  if (!v) return;
  const { visible, ...rest } = v;
  act(() => updateRow('repair_types', t.id, { ...rest, is_active: visible === '1' }), 'Type updated ✔');
}
async function deleteType(t) {
  const ok = await confirmDialog({ title: `Delete “${t.name_fr}”?`, text: 'This repair type disappears from EVERY model, with all its prices. This cannot be undone. To remove it from this model only, use “Remove from this model”.', confirmLabel: 'Yes, delete', danger: true });
  if (ok) act(() => deleteRow('repair_types', t.id), 'Type deleted');
}
