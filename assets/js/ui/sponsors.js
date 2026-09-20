/**
 * Khoản tài trợ / bao thêm.
 *
 * Toàn bộ thao tác ở đây ghi ngay (thêm, xoá, bật/tắt hai nhãn trạng thái) —
 * chúng là hành động dứt khoát chứ không phải gõ dở một ô nhập.
 */
import { byId, el } from '../utils/dom.js';
import { fmtNum, parseMoney, escapeHtml } from '../utils/format.js';
import { effectiveEvent } from '../core/store.js';

let actions = {};

export function initSponsors(handlers) {
  actions = handlers;

  // Chọn người tham gia thì điền sẵn tên cho đỡ gõ.
  byId('newSponsorPersonId').addEventListener('change', (e) => {
    const ev = effectiveEvent();
    const nameInput = byId('newSponsorName');
    if (!ev || !e.target.value || nameInput.value.trim()) return;
    const person = ev.people.find((p) => p.id === e.target.value);
    if (person) nameInput.value = person.name;
  });

  byId('addSponsorForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const ev = effectiveEvent();
    const personId = byId('newSponsorPersonId').value || null;
    let ten = byId('newSponsorName').value.trim();

    if (!ten && personId) {
      ten = ev?.people.find((p) => p.id === personId)?.name || '';
    }

    const soTien = parseMoney(byId('newSponsorAmount').value);
    if (!ten || !soTien) return;

    await actions.onAddSponsor({
      ten,
      soTien,
      ghiChu: byId('newSponsorNote').value.trim(),
      personId,
      stillSplit: byId('newSponsorStillSplit').checked,
      isPaid: byId('newSponsorPaid').checked,
    });

    byId('newSponsorName').value = '';
    byId('newSponsorAmount').value = '';
    byId('newSponsorNote').value = '';
    byId('newSponsorPersonId').value = '';
    byId('newSponsorStillSplit').checked = true;
    byId('newSponsorPaid').checked = false;
  });
}

export function renderSponsors() {
  const ev = effectiveEvent();
  const list = byId('sponsorsList');
  list.innerHTML = '';
  if (!ev) return;

  if (!ev.sponsors.length) {
    list.append(
      el('div', {
        class: 'empty-state',
        textContent:
          'Chưa có ai tài trợ/bao thêm. Nếu có (VD: sếp cho thêm tiền), thêm ở dưới để trừ vào phần mọi người phải trả.',
      })
    );
    return;
  }

  for (const sp of ev.sponsors) list.append(sponsorRow(ev, sp));
}

function sponsorRow(ev, sp) {
  const linkedPerson = sp.personId ? ev.people.find((p) => p.id === sp.personId) : null;

  const who = el('span', { class: 'who' });
  who.innerHTML =
    `<strong>${escapeHtml(sp.ten)}</strong>` +
    (sp.ghiChu ? ` <span class="sponsor-note">${escapeHtml(sp.ghiChu)}</span>` : '') +
    (linkedPerson ? ' <span class="sponsor-link-badge">Người tham gia</span>' : '');

  const row = el('div', { class: 'sponsor-row' }, [
    who,
    el('span', { class: 'amount', textContent: `+${fmtNum(sp.soTien)}` }),
  ]);

  // Đã đưa tiền tài trợ chưa — ảnh hưởng trực tiếp tới số tiền phải trả.
  row.append(
    el('button', {
      type: 'button',
      class: `sponsor-paid-toggle${sp.isPaid ? ' is-paid' : ''}`,
      textContent: sp.isPaid ? 'Đã đưa tiền' : 'Chưa đưa tiền',
      title: `Bấm để đánh dấu người này ${sp.isPaid ? 'chưa' : 'đã'} đưa tiền tài trợ`,
      onclick: () => actions.onToggleSponsorPaid(sp.id, !sp.isPaid),
    })
  );

  // Chỉ có nghĩa khi người tài trợ cũng nằm trong danh sách tham gia.
  if (linkedPerson) {
    const exempt = sp.stillSplit === false;
    row.append(
      el('button', {
        type: 'button',
        class: `sponsor-split-toggle${exempt ? ' is-exempt' : ''}`,
        textContent: exempt ? 'Đã miễn chia phần' : 'Vẫn chia phần',
        title: exempt ? 'Bấm để tính lại phần nhậu cho người này' : 'Bấm để miễn phần nhậu cho người này',
        onclick: () => actions.onToggleSponsorSplit(sp.id, exempt),
      })
    );
  }

  row.append(
    el('button', {
      type: 'button',
      class: 'chip-remove',
      title: 'Xoá khoản tài trợ này',
      innerHTML: '<span class="icon-x">&#10005;</span>',
      onclick: () => actions.onRemoveSponsor(sp.id),
    })
  );

  return row;
}
