/**
 * Outils > Images: upload pictures to the Supabase Storage bucket "site-images",
 * copy their public link, delete them. Images are resized and converted to WebP in the
 * browser first, so the owner can drop a phone photo straight in.
 */
import { db } from './adminApi.js';
import { el, toast, confirmDialog, withBusy, field } from './ui.js';

const BUCKET = 'site-images';
const FOLDER = 'uploads';
const MAX_SIDE = 1600;       // px
const MAX_INPUT = 15_000_000; // bytes read from the owner's phone/computer
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = async () => (await db()).storage.from(BUCKET);

/** Resize (keeping ratio) and convert to WebP. Falls back to the original file if the browser can't. */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * r), height: Math.round(bmp.height * r) });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.82));
  return blob && blob.type === 'image/webp' ? { blob, type: 'image/webp', ext: 'webp' } : { blob: file, type: file.type, ext: file.type.split('/')[1].replace('jpeg', 'jpg') };
}

const safeName = (n) => n.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

/** Validate, shrink to WebP, store in the "site-images" bucket and return the public URL. */
export async function uploadImage(file) {
  if (!OK_TYPES.includes(file.type)) throw new Error('Accepted formats: JPG, PNG or WebP.');
  if (file.size > MAX_INPUT) throw new Error('Image too large (15 MB maximum).');
  const { blob, type, ext } = await prepare(file);
  if (blob.size > 2_097_152) throw new Error('Image still too large after compression (2 MB maximum).');
  const path = `${FOLDER}/${Date.now()}-${safeName(file.name)}.${ext}`;
  const s = await storage();
  const { error } = await s.upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(/bucket not found|not found/i.test(error.message) ? 'The image bucket does not exist yet: run storage.sql in Supabase.' : error.message);
  return s.getPublicUrl(path).data.publicUrl;
}

export function imagesCard() {
  const grid = el('div', { class: 'img-grid', 'aria-live': 'polite' });
  const fileIn = el('input', { type: 'file', accept: OK_TYPES.join(','), class: 'input input--lg', id: 'img-file' });

  async function refresh() {
    grid.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
    try {
      const s = await storage();
      const { data, error } = await s.list(FOLDER, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const files = (data || []).filter((f) => f.name && f.id);
      if (!files.length) { grid.replaceChildren(el('p', { class: 'msg', text: 'No images yet.' })); return; }
      grid.replaceChildren(...files.map((f) => {
        const path = `${FOLDER}/${f.name}`;
        const url = s.getPublicUrl(path).data.publicUrl;
        return el('figure', { class: 'img-item' },
          el('img', { src: url, alt: f.name, loading: 'lazy', width: 160, height: 120 }),
          el('figcaption', { text: f.name }),
          el('div', { class: 'btn-row' },
            el('button', { class: 'btn btn--sm', type: 'button', text: 'Copy link', onclick: async () => {
              try { await navigator.clipboard.writeText(url); toast('Link copied ✔'); } catch { prompt('Copy this link:', url); } } }),
            el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Delete', onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete this image?', text: 'If it is used on a model, it will no longer show.', confirmLabel: 'Delete', danger: true }))) return;
              const { error: e } = await s.remove([path]);
              if (e) { console.error(e); toast('Could not delete: ' + e.message, 'error'); return; }
              toast('Image deleted'); refresh(); } })));
      }));
    } catch (e) {
      console.error(e);
      grid.replaceChildren(el('p', { class: 'msg msg--error', text: /not found|bucket/i.test(e.message || '') ? 'The image bucket does not exist yet: run storage.sql in Supabase.' : 'Could not load the images.' }));
    }
  }

  const upload = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Upload image', onclick: (e) => withBusy(e.currentTarget, async () => {
    const file = fileIn.files[0];
    if (!file) throw new Error('Choose an image first.');
    if (!OK_TYPES.includes(file.type)) throw new Error('Accepted formats: JPG, PNG or WebP.');
    if (file.size > MAX_INPUT) throw new Error('Image too large (15 MB maximum).');
    const { blob, type, ext } = await prepare(file);
    if (blob.size > 2_097_152) throw new Error('Image still too large after compression (2 MB maximum).');
    const path = `${FOLDER}/${Date.now()}-${safeName(file.name)}.${ext}`;
    const s = await storage();
    const { error } = await s.upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    fileIn.value = '';
    await refresh();
  }, 'Image uploaded ✔') });

  refresh();
  return el('section', { class: 'card tool' },
    el('h2', { text: 'Images' }),
    el('p', { class: 'muted', text: 'Upload a photo (JPG, PNG or WebP). It is resized automatically. Then copy its link to use it, for example in a model’s “Rename / image” dialog.' }),
    field('Choose an image', fileIn),
    el('div', { class: 'btn-row' }, upload),
    el('hr'),
    grid);
}
