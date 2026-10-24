/** Messages tab: contact form submissions. */
import { listMessages, updateRow, deleteRow, unreadCount } from './adminApi.js';
import { el, fmtDate, toast, confirmDialog } from './ui.js';

export async function refreshBadge() {
  const badge = document.getElementById('msg-badge');
  try { const n = await unreadCount(); badge.textContent = n; badge.hidden = !n; } catch { badge.hidden = true; }
}

export async function initMessages(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Chargement…' }));
  async function render() {
    let rows;
    try { rows = await listMessages(); } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Erreur de chargement.' })); return; }
    refreshBadge();
    if (!rows.length) { container.replaceChildren(el('p', { class: 'msg', text: 'Aucun message pour le moment.' })); return; }
    container.replaceChildren(...rows.map((m) => el('article', { class: `card msg-card${m.is_read ? '' : ' is-unread'}` },
      el('header', {}, el('strong', { text: m.name }), el('span', { class: 'muted', text: ` · ${fmtDate(m.created_at)}${m.lang ? ' · ' + m.lang.toUpperCase() : ''}` })),
      m.model ? el('p', { class: 'tag', text: `Téléphone : ${m.model}` }) : null,
      el('p', { class: 'msg-body', text: m.message }), // text node: never parsed as HTML
      el('div', { class: 'btn-row' },
        m.phone ? el('a', { class: 'btn btn--primary', href: `tel:${m.phone.replace(/[^\d+]/g, '')}`, text: `Appeler ${m.phone}` }) : null,
        m.email ? el('a', { class: 'btn', href: `mailto:${encodeURIComponent(m.email).replace('%40', '@')}`, text: 'Répondre par e-mail' }) : null,
        el('button', { class: 'btn', type: 'button', text: m.is_read ? 'Marquer non lu' : 'Marquer comme lu', onclick: async () => {
          try { await updateRow('contact_messages', m.id, { is_read: !m.is_read }); render(); } catch (e) { toast('Action impossible.', 'error'); console.error(e); } } }),
        el('button', { class: 'btn btn--danger', type: 'button', text: 'Supprimer', onclick: async () => {
          if (!(await confirmDialog({ title: 'Supprimer ce message ?', text: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true }))) return;
          try { await deleteRow('contact_messages', m.id); render(); } catch (e) { toast('Suppression impossible.', 'error'); console.error(e); } } })))));
  }
  render();
}
