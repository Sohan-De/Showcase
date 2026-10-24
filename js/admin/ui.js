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
    const dlg = el('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      el('h2', { id: 'dlg-title', text: title }),
      el('p', { text }),
      el('div', { class: 'dialog__actions' },
        el('button', { class: 'btn btn--lg', type: 'button', text: 'Annuler', onclick: () => dlg.close('no') }),
        el('button', { class: `btn btn--lg ${danger ? 'btn--danger-solid' : 'btn--primary'}`, type: 'button', text: confirmLabel, onclick: () => dlg.close('yes') })));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
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
