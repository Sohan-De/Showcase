/**
 * Admin UI helpers. Rule of thumb: user/DB content is ONLY inserted via
 * textContent / value / setAttribute (see `el`), never through innerHTML.
 */

/** Create an element. Children can be nodes or strings (strings become text nodes). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Toast notification (success | error | info). */
export function toast(text, type = 'success', ms = 4200) {
  let box = $('.toasts');
  if (!box) { box = el('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const node = el('div', { class: 'toast', 'data-type': type, role: type === 'error' ? 'alert' : 'status', text });
  box.append(node);
  setTimeout(() => node.remove(), ms);
}

/** Confirmation dialog (promise<boolean>). Uses the native <dialog> element. */
export function confirmDialog({ title, text, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    // Resolve straight from the click (not only from the async 'close' event); Esc still counts as "no".
    const finish = (ok) => { if (done) return; done = true; resolve(ok); dlg.close(); dlg.remove(); };
    const dlg = el('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      el('h2', { id: 'dlg-title', text: title }),
      el('p', { text }),
      el('div', { class: 'dialog__actions' },
        el('button', { class: 'btn btn--lg', type: 'button', text: 'Annuler', onclick: () => finish(false) }),
        el('button', { class: `btn btn--lg ${danger ? 'btn--danger-solid' : 'btn--primary'}`, type: 'button', text: confirmLabel, onclick: () => finish(true) })));
    dlg.addEventListener('close', () => finish(false));
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Small form in a dialog (add / rename). fields: [{ key, label, value, type: text|url|select, options, required, max, hint }]
 * Resolves with { key: value } or null when cancelled.
 */
export function formDialog({ title, text, fields, submitLabel = 'Enregistrer' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); dlg.close(); dlg.remove(); };
    const inputs = {};
    const wrappers = {};
    const nodes = fields.map((f) => {
      if (f.type === 'image') {
        let removed = false;
        const fileIn = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'input input--lg', id: `f-${f.key}` });
        const prev = el('img', { class: 'img-preview', alt: '', hidden: !f.value, ...(f.value ? { src: f.value } : {}) });
        const rm = el('button', { class: 'link-btn link-btn--danger', type: 'button', text: 'Supprimer l’image', hidden: !f.value, onclick: () => { removed = true; prev.hidden = true; rm.hidden = true; fileIn.value = ''; } });
        fileIn.addEventListener('change', () => { const file = fileIn.files[0]; if (file) { removed = false; prev.src = URL.createObjectURL(file); prev.hidden = false; rm.hidden = false; } });
        // result: File = new picture, '' = removed, undefined = unchanged
        inputs[f.key] = { image: true, result: () => fileIn.files[0] || (removed ? '' : undefined), focus() {}, setAttribute() {} };
        return el('div', { class: 'field' }, el('label', { for: fileIn.id, text: f.label }), prev, fileIn, rm, f.hint ? el('span', { class: 'hint', text: f.hint }) : null);
      }
      const input = f.type === 'select'
        ? el('select', { class: 'input input--lg' }, f.options.map(([v, l]) => el('option', { value: v, text: l, ...(String(v) === String(f.value) ? { selected: true } : {}) })))
        : f.type === 'number'
          ? el('input', { class: 'input input--lg', type: 'number', inputmode: 'decimal', min: '0', step: f.step || '1', value: f.value ?? '', ...(f.placeholder ? { placeholder: f.placeholder } : {}) })
          : el('input', { class: 'input input--lg', type: f.type === 'url' ? 'url' : 'text', value: f.value ?? '', maxlength: f.max || 100, autocomplete: 'off', ...(f.placeholder ? { placeholder: f.placeholder } : {}) });
      inputs[f.key] = input;
      const node = field(f.label, input, f.hint);
      wrappers[f.key] = node;
      return node;
    });
    // fields with showIf: { key, value } only appear (and are only validated) while that select has that value
    const isShown = (f) => !f.showIf || String(inputs[f.showIf.key].value) === String(f.showIf.value);
    const refresh = () => fields.forEach((f) => { if (f.showIf && wrappers[f.key]) wrappers[f.key].hidden = !isShown(f); });
    fields.forEach((f) => { if (f.showIf) inputs[f.showIf.key].addEventListener('change', refresh); });
    queueMicrotask(refresh);
    const form = el('form', { class: 'dialog__form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        if (!isShown(f)) continue;
        if (inputs[f.key].image) { out[f.key] = inputs[f.key].result(); continue; }
        const v = inputs[f.key].value.trim();
        if (f.required && !v) { inputs[f.key].setAttribute('aria-invalid', 'true'); inputs[f.key].focus(); return; }
        if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) { toast('Le lien doit commencer par https://', 'error'); inputs[f.key].focus(); return; }
        if (f.type === 'number') {
          const n = v === '' ? null : Number(v);
          if (n !== null && (Number.isNaN(n) || n < 0)) { toast(`${f.label} : saisissez un nombre valide.`, 'error'); inputs[f.key].focus(); return; }
          out[f.key] = n; continue;
        }
        out[f.key] = f.type === 'url' ? (v || null) : v;
      }
      finish(out);
    } },
      el('h2', { id: 'dlg-title', text: title }), text ? el('p', { class: 'muted', text }) : null, ...nodes,
      el('div', { class: 'dialog__actions' },
        el('button', { class: 'btn btn--lg', type: 'button', text: 'Annuler', onclick: () => finish(null) }),
        el('button', { class: 'btn btn--lg btn--primary', type: 'submit', text: submitLabel })));
    const dlg = el('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' }, form);
    dlg.addEventListener('close', () => finish(null));
    document.body.append(dlg);
    dlg.showModal();
    form.querySelector('input,select')?.focus();
  });
}

/** Run an async action on a button with a busy state + toast on failure. */
export async function withBusy(btn, fn, okMessage) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Un instant…';
  try {
    const result = await fn();
    if (okMessage) toast(okMessage, 'success');
    return result;
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), 'error', 7000);
    return undefined;
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

export function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/row-level security|permission denied|JWT/i.test(msg)) return 'Action refusée : reconnectez-vous ou vérifiez que votre compte est bien administrateur.';
  if (/duplicate key|unique/i.test(msg)) return 'Ce nom existe déjà.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Pas de connexion à internet. Réessayez.';
  return `Une erreur est survenue : ${msg}`;
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : '—');
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A labelled field wrapper used across admin forms. */
export function field(label, input, hint) {
  const id = input.id || (input.id = `f${Math.random().toString(36).slice(2, 8)}`);
  return el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
}

/** Big on/off switch (checkbox underneath, keyboard accessible). */
export function toggle(label, checked, onchange) {
  const input = el('input', { type: 'checkbox', checked, onchange });
  return { input, node: el('label', { class: 'switch' }, input, el('span', { class: 'switch__ui', 'aria-hidden': 'true' }), el('span', { text: label })) };
}
