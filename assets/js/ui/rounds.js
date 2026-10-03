/**
 * Các khoản đã chi.
 *
 * Mọi ô nhập ở đây đi vào bản nháp — gõ thoải mái rồi bấm Lưu một lần.
 * Thêm/xoá khoản thì ghi ngay.
 */
import { byId, el, armConfirm } from '../utils/dom.js';
import { fmtNum, parseMoney } from '../utils/format.js';
import { effectiveEvent, editRound, editParticipants } from '../core/store.js';

let actions = {};

export function initRounds(handlers) {
  actions = handlers;
  byId('addRoundBtn').addEventListener('click', () => actions.onAddRound());
}

export function renderRounds() {
  const ev = effectiveEvent();
  const list = byId('roundsList');
  list.innerHTML = '';
  if (!ev) return;

  if (!ev.rounds.length) {
    list.append(
      el('div', {
        class: 'empty-state',
        textContent: 'Chưa có khoản chi nào. Bấm "Thêm khoản" để nhập tăng 1, tăng 2, tăng 3...',
      })
    );
    return;
  }

  ev.rounds.forEach((round, index) => list.append(roundCard(ev, round, index)));
}

function roundCard(ev, r, index) {
  const removeBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-small' });
  armConfirm(removeBtn, 'Xoá khoản', 'Bấm lần nữa để xoá', () => actions.onRemoveRound(r.id));

  const header = el('div', { class: 'round-header' }, [
    el('span', { class: 'round-badge', textContent: `Khoản ${index + 1}` }),
    removeBtn,
  ]);

  const fields = el('div', { class: 'round-fields' }, [
    textField('Tên khoản', r.ten, (v) => editRound(r.id, { ten: v }), 'VD: Tăng 1, Tăng 2'),
    dateField('Ngày', r.ngay, (v) => editRound(r.id, { ngay: v })),
    textField('Địa điểm', r.diaDiem, (v) => editRound(r.id, { diaDiem: v }), 'VD: Quán ốc Bà Tư'),
    moneyField('Số tiền', r.soTien, (v) => editRound(r.id, { soTien: v })),
    payerField(ev, r),
  ]);

  return el('div', { class: 'round-card' }, [header, fields, participantChips(ev, r), ganhHoBox(ev, r)]);
}

/**
 * "Ai mời ai" trong khoản này.
 *
 * Phần của người được mời dồn sang người mời: khoản 900 có A, B, C mà A mời B
 * thì A trả 600, C trả 300, B không phải trả.
 *
 * Giống chip người tham gia, chỗ này tự dựng lại DOM của riêng nó thay vì gọi
 * renderRounds() — vẽ lại cả khoản sẽ làm mất con trỏ ở các ô đang gõ.
 */
