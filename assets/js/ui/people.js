/**
 * Danh sách người tham gia, ô chọn người đứng ra chia tiền, và ảnh QR.
 *
 * Thêm/xoá người ghi ngay (vì các bước sau cần người đã tồn tại thật).
 * Chọn người chia tiền đi vào bản nháp.
 */
import { byId, el, showQrModal } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { QUICK_NAMES, QR_MAX_SIZE } from '../config.js';
import { effectiveEvent, editEvent } from '../core/store.js';

let actions = {};
let qrTargetPersonId = null;

export function initPeople(handlers) {
  actions = handlers;

  byId('quickPersonSelect').innerHTML =
    '<option value="">-- Chọn tên có sẵn --</option>' +
    QUICK_NAMES.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('') +
    '<option value="__new__">+ Thêm mới...</option>';

  byId('addPersonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = byId('newPersonName');
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    await actions.onAddPerson(name);
  });

  byId('quickPersonSelect').addEventListener('change', async (e) => {
    const value = e.target.value;
    if (!value) return;
    e.target.value = '';
    if (value === '__new__') {
      byId('newPersonName').focus();
      return;
    }
    await actions.onAddPerson(value);
  });

  byId('organizerSelect').addEventListener('change', (e) => {
    editEvent({ organizerId: e.target.value || null });
  });

  byId('qrFileInput').addEventListener('change', handleQrFile);
}

export function renderPeople() {
  const ev = effectiveEvent();
  const list = byId('peopleList');
  list.innerHTML = '';

  if (!ev || !ev.people.length) {
    list.append(
      el('div', {
        class: 'empty-state',
        style: { width: '100%' },
        textContent: 'Chưa có ai trong danh sách — thêm tên bên dưới.',
      })
    );
  }
  if (!ev) return;

  for (const p of ev.people) {
    const isOrganizer = p.id === ev.organizerId;

    const remove = el('button', {
      type: 'button',
      class: 'chip-remove',
      title: `Xoá ${p.name}`,
      innerHTML: '<span class="icon-x">&#10005;</span>',
      onclick: () => actions.onRemovePerson(p.id),
    });

    /*
     * Bấm thẳng vào tên để chọn người đứng ra chia tiền — nhanh hơn kéo xuống
     * ô chọn bên dưới. Gắn vào riêng cái tên chứ không gắn cả chip, để bấm nút
     * X vẫn là xoá chứ không kiêm luôn việc đổi người chia tiền.
     */
    const name = el('button', {
      type: 'button',
      class: 'chip-name',
      title: isOrganizer ? `${p.name} đang đứng ra chia tiền` : `Chọn ${p.name} đứng ra chia tiền`,
      textContent: p.name + (isOrganizer ? ' · chia tiền' : ''),
      onclick: () => {
        if (p.id === ev.organizerId) return;
        editEvent({ organizerId: p.id });
        renderPeople();
      },
    });

    list.append(el('span', { class: `chip${isOrganizer ? ' is-organizer' : ''}` }, [name, remove]));
  }

  renderOrganizerPicker(ev);
  renderSponsorPersonOptions(ev);
  renderQrList(ev);
}

