/** Catalogue tab: manage brands, models and repair types (add, rename, hide, delete). */
import { listBrands, listModels, listRepairTypes, insertRow, updateRow, deleteRow } from './adminApi.js';
import { el, toast, confirmDialog, withBusy, field } from './ui.js';

const ICON_CHOICES = [['screen', 'Écran'], ['battery', 'Batterie'], ['plug', 'Connecteur'], ['back', 'Vitre arrière'], ['camera', 'Photo'], ['drop', 'Eau'], ['code', 'Logiciel'], ['wrench', 'Outil']];

/** Entity definitions drive one generic list/editor. */
const ENTITIES = {
  brands: {
    table: 'brands', title: 'Marques', singular: 'la marque', load: () => listBrands(),
    fields: [{ key: 'name', label: 'Nom', required: true, max: 60 }, { key: 'sort_order', label: 'Ordre', type: 'number' }],
    label: (r) => r.name,
    warn: 'Tous ses modèles et leurs prix seront aussi supprimés.',
  },
  models: {
    table: 'models', title: 'Modèles', singular: 'le modèle', load: (ctx) => listModels(ctx.brandId),
    fields: [{ key: 'name', label: 'Nom du modèle', required: true, max: 80 }, { key: 'image', label: 'Image (URL, facultatif)', type: 'url', max: 500 }, { key: 'sort_order', label: 'Ordre', type: 'number' }],
    label: (r) => r.name,
    warn: 'Tous ses prix seront aussi supprimés.',
  },
  repair_types: {
    table: 'repair_types', title: 'Réparations', singular: 'le type de réparation', load: () => listRepairTypes(),
    fields: [{ key: 'name_fr', label: 'Nom (français)', required: true, max: 80 }, { key: 'name_en', label: 'Nom (anglais)', required: true, max: 80 },
      { key: 'icon', label: 'Icône', type: 'select', options: ICON_CHOICES }, { key: 'sort_order', label: 'Ordre', type: 'number' }],
    label: (r) => r.name_fr,
    warn: 'Tous les prix liés à cette réparation seront aussi supprimés.',
  },
};

export async function initCatalog(container) {
  const tabs = el('div', { class: 'subtabs', role: 'tablist' });
  const body = el('div');
  container.replaceChildren(tabs, body);
  const show = (key) => {
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.key === key)));
    renderEntity(body, key);
  };
  Object.entries(ENTITIES).forEach(([key, e]) =>
    tabs.append(el('button', { class: 'subtab', type: 'button', role: 'tab', 'data-key': key, text: e.title, onclick: () => show(key) })));
  show('brands');
}

async function renderEntity(body, key) {
  const E = ENTITIES[key];
  const ctx = { brandId: '', brands: [] };
  body.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  try { ctx.brands = key === 'models' ? await listBrands() : []; } catch (e) { console.error(e); }

  const list = el('div', { class: 'list' });
  const addBox = el('div', { class: 'card add-card' });
  let brandFilter = null;

  if (key === 'models') {
    brandFilter = el('select', { class: 'input input--lg', id: 'm-brand', onchange: (e) => { ctx.brandId = e.target.value; refresh(); } },
      el('option', { value: '', text: 'Toutes les marques' }), ctx.brands.map((b) => el('option', { value: b.id, text: b.name })));
  }

  // --- Add form
  const inputs = {};
  const addFields = E.fields.map((f) => { const i = makeInput(f, ''); inputs[f.key] = i; return field(f.label, i); });
  let addBrandSel;
  if (key === 'models') { addBrandSel = el('select', { class: 'input input--lg', 'aria-label': 'Marque du nouveau modèle' }, ctx.brands.map((b) => el('option', { value: b.id, text: b.name }))); addFields.unshift(field('Marque', addBrandSel)); }
  addBox.append(el('h3', { text: `Ajouter ${E.singular}` }), el('div', { class: 'grid-form' }, addFields),
    el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Ajouter', onclick: (e) => withBusy(e.currentTarget, async () => {
      const row = readInputs(E.fields, inputs);
      if (key === 'models') { if (!addBrandSel.value) throw new Error('Créez d’abord une marque.'); row.brand_id = addBrandSel.value; }
      await insertRow(E.table, row);
      E.fields.forEach((f) => { inputs[f.key].value = f.type === 'number' ? '0' : f.type === 'select' ? inputs[f.key].value : ''; });
      await refresh();
    }, 'Ajouté ✔') }));

  body.replaceChildren(...(brandFilter ? [field('Afficher les modèles de', brandFilter)] : []), addBox, list);
  await refresh();

  async function refresh() {
    list.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
    try {
      const rows = await E.load(ctx);
      if (!rows.length) { list.replaceChildren(el('p', { class: 'msg', text: 'Rien pour le moment. Utilisez le formulaire ci-dessus pour ajouter.' })); return; }
      list.replaceChildren(...rows.map((r) => rowCard(E, r, ctx, refresh)));
    } catch (e) { console.error(e); list.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement.' })); }
  }
}

function makeInput(f, value) {
  if (f.type === 'select') return el('select', { class: 'input input--lg' }, f.options.map(([v, l]) => el('option', { value: v, text: l, ...(v === value ? { selected: true } : {}) })));
  return el('input', { class: 'input input--lg', type: f.type || 'text', value: value ?? (f.type === 'number' ? '0' : ''), maxlength: f.max, ...(f.type === 'number' ? { inputmode: 'numeric', step: '1' } : {}) });
}

function readInputs(fields, inputs) {
  const out = {};
  for (const f of fields) {
    let v = inputs[f.key].value.trim();
    if (f.required && !v) throw new Error(`« ${f.label} » est obligatoire.`);
    if (f.type === 'number') v = Number.parseInt(v || '0', 10) || 0;
    else if (f.type === 'url') { if (v && !/^https?:\/\//i.test(v)) throw new Error('L’adresse de l’image doit commencer par https://'); v = v || null; }
    out[f.key] = v;
  }
  return out;
}

function rowCard(E, r, ctx, refresh) {
  const inputs = {};
  const fields = E.fields.map((f) => { const i = makeInput(f, r[f.key]); inputs[f.key] = i; return field(f.label, i); });
  const active = el('input', { type: 'checkbox', checked: r.is_active });
  const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'Enregistrer', onclick: (e) => withBusy(e.currentTarget, async () => {
    await updateRow(E.table, r.id, { ...readInputs(E.fields, inputs), is_active: active.checked });
    await refresh();
  }, 'Modifié ✔') });
  const delBtn = el('button', { class: 'btn btn--danger', type: 'button', text: 'Supprimer', onclick: async () => {
    const ok = await confirmDialog({ title: `Supprimer « ${E.label(r)} » ?`, text: `${E.warn} Cette action est définitive. Pour simplement cacher cet élément du site, décochez « Visible sur le site ».`, confirmLabel: 'Oui, supprimer', danger: true });
    if (!ok) return;
    try { await deleteRow(E.table, r.id); toast('Supprimé', 'success'); await refresh(); } catch (e) { console.error(e); toast('Suppression impossible : ' + (e.message || e), 'error'); }
  } });
  return el('div', { class: `card row-card${r.is_active ? '' : ' is-hidden'}` },
    el('div', { class: 'grid-form' }, fields),
    el('div', { class: 'row-card__actions' },
      el('label', { class: 'switch' }, active, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Visible sur le site' })),
      el('div', { class: 'btn-row' }, saveBtn, delBtn)));
}
