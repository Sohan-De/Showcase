/** Tools tab: bulk price change (+X % / +X €) and CSV export / import. */
import { listBrands, listModels, listRepairTypes, fetchAll, db, upsertPrices, insertRow } from './adminApi.js';
import { el, toast, confirmDialog, withBusy, field, slug } from './ui.js';
import { toCSV, parseCSV, download } from './csv.js';
import { imagesCard } from './images.js';

export async function initTools(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  let brands, types;
  try { [brands, types] = await Promise.all([listBrands(), listRepairTypes()]); }
  catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement.' })); return; }
  container.replaceChildren(bulkCard(brands, types), csvCard(brands, types), imagesCard());
}

// ----------------------------------------------------------------- bulk
function bulkCard(brands, types) {
  const typeSel = el('select', { class: 'input input--lg' }, types.map((t) => el('option', { value: t.id, text: t.name_fr })));
  const brandSel = el('select', { class: 'input input--lg' }, el('option', { value: '', text: 'Toutes les marques' }), brands.map((b) => el('option', { value: b.id, text: b.name })));
  const modeSel = el('select', { class: 'input input--lg' }, el('option', { value: 'pct', text: 'En pourcentage (%)' }), el('option', { value: 'eur', text: 'En euros (€)' }));
  const valueIn = el('input', { class: 'input input--lg', type: 'number', step: '0.5', inputmode: 'decimal', placeholder: 'ex. 10 ou -5' });
  const roundCb = el('input', { type: 'checkbox', checked: true });
  const out = el('div', { class: 'preview-box', 'aria-live': 'polite' });

  async function compute() {
    const v = Number(valueIn.value);
    if (valueIn.value === '' || Number.isNaN(v)) throw new Error('Saisissez une valeur (ex. 10 pour +10 %, ou -5 pour −5).');
    const c = await db();
    const rows = await fetchAll(() => {
      let q = c.from('prices').select('id,model_id,repair_type_id,price,currency,est_time_minutes,is_available,models!inner(name,brand_id)').eq('repair_type_id', typeSel.value).not('price', 'is', null).order('id');
      if (brandSel.value) q = q.eq('models.brand_id', brandSel.value);
      return q;
    });
    const changes = rows.map((r) => {
      let np = modeSel.value === 'pct' ? Number(r.price) * (1 + v / 100) : Number(r.price) + v;
      np = roundCb.checked ? Math.round(np) : Math.round(np * 100) / 100;
      return { r, np: Math.max(0, np) };
    }).filter((x) => x.np !== Number(x.r.price));
    return changes;
  }

  const previewBtn = el('button', { class: 'btn btn--lg', type: 'button', text: 'Voir l’aperçu', onclick: (e) => withBusy(e.currentTarget, async () => {
    const ch = await compute();
    out.replaceChildren(ch.length
      ? el('div', {}, el('p', { text: `${ch.length} prix vont changer. Exemples :` }), el('ul', {}, ch.slice(0, 5).map(({ r, np }) => el('li', { text: `${r.models.name} : ${r.price} € → ${np} €` }))))
      : el('p', { text: 'Aucun prix à modifier avec ces réglages.' }));
  }) });

  const applyBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Appliquer à tous les prix', onclick: (e) => withBusy(e.currentTarget, async () => {
    const ch = await compute();
    if (!ch.length) { toast('Aucun prix à modifier.', 'info'); return; }
    const ok = await confirmDialog({ title: `Modifier ${ch.length} prix ?`, text: `Réparation : ${typeSel.selectedOptions[0].text}. ${brandSel.selectedOptions[0].text}. Les anciens prix seront remplacés.`, confirmLabel: 'Oui, appliquer' });
    if (!ok) return;
    await upsertPrices(ch.map(({ r, np }) => ({ model_id: r.model_id, repair_type_id: r.repair_type_id, price: np, currency: r.currency, est_time_minutes: r.est_time_minutes, is_available: r.is_available })));
    out.replaceChildren(el('p', { text: `✔ ${ch.length} prix mis à jour.` }));
  }, 'Prix mis à jour ✔') });

  return el('section', { class: 'card tool' },
    el('h2', { text: 'Changer plusieurs prix d’un coup' }),
    el('p', { class: 'muted', text: 'Par exemple : augmenter de 10 % tous les remplacements d’écran. Les prix « sur devis » ne sont pas touchés.' }),
    el('div', { class: 'grid-form' }, field('Quelle réparation ?', typeSel), field('Quelle marque ?', brandSel), field('Type de changement', modeSel), field('Valeur (négative pour baisser)', valueIn)),
    el('label', { class: 'switch' }, roundCb, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Arrondir à l’euro' })),
    el('div', { class: 'btn-row' }, previewBtn, applyBtn), out);
}

