/** Admin data layer (authenticated; every write is checked by RLS via is_admin()). */
import { getClient } from '../client.js';

const PAGE = 1000; // Supabase returns at most 1000 rows per request

async function must(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Fetch every row of a query by paging with range(). `build` must return a fresh query. */
export async function fetchAll(build) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await must(build().range(from, from + PAGE - 1));
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

export const db = () => getClient();

export async function listBrands() { return must((await db()).from('brands').select('*').order('sort_order').order('name')); }
export async function listModels(brandId) {
  let q = (await db()).from('models').select('*').order('sort_order').order('name');
  if (brandId) q = q.eq('brand_id', brandId);
  return must(q);
}
export async function listRepairTypes() { return must((await db()).from('repair_types').select('*').order('sort_order').order('name_fr')); }

export async function pricesForModel(modelId) { return must((await db()).from('prices').select('*').eq('model_id', modelId)); }

export async function upsertPrices(rows) {
  const c = await db();
  for (let i = 0; i < rows.length; i += 200) {
    await must(c.from('prices').upsert(rows.slice(i, i + 200), { onConflict: 'model_id,repair_type_id' }));
  }
}

export async function insertRow(table, row) { return must((await db()).from(table).insert(row).select().single()); }
export async function updateRow(table, id, patch) { return must((await db()).from(table).update(patch).eq('id', id).select().single()); }
export async function deleteRow(table, id) { await must((await db()).from(table).delete().eq('id', id)); }

export async function getSetting(key) {
  const rows = await must((await db()).from('site_settings').select('value').eq('key', key));
  return rows[0]?.value ?? {};
}
export async function saveSetting(key, value) { await must((await db()).from('site_settings').upsert({ key, value })); }

export async function listMessages() { return must((await db()).from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200)); }
export async function unreadCount() {
  const { count, error } = await (await db()).from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_read', false);
  if (error) throw error;
  return count || 0;
}