function renderOrganizerPicker(ev) {
  const row = byId('organizerRow');
  const select = byId('organizerSelect');

  if (!ev.people.length) {
    row.hidden = true;
    return;
  }
  row.hidden = false;

  /*
   * Chưa chọn ai thì PHẢI có lựa chọn rỗng đang được chọn.
   *
   * Không có nó, trình duyệt tự hiện tên người đầu danh sách — nhìn như đã
   * chọn xong trong khi dữ liệu vẫn trống. Hậu quả nặng hơn ô "người trả":
   * buổi không có người chia tiền bị BỎ QUA hẳn ở tab "Ai chưa trả", và link
   * chia sẻ chỉ hiện một dòng trống trơn.
   */
  const chosen = ev.people.some((p) => p.id === ev.organizerId);
  select.innerHTML =
    (chosen ? '' : '<option value="" selected>— chưa chọn —</option>') +
    ev.people
      .map((p) => `<option value="${p.id}"${p.id === ev.organizerId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
      .join('');
}

/** Ô chọn người tài trợ nằm ở mục khác nhưng lấy dữ liệu từ danh sách người. */
function renderSponsorPersonOptions(ev) {
  const select = byId('newSponsorPersonId');
  if (!select) return;

  const previous = select.value;
  select.innerHTML =
    '<option value="">Người ngoài (không tham gia)</option>' +
    ev.people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  if (ev.people.some((p) => p.id === previous)) select.value = previous;
}

// ------------------------------------------------------------------ ảnh QR

function renderQrList(ev) {
  const label = byId('qrSectionLabel');
  const list = byId('qrList');
  list.innerHTML = '';

  if (!ev.people.length) {
    label.hidden = true;
    return;
  }
  label.hidden = false;

  /*
   * Chỉ người đứng ra chia tiền mới cần QR: mọi người chuyển khoản về một
   * đầu mối là họ, và bảng kết quả cũng chỉ hiện QR của người này. Cho tải
   * QR của người khác chỉ tổ tốn công mà không ai nhìn thấy.
   */
  const organizer = ev.people.find((p) => p.id === ev.organizerId);
  if (!organizer) {
    list.append(
      el('div', {
        class: 'empty-state',
        textContent: 'Chọn người đứng ra chia tiền ở trên rồi mới tải được ảnh QR.',
      })
    );
    return;
  }

  for (const p of [organizer]) {
    const row = el('div', { class: 'qr-row' }, [
      el('span', {
        class: 'qr-name',
        textContent: `${p.name} (chia tiền)`,
      }),
    ]);

    if (p.qr) {
      row.append(
        el('img', {
          class: 'qr-thumb',
          src: p.qr,
          alt: `QR chuyển khoản ${p.name}`,
          title: 'Xem QR to hơn',
          onclick: () => showQrModal(p.qr, p.name),
        })
      );
    }

    row.append(
      el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-small',
        textContent: p.qr ? 'Đổi QR' : 'Tải QR lên',
        onclick: () => {
          qrTargetPersonId = p.id;
          byId('qrFileInput').value = '';
          byId('qrFileInput').click();
        },
      })
    );

    if (p.qr) {
      row.append(
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-small',
          textContent: 'Xoá QR',
          onclick: () => actions.onClearQr(p.id),
        })
      );
    }

    list.append(row);
  }
}

function handleQrFile() {
  const input = byId('qrFileInput');
  const file = input.files?.[0];
  if (!file || !qrTargetPersonId) return;

  const personId = qrTargetPersonId;
  shrinkImage(file, (blob) => actions.onUploadQr(personId, blob));
}

/**
 * Thu nhỏ ảnh QR trước khi tải lên: giữ đủ nét để quét được mà nhẹ hơn nhiều.
 * Nền trắng được vẽ trước để ảnh PNG trong suốt không thành QR đen trên đen.
 */
function shrinkImage(file, done) {
  const status = byId('qrStatus');

  if (!file.type?.startsWith('image/')) {
    status.textContent = 'File không phải ảnh — chọn file PNG hoặc JPG.';
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => { status.textContent = 'Không đọc được file này, thử lại.'; };
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => { status.textContent = 'Không đọc được ảnh này, thử ảnh khác.'; };
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > QR_MAX_SIZE || h > QR_MAX_SIZE) {
        if (w >= h) { h = Math.round(h * (QR_MAX_SIZE / w)); w = QR_MAX_SIZE; }
        else { w = Math.round(w * (QR_MAX_SIZE / h)); h = QR_MAX_SIZE; }
      }

      const canvas = el('canvas', { width: w, height: h });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) { status.textContent = 'Không xử lý được ảnh này, thử ảnh khác.'; return; }
        status.textContent = '';
        done(blob);
      }, 'image/png');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