// ----------------------------------------------------------------- CSV
const HEAD = ['Marque', 'Modèle', 'Réparation', 'Prix (€)', 'Durée (min)', 'Affiché (oui/non)'];

function csvCard(brands, types) {
  const status = el('div', { class: 'preview-box', 'aria-live': 'polite' });
  const fileIn = el('input', { type: 'file', accept: '.csv,text/csv', class: 'input input--lg', id: 'csv-file' });
  const createCb = el('input', { type: 'checkbox', checked: true });

  const exportBtn = el('button', { class: 'btn btn--lg', type: 'button', text: 'Télécharger le fichier CSV', onclick: (e) => withBusy(e.currentTarget, async () => {
    const [allBrands, models] = await Promise.all([listBrands(), listModels()]);
    const c = await db();
    const pr = await fetchAll(() => c.from('prices').select('model_id,repair_type_id,price,est_time_minutes,is_available').order('model_id').order('repair_type_id'));
    const map = new Map(pr.map((p) => [`${p.model_id}|${p.repair_type_id}`, p]));
    const bName = new Map(allBrands.map((b) => [b.id, b.name]));
    const rows = [HEAD];
    for (const m of models) for (const t of types) {
      const p = map.get(`${m.id}|${t.id}`);
      rows.push([bName.get(m.brand_id), m.name, t.name_fr, p?.price ?? '', p?.est_time_minutes ?? '', p ? (p.is_available ? 'oui' : 'non') : 'non']);
    }
    download(`prophone-tarifs-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  }, 'Fichier téléchargé ✔') });

  let pending = null;
  const importBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Importer', disabled: true, onclick: (e) => withBusy(e.currentTarget, async () => {
    const plan = pending; if (!plan) return;
    const ok = await confirmDialog({ title: 'Lancer l’import ?', text: `${plan.updates.length} prix seront créés ou modifiés${plan.newModels.size ? `, ${plan.newModels.size} modèle(s) créés` : ''}.`, confirmLabel: 'Oui, importer' });
    if (!ok) return;
    const brandId = new Map(brands.map((b) => [slug(b.name), b.id]));
    for (const name of plan.newBrands) brandId.set(slug(name), (await insertRow('brands', { name })).id);
    const modelId = new Map(plan.existingModels);
    for (const [key, { brand, name }] of plan.newModels) modelId.set(key, (await insertRow('models', { brand_id: brandId.get(slug(brand)), name })).id);
    await upsertPrices(plan.updates.map((u) => ({ model_id: modelId.get(u.modelKey), repair_type_id: u.typeId, price: u.price, est_time_minutes: u.time, is_available: u.avail, currency: 'EUR' })));
    status.replaceChildren(el('p', { text: `✔ Import terminé : ${plan.updates.length} prix.` }));
    pending = null; importBtn.disabled = true; fileIn.value = '';
  }, 'Import terminé ✔') });

  fileIn.addEventListener('change', async () => {
    pending = null; importBtn.disabled = true;
    const f = fileIn.files[0]; if (!f) return;
    if (f.size > 5_000_000) { toast('Fichier trop volumineux.', 'error'); return; }
    try { pending = await buildPlan(parseCSV(await f.text()), brands, types, createCb.checked, status); importBtn.disabled = !pending?.updates.length; }
    catch (e) { console.error(e); status.replaceChildren(el('p', { class: 'msg msg--error', text: e.message })); }
  });
  createCb.addEventListener('change', () => fileIn.dispatchEvent(new Event('change')));

  return el('section', { class: 'card tool' },
    el('h2', { text: 'Exporter / importer en CSV (Excel)' }),
    el('p', { class: 'muted', text: 'Téléchargez la liste complète, modifiez les prix dans Excel ou Google Sheets, puis réimportez-la. Ne changez pas l’orthographe des marques, modèles et réparations. Une case de prix vide = « sur devis » (si le prix existait déjà).' }),
    el('div', { class: 'btn-row' }, exportBtn),
    el('hr'),
    field('Fichier à importer (.csv)', fileIn),
    el('label', { class: 'switch' }, createCb, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: 'Créer les marques et modèles manquants' })),
    el('div', { class: 'btn-row' }, importBtn), status);
}

async function buildPlan(rows, brands, types, create, status) {
  if (rows.length < 2) throw new Error('Le fichier est vide.');
  const header = rows[0].map((h) => slug(h));
  if (!header[0].startsWith('marque') || !header[1].startsWith('mod') || !header[2].startsWith('rep')) throw new Error('Colonnes attendues : Marque ; Modèle ; Réparation ; Prix ; Durée ; Affiché. Utilisez le fichier exporté comme modèle.');

  const models = await listModels();
  const bBySlug = new Map(brands.map((b) => [slug(b.name), b]));
  const mByKey = new Map(models.map((m) => [`${m.brand_id}|${slug(m.name)}`, m.id]));
  const tBySlug = new Map(types.flatMap((t) => [[slug(t.name_fr), t.id], [slug(t.name_en), t.id]]));
  const clean = (s) => String(s ?? '').trim().replace(/^'/, '');

  const plan = { updates: [], newBrands: new Set(), newModels: new Map(), existingModels: new Map(), unknownTypes: new Set(), skipped: 0, invalid: 0 };
  for (const r of rows.slice(1)) {
    const [bn, mn, tn, pr, tm, av] = r.map(clean);
    if (!bn || !mn || !tn) { plan.skipped++; continue; }
    const typeId = tBySlug.get(slug(tn));
    if (!typeId) { plan.unknownTypes.add(tn); continue; }
    const price = pr === '' ? null : Number(pr.replace(',', '.').replace(/[€\s]/g, ''));
    const time = tm === '' ? null : Math.round(Number(tm));
    if ((price !== null && (Number.isNaN(price) || price < 0)) || (time !== null && (Number.isNaN(time) || time < 1))) { plan.invalid++; continue; }

    const brand = bBySlug.get(slug(bn));
    let modelKey;
    if (brand && mByKey.has(`${brand.id}|${slug(mn)}`)) { modelKey = `${brand.id}|${slug(mn)}`; plan.existingModels.set(modelKey, mByKey.get(modelKey)); }
    else if (create) { modelKey = `new|${slug(bn)}|${slug(mn)}`; if (!brand) plan.newBrands.add(bn); plan.newModels.set(modelKey, { brand: bn, name: mn }); }
    else { plan.skipped++; continue; }
    if (price === null && !plan.existingModels.has(modelKey)) { plan.skipped++; continue; } // nothing to create without a price
    plan.updates.push({ modelKey, typeId, price, time, avail: /^(oui|yes|1|true|x)$/i.test(av) || (av === '' && price !== null) });
  }
  const lines = [`${plan.updates.length} ligne(s) prêtes à importer.`];
  if (plan.newBrands.size) lines.push(`${plan.newBrands.size} nouvelle(s) marque(s) : ${[...plan.newBrands].join(', ')}.`);
  if (plan.newModels.size) lines.push(`${plan.newModels.size} nouveau(x) modèle(s) seront créés.`);
  if (plan.unknownTypes.size) lines.push(`Réparations inconnues ignorées : ${[...plan.unknownTypes].join(', ')}.`);
  if (plan.skipped) lines.push(`${plan.skipped} ligne(s) ignorée(s) (incomplètes ou modèle inconnu).`);
  if (plan.invalid) lines.push(`${plan.invalid} ligne(s) avec un prix ou une durée invalide ignorée(s).`);
  status.replaceChildren(el('ul', {}, lines.map((l) => el('li', { text: l }))));
  return plan;
}
