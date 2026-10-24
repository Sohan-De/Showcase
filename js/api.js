/** Public (read-only + contact insert) data access. RLS enforces what is visible. */
import { getClient } from './client.js';

async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getBrands() {
  const db = await getClient();
  return run(db.from('brands').select('id,name,sort_order').order('sort_order').order('name'));
}

export async function getModels() {
  const db = await getClient();
  return run(db.from('models').select('id,brand_id,name,image,sort_order').order('sort_order').order('name'));
}

/** All visible repairs for one model, joined with repair type labels. */
export async function getPricesForModel(modelId) {
  const db = await getClient();
  const rows = await run(
    db
      .from('prices')
      .select('id,price,currency,est_time_minutes,updated_at,repair_types!inner(id,name_fr,name_en,icon,sort_order,is_active)')
      .eq('model_id', modelId),
  );
  return rows.sort((a, b) => a.repair_types.sort_order - b.repair_types.sort_order);
}

/** Cheapest visible price per repair type (for the home page preview). */
export async function getPricePreview() {
  const db = await getClient();
  const rows = await run(
    db
      .from('prices')
      .select('price,repair_types!inner(id,name_fr,name_en,icon,sort_order)')
      .not('price', 'is', null),
  );
  const best = new Map();
  for (const r of rows) {
    if (r.price == null) continue;
    const id = r.repair_types.id;
    if (!best.has(id) || r.price < best.get(id).price) best.set(id, { price: r.price, type: r.repair_types });
  }
  return [...best.values()].sort((a, b) => a.type.sort_order - b.type.sort_order);
}

export async function getSettings() {
  const db = await getClient();
  const rows = await run(db.from('site_settings').select('key,value'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function sendContact(payload) {
  const db = await getClient();
  // No .select(): anonymous visitors may insert but never read messages back.
  const { error } = await db.from('contact_messages').insert(payload);
  if (error) throw error;
}
