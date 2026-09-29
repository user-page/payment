/**
 * Hai chỗ bấm Lưu, dùng chung MỘT đường ghi xuống Firebase:
 *
 *   - Nút trong tab Chỉnh sửa (#editSaveBar): luôn hiện, dính lên đầu khi
 *     cuộn, nên lúc nào cũng thấy còn thay đổi chưa lưu hay không.
 *   - Thanh nổi ở đáy màn hình (#saveBar): chỉ hiện khi có thay đổi.
 *
 * Cố tình KHÔNG viết hai luồng lưu riêng — hai nút gọi chung handleSave(),
 * nếu không sẽ có ngày sửa một chỗ quên chỗ kia.
 *
 * Kèm hai lớp chống mất dữ liệu:
 *   - Chặn đóng tab khi còn thay đổi chưa lưu
 *   - Phím tắt Cmd/Ctrl + S để lưu nhanh
 */
import { byId } from '../utils/dom.js';
import { getState, subscribe, dirtyCount, isDirty, discardDraft, setSaving } from '../core/store.js';
import { saveDraft } from '../core/persist.js';

let onSaved = null;

export function initSaveBar({ onAfterSave }) {
  onSaved = onAfterSave;

  for (const id of ['saveBtn', 'editSaveBtn']) byId(id).addEventListener('click', handleSave);
  for (const id of ['discardBtn', 'editDiscardBtn']) byId(id).addEventListener('click', handleDiscard);

  // Chặn đóng tab khi còn thay đổi chưa lưu.
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // Cmd/Ctrl + S: phản xạ quen thuộc, đỡ phải rê chuột xuống cuối trang.
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      // Chốt ô đang gõ dở trước đã: có ô chỉ ghi vào bản nháp lúc rời ô, bấm
      // phím tắt ngay lúc con trỏ còn trong ô thì thứ vừa gõ chưa vào đâu cả.
      // (Bấm nút Lưu bằng chuột thì ô tự rời trước khi nút nhận click.)
      document.activeElement?.blur?.();
      if (isDirty()) handleSave();
    }
  });

  subscribe(renderAllBars);
  renderAllBars();
}

function renderAllBars() {
  render();
  renderEditBar();
}

function render() {
  const bar = byId('saveBar');
  const status = byId('saveStatus');
  const saveBtn = byId('saveBtn');
  const discardBtn = byId('discardBtn');
  const { saving } = getState();
  const n = dirtyCount();

  bar.hidden = n === 0 && !saving;
  if (n === 0 && !saving) return;

  status.textContent = saving
    ? 'Đang lưu...'
    : `${n} thay đổi chưa lưu`;

  saveBtn.disabled = saving;
  discardBtn.disabled = saving;
  saveBtn.textContent = saving ? 'Đang lưu...' : 'Lưu thay đổi';
}

/**
 * Nút Lưu trong tab Chỉnh sửa. Luôn hiện, kể cả khi không có gì để lưu —
 * lúc đó nó nói "Đã lưu hết" để khỏi phải phỏng đoán.
 */
function renderEditBar() {
  const bar = byId('editSaveBar');
  const status = byId('editSaveStatus');
  const saveBtn = byId('editSaveBtn');
  const discardBtn = byId('editDiscardBtn');
  if (!bar) return;

  const { saving } = getState();
  const n = dirtyCount();

  bar.classList.toggle('is-dirty', n > 0 || saving);

  status.textContent = saving
    ? 'Đang lưu...'
    : n > 0
      ? `${n} thay đổi chưa lưu`
      : 'Đã lưu hết — không có thay đổi nào đang chờ';

  saveBtn.textContent = saving ? 'Đang lưu...' : 'Lưu';
  saveBtn.disabled = saving || n === 0;
  discardBtn.disabled = saving || n === 0;
}

async function handleSave() {
  if (!isDirty()) return;

  setSaving(true);
  try {
    await saveDraft();
    discardDraft();
    await onSaved?.();
    flash('Đã lưu', 'ok');
  } catch (err) {
    console.error('saveDraft', err);
    flash('Lưu không được — kiểm tra mạng rồi bấm Lưu lại. Thay đổi của bạn vẫn còn đây.', 'error');
  } finally {
    setSaving(false);
  }
}

function handleDiscard() {
  if (!isDirty()) return;
  if (!window.confirm('Bỏ hết thay đổi chưa lưu và quay về như cũ?')) return;
  discardDraft();
  onSaved?.();
}

/** Thông báo ngắn ở đáy màn hình. */
function flash(message, kind) {
  const node = byId('saveFlash');
  node.textContent = message;
  node.className = `save-flash is-visible ${kind === 'error' ? 'is-error' : 'is-ok'}`;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => {
    node.className = 'save-flash';
  }, kind === 'error' ? 6000 : 2200);
}