function ganhHoBox(ev, r) {
  // Bản sao riêng: effectiveEvent() trả về chính object đã lưu khi chưa có
  // thay đổi nào chờ lưu, sửa thẳng vào đó là hỏng nút "Huỷ thay đổi".
  let pairs = { ...(r.ganhHo || {}) };

  const list = el('div', { class: 'ganh-ho-list' });
  const note = el('span', { class: 'ganh-ho-note' });
  const tenCua = (id) => ev.people.find((p) => p.id === id)?.name || '(đã xoá)';

  const commit = () => {
    editRound(r.id, { ganhHo: { ...pairs } });
    drawList();
  };

  function drawList() {
    list.innerHTML = '';
    const entries = Object.entries(pairs);
    if (!entries.length) {
      list.append(el('span', { class: 'ganh-ho-empty', textContent: 'Chưa có ai mời ai.' }));
      return;
    }
    for (const [duocMoi, nguoiMoi] of entries) {
      const x = el('button', {
        type: 'button',
        class: 'chip-remove',
        title: `Bỏ: ${tenCua(nguoiMoi)} mời ${tenCua(duocMoi)}`,
        innerHTML: '<span class="icon-x">&#10005;</span>',
        onclick: () => {
          delete pairs[duocMoi];
          commit();
        },
      });
      list.append(
        el('span', { class: 'chip ganh-ho-chip' }, [
          el('span', { textContent: `${tenCua(nguoiMoi)} mời ${tenCua(duocMoi)}` }),
          x,
        ])
      );
    }
  }

  const selMoi = el('select', { class: 'ganh-ho-select' });
  const selDuoc = el('select', { class: 'ganh-ho-select' });
  for (const sel of [selMoi, selDuoc]) {
    sel.append(el('option', { value: '', textContent: '— chọn —' }));
    for (const p of ev.people) sel.append(el('option', { value: p.id, textContent: p.name }));
  }

  const addBtn = el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-small',
    textContent: 'Thêm',
    onclick: () => {
      const nguoiMoi = selMoi.value;
      const duocMoi = selDuoc.value;
      note.textContent = '';

      /*
       * Báo ngay tại chỗ thay vì để ganhHoHopLe() lặng lẽ bỏ cặp sai: người
       * dùng bấm Thêm mà không thấy gì xảy ra thì không đoán ra vì sao.
       */
      if (!nguoiMoi || !duocMoi) return void (note.textContent = 'Chọn đủ cả hai người.');
      if (nguoiMoi === duocMoi) return void (note.textContent = 'Không thể tự mời chính mình.');

      /*
       * Đọc lại danh sách người tham gia từ bản nháp, KHÔNG dùng `r` của lúc
       * vẽ: bấm chip người tham gia chỉ ghi vào bản nháp chứ không vẽ lại
       * khoản chi, nên `r.thamGiaIds` ở đây là ảnh chụp cũ. Dùng nó thì vừa bỏ
       * tích một người xong vẫn mời được người đó.
       */
      const nay = effectiveEvent()?.rounds.find((x) => x.id === r.id) || r;
      if (!nay.thamGiaIds.includes(duocMoi)) {
        return void (note.textContent = `${tenCua(duocMoi)} chưa tích tham gia khoản này.`);
      }
      if (pairs[nguoiMoi]) {
        return void (note.textContent = `${tenCua(nguoiMoi)} đang được người khác mời — không mời tiếp được.`);
      }
      if (Object.hasOwn(pairs, duocMoi)) {
        return void (note.textContent = `${tenCua(duocMoi)} đã được ${tenCua(pairs[duocMoi])} mời rồi.`);
      }
      if (Object.values(pairs).includes(duocMoi)) {
        return void (note.textContent = `${tenCua(duocMoi)} đang mời người khác — không được mời lại.`);
      }

      pairs[duocMoi] = nguoiMoi;
      selMoi.value = '';
      selDuoc.value = '';
      commit();
    },
  });

  drawList();

  return el('div', { class: 'ganh-ho' }, [
    // Lớp riêng, không dùng chung .participants-label: chỗ này không phải
    // nhãn người tham gia, và dùng chung làm các selector tìm nhãn kia khớp cả hai.
    el('span', { class: 'ganh-ho-label', textContent: 'Ai mời ai (trả hộ phần của người khác)' }),
    list,
    el('div', { class: 'ganh-ho-add' }, [
      selMoi,
      el('span', { class: 'ganh-ho-word', textContent: 'mời' }),
      selDuoc,
      addBtn,
      note,
    ]),
  ]);
}

/** Ô chữ thường, cập nhật bản nháp ngay khi gõ. */
function textField(label, value, onChange, placeholder) {
  const input = el('input', { type: 'text', value: value || '', placeholder: placeholder || '' });
  input.addEventListener('input', () => onChange(input.value));
  return el('div', { class: 'field' }, [el('label', { class: 'field-label', textContent: label }), input]);
}

function dateField(label, value, onChange) {
  const input = el('input', { type: 'date', value: value || '' });
  input.addEventListener('change', () => onChange(input.value));
  return el('div', { class: 'field' }, [el('label', { class: 'field-label', textContent: label }), input]);
}

/**
 * Ô tiền.
 *
 * Ghi vào bản nháp NGAY TỪNG PHÍM, giống ô tên khoản và địa điểm.
 *
 * Trước đây ô này chỉ ghi lúc rời ô, và có thêm một đoạn khi bấm vào ô thì
 * nạp lại số từ lần vẽ gần nhất. Hai thứ đó cộng lại làm mất tiền: gõ xong,
 * bấm ra ngoài, bấm vào lại là số vừa gõ bị xoá về số cũ; rời ô lần nữa thì
 * số cũ đó ghi đè lên bản nháp. Bấm Cmd+S ngay khi còn đang gõ cũng mất, vì
 * chưa có gì vào bản nháp cả.
 *
 * Chỉ chuẩn hoá lại cách hiện lúc rời ô — sửa giữa chừng sẽ nhảy con trỏ.
 */
