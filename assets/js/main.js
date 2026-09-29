/**
 * Điểm khởi động và là nơi DUY NHẤT nối các tầng với nhau.
 *
 * Luồng phụ thuộc một chiều, không có vòng lặp:
 *   config → utils → domain → data → core → ui → main
 *
 * Tầng ui không tự gọi database: nó nhận các hàm hành động từ đây. Nhờ vậy
 * mỗi thao tác chỉ có một chỗ định nghĩa, và sau mỗi thao tác đều đi qua đúng
 * một đường tải lại dữ liệu.
 */
import { today } from './utils/format.js';
import { byId, copyText, flashMessage } from './utils/dom.js';

import { isConfigured } from './data/client.js';
import { listEvents, loadEvent, createEvent, deleteEvent } from './data/events.js';
import { addPerson, removePerson, uploadQr, clearQr, setPaidAmount, setPaidFlag } from './data/people.js';
import { addRound, removeRound } from './data/rounds.js';
import { addSponsor, removeSponsor, updateSponsor } from './data/sponsors.js';

import {
  getState, setUser, setEvents, setCurrentEvent, replaceEvent, reset, isDirty, subscribe,
} from './core/store.js';
import { signInWithUsername, signOut, loadProfile, watchSession } from './core/auth.js';

import { initTabs, switchTab } from './ui/tabs.js';
import { initSaveBar } from './ui/saveBar.js';
import { initEventBar, renderEventBar } from './ui/eventBar.js';
import { initPeople, renderPeople } from './ui/people.js';
import { initRounds, renderRounds } from './ui/rounds.js';
import { initSponsors, renderSponsors } from './ui/sponsors.js';
import { initResults, renderResults, renderEventList } from './ui/results.js';
import { initDebt } from './ui/debt.js';
import { handleShareRoute, shareLink } from './ui/shareView.js';

// ------------------------------------------------------------------ vẽ lại

function renderAll() {
  renderEventBar();
  renderPeople();
  renderRounds();
  renderSponsors();
  renderResults();
  renderEventList();
}

/** Tải lại buổi đang mở từ database rồi vẽ lại — giữ nguyên bản nháp chưa lưu. */
async function reloadCurrentEvent() {
  const { currentEventId } = getState();
  if (!currentEventId) return;
  const [event, events] = await Promise.all([loadEvent(currentEventId), listEvents()]);
  setEvents(events);
  replaceEvent(event);
  renderAll();
}

/** Tải danh sách buổi và mở một buổi (ưu tiên `preferId`, không có thì buổi mới nhất). */
async function refreshAndSelect(preferId) {
  const events = await listEvents();
  setEvents(events);

  if (!events.length) {
    setCurrentEvent(null, null);
    renderAll();
    return;
  }

  const pick = preferId && events.some((e) => e.id === preferId) ? preferId : events[0].id;
  setCurrentEvent(pick, await loadEvent(pick));
  renderAll();
}

/** Bọc một thao tác ghi: chạy xong thì tải lại, lỗi thì báo cho người dùng. */
async function mutate(fn, errorMessage) {
  try {
    await fn();
    await reloadCurrentEvent();
  } catch (err) {
    console.error(errorMessage, err);
    window.alert(`${errorMessage}\n\n${err.message}`);
  }
}

/** Như mutate(), cho thao tác trên buổi đang mở. Chưa mở buổi nào thì bỏ qua. */
function inCurrentEvent(fn, errorMessage) {
  const { currentEventId } = getState();
  if (!currentEventId) return;
  return mutate(() => fn(currentEventId), errorMessage);
}

// ---------------------------------------------------------------- hành động

const actions = {
  async onSelectEvent(eventId) {
    setCurrentEvent(eventId, await loadEvent(eventId));
    renderAll();
  },

  onDeleteEvent() {
    const { events, currentEventId } = getState();
    if (events.length <= 1) return;
    return mutate(async () => {
      await deleteEvent(currentEventId);
      await refreshAndSelect();
    }, 'Không xoá được buổi nhậu.');
  },

  // Các thao tác trong một buổi đều cần biết buổi đang mở; gom lại cho gọn.
  onAddPerson: (name) => inCurrentEvent((id) => addPerson(id, name), 'Không thêm được người.'),
  onRemovePerson: (personId) => inCurrentEvent((id) => removePerson(id, personId), 'Không xoá được người.'),
  onUploadQr: (personId, blob) => inCurrentEvent((id) => uploadQr(id, personId, blob), 'Không lưu được ảnh QR.'),
  onClearQr: (personId) => inCurrentEvent((id) => clearQr(id, personId), 'Không xoá được ảnh QR.'),

  onAddRound: () => inCurrentEvent((id) => addRound(id), 'Không thêm được khoản chi.'),
  onRemoveRound: (roundId) => inCurrentEvent((id) => removeRound(id, roundId), 'Không xoá được khoản chi.'),

  onAddSponsor: (payload) => inCurrentEvent((id) => addSponsor(id, payload), 'Không thêm được khoản tài trợ.'),
  onRemoveSponsor: (sponsorId) => inCurrentEvent((id) => removeSponsor(id, sponsorId), 'Không xoá được khoản tài trợ.'),
  onToggleSponsorPaid: (sponsorId, isPaid) =>
    inCurrentEvent((id) => updateSponsor(id, sponsorId, { isPaid }), 'Không đổi được trạng thái.'),
  onToggleSponsorSplit: (sponsorId, stillSplit) =>
    inCurrentEvent((id) => updateSponsor(id, sponsorId, { stillSplit }), 'Không đổi được trạng thái.'),

  onTogglePaid: (personId, isPaid, owed) =>
    inCurrentEvent((id) => setPaidFlag(id, personId, isPaid, owed), 'Không cập nhật được.'),
  onSetPaidAmount: (personId, amount, owed) =>
    inCurrentEvent((id) => setPaidAmount(id, personId, amount, owed), 'Không cập nhật được số tiền đã trả.'),

  async onShareEvent(ev) {
    const link = shareLink('share', ev.id);
    const ok = await copyText(link);
    const ten = ev.name ? `"${ev.name}"` : 'buổi này';
    // flashMessage chứ không phải showToast: nút Chia sẻ nay có ở cả danh sách
    // buổi, nơi bảng kết quả (và ô toast của nó) có thể chưa được vẽ.
    flashMessage(ok ? `Đã chép link chỉ-xem của ${ten}` : `Link chỉ-xem của ${ten}: ${link}`, 'ok');
  },

  async onShareAll() {
    const { user } = getState();
    const status = byId('debtStatus');
    if (!user?.username) {
      status.textContent = 'Tài khoản này chưa có tên đăng nhập để tạo link chia sẻ.';
      return;
    }
    const link = shareLink('shareAll', user.username);
    await copyText(link);
    status.textContent = `Đã sao chép link chỉ-xem: ${link}`;
  },
};

