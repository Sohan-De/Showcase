/** Messages tab: contact form submissions. */
import { listMessages, updateRow, deleteRow, unreadCount } from './adminApi.js';
import { el, fmtDate, toast, confirmDialog } from './ui.js';

export async function refreshBadge() {
  const badge = document.getElementById('msg-badge');
  try { const n = await unreadCount(); badge.textContent = n; badge.hidden = !n; } catch { badge.hidden = true; }
}

export async function initMessages(container) {
  container.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  async function render() {
    let rows;
    try { rows = await listMessages(); } catch (e) { console.error(e); container.replaceChildren(el('p', { class: 'msg msg--error', text: 'Loading error.' })); return; }
    refreshBadge();
    if (!rows.length) { container.replaceChildren(el('p', { class: 'msg', text: 'No messages yet.' })); return; }
    container.replaceChildren(...rows.map((m) => el('article', { class: `card msg-card${m.is_read ? '' : ' is-unread'}` },
      el('header', {}, el('strong', { text: m.name }), el('span', { class: 'muted', text: ` · ${fmtDate(m.created_at)}${m.lang ? ' · ' + m.lang.toUpperCase() : ''}` })),
      m.model ? el('p', { class: 'tag', text: `Phone: ${m.model}` }) : null,
      el('p', { class: 'msg-body', text: m.message }), // text node: never parsed as HTML
      el('div', { class: 'btn-row' },
        m.phone ? el('a', { class: 'btn btn--primary', href: `tel:${m.phone.replace(/[^\d+]/g, '')}`, text: `Call ${m.phone}` }) : null,
        m.email ? el('a', { class: 'btn', href: `mailto:${encodeURIComponent(m.email).replace('%40', '@')}`, text: 'Reply by email' }) : null,
        el('button', { class: 'btn', type: 'button', text: m.is_read ? 'Mark as unread' : 'Mark as read', onclick: async () => {
          try { await updateRow('contact_messages', m.id, { is_read: !m.is_read }); render(); } catch (e) { toast('Action failed.', 'error'); console.error(e); } } }),
        el('button', { class: 'btn btn--danger', type: 'button', text: 'Delete', onclick: async () => {
          if (!(await confirmDialog({ title: 'Delete this message?', text: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
          try { await deleteRow('contact_messages', m.id); render(); } catch (e) { toast('Could not delete.', 'error'); console.error(e); } } })))));
  }
  render();
}