function moneyField(label, value, onChange) {
  const input = el('input', {
    type: 'text',
    inputMode: 'numeric',
    class: 'money-input',
    placeholder: '0',
    value: value ? fmtNum(value) : '',
  });

  input.addEventListener('input', () => onChange(parseMoney(input.value)));
  input.addEventListener('blur', () => {
    const parsed = parseMoney(input.value);
    input.value = parsed ? fmtNum(parsed) : '';
    onChange(parsed);
  });

  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', textContent: `${label} (nghìn đ)` }),
    input,
  ]);
}

function payerField(ev, r) {
  // Lớp riêng để phân biệt với hai ô chọn của mục "ai mời ai" bên dưới.
  const select = el('select', { class: 'payer-select' });

  if (!ev.people.length) {
    select.append(el('option', { textContent: '— chưa có người —' }));
    select.disabled = true;
  } else {
    /*
     * Khoản chưa chọn ai trả thì PHẢI có một lựa chọn rỗng đang được chọn.
     *
     * Không có nó, trình duyệt tự hiện tên người đầu tiên trong danh sách —
     * ô nhìn như đã chọn xong trong khi dữ liệu vẫn trống, và số tiền khoản
     * đó không được tính là ai đã trả cả. Tổng tiền vì thế lệch mà không rõ
     * vì sao. (Xảy ra khi thêm khoản chi trước lúc thêm người, hoặc khi
     * người đang trả bị xoá khỏi buổi.)
     */
    if (!ev.people.some((p) => p.id === r.nguoiTraId)) {
      select.append(el('option', { value: '', textContent: '— chưa chọn —', selected: true }));
    }
    for (const p of ev.people) {
      select.append(el('option', { value: p.id, textContent: p.name, selected: p.id === r.nguoiTraId }));
    }
    select.addEventListener('change', () => editRound(r.id, { nguoiTraId: select.value || null }));
  }

  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', textContent: 'Người trả' }),
    select,
  ]);
}

/** Chip bật/tắt ai tham gia khoản này. */
function participantChips(ev, r) {
  const label = el('span', {
    class: 'participants-label',
    textContent: `Người tham gia khoản này (${r.thamGiaIds.length}/${ev.people.length})`,
  });

  const chips = el('div', { class: 'toggle-chips' });

  /*
   * Bản sao riêng, KHÔNG sửa thẳng vào `r`.
   *
   * Khi chưa có thay đổi nào chờ lưu, effectiveEvent() trả về đúng object đã
   * lưu chứ không phải bản sao — sửa vào đó là ghi đè dữ liệu gốc, khiến bấm
   * "Huỷ thay đổi" không trả về được như cũ.
   */
  let ids = [...r.thamGiaIds];
  const updateLabel = () => {
    label.textContent = `Người tham gia khoản này (${ids.length}/${ev.people.length})`;
  };

  if (!ev.people.length) {
    chips.append(
      el('span', {
        style: { color: 'var(--ink-faint)', fontSize: '13px' },
        textContent: 'Thêm người ở trên trước.',
      })
    );
  }

  for (const p of ev.people) {
    const chip = el('button', {
      type: 'button',
      class: `toggle-chip${ids.includes(p.id) ? ' is-on' : ''}`,
      textContent: p.name,
    });

    /*
     * Bấm chip không kéo theo vẽ lại cả khoản chi (renderRounds() chỉ chạy lại
     * sau khi Lưu/Huỷ) — vẽ lại giữa chừng sẽ làm mất con trỏ đang gõ ở các ô
     * khác trong cùng khoản. Vì vậy tự đổi màu chip và cập nhật số đếm ngay
     * tại đây, thay vì trông chờ một lượt vẽ lại.
     */
    chip.addEventListener('click', () => {
      const nowOn = chip.classList.toggle('is-on');
      ids = nowOn ? [...ids, p.id] : ids.filter((id) => id !== p.id);
      updateLabel();
      editParticipants(r.id, ids);
    });

    chips.append(chip);
  }

  return el('div', {}, [label, chips]);
}