// ------------------------------------------------------------------- phiên

async function handleSession(session) {
  if (session?.user) {
    const { user, isAdmin } = await loadProfile(session);
    setUser(user, isAdmin);
    renderUserBar();
    showScreen('app');
    try {
      await refreshAndSelect();
    } catch (err) {
      // Không nuốt: lỗi quyền truy cập ở đây làm app trống trơn, người dùng
      // tưởng mất hết dữ liệu.
      console.error('refreshAndSelect', err);
      window.alert(`Không tải được dữ liệu.\n\n${err.message}`);
    }
    return;
  }

  reset();
  byId('authUsername').value = '';
  byId('authStatus').textContent = '';
  showScreen('auth');
}

function showScreen(which) {
  byId('loadingNote').hidden = true;
  byId('authSection').hidden = which !== 'auth';
  byId('mainApp').hidden = which !== 'app';
}

function renderUserBar() {
  const { user, isAdmin } = getState();
  const bar = byId('userBar');
  bar.innerHTML = '';

  const name = document.createElement('span');
  name.className = 'email';
  name.textContent = user.username || user.email;
  bar.append(name);

  if (isAdmin) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'Admin — xem tất cả';
    bar.append(badge);
  }

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  bar.append(spacer);

  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'btn btn-ghost btn-small';
  out.textContent = 'Đăng xuất';
  out.addEventListener('click', async () => {
    if (isDirty() && !window.confirm('Còn thay đổi chưa lưu. Đăng xuất sẽ mất những thay đổi đó. Tiếp tục?')) return;
    await signOut();
  });
  bar.append(out);
}

function initAuthForm() {
  byId('authUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = byId('authEnterBtn');
    const status = byId('authStatus');

    status.textContent = '';
    status.className = 'auth-status';
    btn.disabled = true;

    try {
      await signInWithUsername(byId('authUsername').value);
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function initCreateForm() {
  byId('createEventDate').value = today();

  byId('createEventBtn').addEventListener('click', async () => {
    const btn = byId('createEventBtn');
    const { user } = getState();
    if (!user) return;

    btn.disabled = true;
    try {
      const created = await createEvent({
        name: byId('createEventName').value.trim(),
        eventDate: byId('createEventDate').value,
      });
      byId('createEventName').value = '';
      byId('createEventDate').value = today();
      await refreshAndSelect(created.id);
      switchTab('edit');
    } catch (err) {
      console.error('createEvent', err);
      window.alert(`Không tạo được buổi nhậu.\n\n${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });
}

// -------------------------------------------------------------- khởi động

function main() {
  if (!isConfigured) {
    byId('loadingNote').textContent =
      'Chưa cấu hình Firebase — điền thông tin project vào assets/js/config.js (xem README).';
    return;
  }

  // Link chia sẻ đi đường riêng: không đăng nhập, không dựng phần chỉnh sửa.
  if (handleShareRoute()) return;

  initTabs();
  initAuthForm();
  initCreateForm();
  initEventBar(actions);
  initPeople(actions);
  initRounds(actions);
  initSponsors(actions);
  initResults(actions);
  initDebt(actions);
  initSaveBar({ onAfterSave: reloadCurrentEvent });

  /**
   * Bảng kết quả vẽ lại ngay khi bản nháp đổi, để người dùng thấy số tiền
   * tính theo những gì vừa gõ dù chưa bấm Lưu.
   *
   * Chỉ vẽ lại phần kết quả, KHÔNG vẽ lại các ô đang nhập ở tab Chỉnh sửa —
   * dựng lại ô nhập giữa chừng sẽ làm mất con trỏ đang gõ.
   */
  subscribe(() => {
    if (getState().event) renderResults();
  });

  watchSession(handleSession);
}

main();
