/**
 * Tiện ích thao tác DOM. Giữ mỏng — chỉ những thứ lặp lại nhiều lần.
 */

/** Lấy phần tử theo id. */
export const byId = (id) => document.getElementById(id);

/** Tạo phần tử kèm thuộc tính và con, gọn hơn createElement nhiều dòng. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node[k] = v;
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

/** Hiện/ẩn theo cờ, dùng thuộc tính hidden thay vì sửa style. */
export function toggle(node, visible) {
  if (node) node.hidden = !visible;
}

/**
 * Nút cần bấm hai lần mới thực thi — dùng cho thao tác xoá, tránh lỡ tay.
 * Sau 2.8 giây không bấm tiếp thì tự trở về trạng thái ban đầu.
 */
export function armConfirm(btn, label, confirmLabel, onConfirm) {
  let timer = null;
  btn.textContent = label;

  btn.addEventListener('click', () => {
    if (btn.dataset.armed === '1') {
      clearTimeout(timer);
      btn.dataset.armed = '0';
      btn.textContent = label;
      btn.classList.remove('btn-danger');
      onConfirm();
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = confirmLabel;
    btn.classList.add('btn-danger');
    timer = setTimeout(() => {
      btn.dataset.armed = '0';
      btn.textContent = label;
      btn.classList.remove('btn-danger');
    }, 2800);
  });
}

/** Chép text vào clipboard, có đường lui khi trình duyệt chặn. */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* rơi xuống cách thủ công */
    }
  }
  window.prompt('Sao chép đoạn này:', text);
  return false;
}

/** Phóng to ảnh QR, bấm ra ngoài để đóng. */
export function showQrModal(src, name) {
  const img = el('img', { src, alt: `QR chuyển khoản ${name || ''}` });
  const overlay = el('div', { class: 'qr-modal-overlay' }, [img]);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.append(overlay);
}

/**
 * Thông báo ngắn ở đáy màn hình.
 *
 * Dùng ô #saveFlash — ô này nằm sẵn trong index.html nên lúc nào cũng có,
 * khác với #copyToast chỉ tồn tại khi bảng kết quả đang được vẽ.
 */
export function flashMessage(message, kind = 'ok') {
  const node = byId('saveFlash');
  if (!node) return;
  node.textContent = message;
  node.className = `save-flash is-visible ${kind === 'error' ? 'is-error' : 'is-ok'}`;
  clearTimeout(flashMessage.timer);
  flashMessage.timer = setTimeout(() => {
    node.className = 'save-flash';
  }, kind === 'error' ? 6000 : 2600);
}
