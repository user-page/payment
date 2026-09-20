/**
 * Thanh chọn/sửa buổi nhậu ở đầu tab "Chỉnh sửa".
 *
 * Tên và ngày đi vào bản nháp (phải bấm Lưu). Chọn buổi khác và xoá buổi thì
 * có hiệu lực ngay.
 */
import { byId, armConfirm, el } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { getState, effectiveEvent, editEvent, isDirty } from '../core/store.js';

let actions = {};

export function initEventBar(handlers) {
  actions = handlers;

  byId('eventSelect').addEventListener('change', (e) => {
    const nextId = e.target.value;
    if (isDirty() && !window.confirm('Còn thay đổi chưa lưu. Chuyển sang buổi khác sẽ mất những thay đổi đó. Tiếp tục?')) {
      e.target.value = getState().currentEventId; // trả ô chọn về chỗ cũ
      return;
    }
    actions.onSelectEvent(nextId);
  });

  byId('eventName').addEventListener('input', (e) => editEvent({ name: e.target.value }));
  byId('eventDate').addEventListener('change', (e) => editEvent({ eventDate: e.target.value }));

  armConfirm(byId('deleteEventBtn'), 'Xoá buổi này', 'Bấm lần nữa để xoá', () => actions.onDeleteEvent());
}

export function renderEventBar() {
  const { events, currentEventId, isAdmin, user } = getState();
  const ev = effectiveEvent();

  byId('eventSelect').innerHTML = events
    .map((e) => {
      let label = e.name || 'Buổi chưa đặt tên';
      if (e.event_date) label += ` (${e.event_date})`;
      if (isAdmin && e.owner_id !== user?.id) label += `  — (${e.owner_username || e.owner_email})`;
      return `<option value="${e.id}"${e.id === currentEventId ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');

  const nameInput = byId('eventName');
  const dateInput = byId('eventDate');

  // Không ghi đè khi người dùng đang gõ dở trong ô đó.
  if (document.activeElement !== nameInput) nameInput.value = ev?.name ?? '';
  if (document.activeElement !== dateInput) dateInput.value = ev?.eventDate ?? '';

  byId('deleteEventBtn').disabled = events.length <= 1;

  renderOwnerTag(ev);
}

/** Admin xem buổi của người khác thì cho biết buổi đó của ai. */
function renderOwnerTag(ev) {
  const { isAdmin, user } = getState();
  byId('eventOwnerNote')?.remove();

  if (!ev || !isAdmin || ev.ownerId === user?.id) return;

  const tag = el('div', {
    id: 'eventOwnerNote',
    class: 'event-owner-tag',
    style: { marginTop: '8px' },
    textContent: `Buổi này thuộc tài khoản: ${ev.ownerUsername}`,
  });
  byId('eventName').parentNode.append(tag);
}
