/**
 * Thanh Lưu nổi ở đáy màn hình.
 *
 * Chỉ hiện khi có thay đổi chưa lưu. Kèm hai lớp chống mất dữ liệu:
 *   - Chặn đóng tab khi còn thay đổi chưa lưu
 *   - Phím tắt Cmd/Ctrl + S để lưu nhanh
 */
import { byId } from '../utils/dom.js';
import { getState, subscribe, dirtyCount, isDirty, discardDraft, setSaving } from '../core/store.js';
import { saveDraft } from '../core/persist.js';

let onSaved = null;

export function initSaveBar({ onAfterSave }) {
  onSaved = onAfterSave;

  byId('saveBtn').addEventListener('click', handleSave);
  byId('discardBtn').addEventListener('click', handleDiscard);

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
      if (isDirty()) handleSave();
    }
  });

  subscribe(render);
  render();
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
