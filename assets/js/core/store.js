/**
 * Kho trạng thái của app, kèm cơ chế "bản nháp" cho nút Lưu.
 *
 * CÁCH HOẠT ĐỘNG
 * Sửa các ô nhập liệu (tên buổi, ngày, tên khoản, số tiền, địa điểm, ai trả,
 * ai tham gia) KHÔNG ghi thẳng xuống database. Thay đổi được gom vào `draft`
 * cho tới khi người dùng bấm Lưu.
 *
 * Thêm/xoá người, khoản chi, tài trợ thì vẫn ghi ngay, vì các thao tác sau đó
 * phụ thuộc vào việc bản ghi đã thực sự tồn tại (VD: vừa thêm người xong đã
 * muốn tích họ vào một khoản chi).
 *
 * Giao diện luôn vẽ theo `effectiveEvent()` — tức dữ liệu đã lưu chồng bản
 * nháp lên trên — nên người dùng thấy ngay kết quả tính tiền theo con số vừa
 * gõ, dù chưa bấm Lưu.
 */

const listeners = new Set();

const state = {
  user: null,          // { id, email, username }
  isAdmin: false,
  events: [],          // danh sách tóm tắt các buổi (không kèm người, khoản chi)
  currentEventId: null,
  event: null,         // buổi đang mở, đã nạp đầy đủ
  draft: new Map(),    // khoá -> thay đổi chưa lưu
  saving: false,
};

/** Đăng ký lắng nghe thay đổi; trả về hàm huỷ đăng ký. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export const getState = () => state;

export function setUser(user, isAdmin) {
  state.user = user;
  state.isAdmin = isAdmin;
  emit();
}

export function setEvents(events) {
  state.events = events;
  emit();
}

/** Mở một buổi khác: bỏ bản nháp cũ để không ghi nhầm sang buổi mới. */
export function setCurrentEvent(eventId, event) {
  state.currentEventId = eventId;
  state.event = event;
  state.draft.clear();
  emit();
}

/**
 * Cập nhật dữ liệu đã lưu của buổi ĐANG MỞ (sau khi thêm/xoá người, khoản...)
 * mà KHÔNG bỏ bản nháp — để những gì đang gõ dở chưa lưu không bị mất.
 * Chỉ bỏ phần nháp của khoản chi vừa bị xoá.
 */
export function replaceEvent(event) {
  state.event = event;
  const roundIds = new Set((event?.rounds || []).map((r) => r.id));
  for (const [key, entry] of state.draft) {
    if (entry.roundId && !roundIds.has(entry.roundId)) state.draft.delete(key);
  }
  emit();
}

export function reset() {
  state.user = null;
  state.isAdmin = false;
  state.events = [];
  state.currentEventId = null;
  state.event = null;
  state.draft.clear();
  emit();
}

// ---------------------------------------------------------------- bản nháp

/** Ghi nhận sửa một trường của buổi nhậu. */
export function editEvent(patch) {
  const key = 'event';
  const entry = state.draft.get(key) || { kind: 'event', patch: {} };
  Object.assign(entry.patch, patch);
  state.draft.set(key, entry);
  emit();
}

/** Ghi nhận sửa một trường của khoản chi. */
export function editRound(roundId, patch) {
  const key = `round:${roundId}`;
  const entry = state.draft.get(key) || { kind: 'round', roundId, patch: {} };
  Object.assign(entry.patch, patch);
  state.draft.set(key, entry);
  emit();
}

/** Ghi nhận danh sách người tham gia mới của một khoản chi. */
export function editParticipants(roundId, personIds) {
  state.draft.set(`participants:${roundId}`, {
    kind: 'participants',
    roundId,
    personIds: [...personIds],
  });
  emit();
}

export const dirtyCount = () => state.draft.size;
export const isDirty = () => state.draft.size > 0;

export function discardDraft() {
  state.draft.clear();
  emit();
}

export function setSaving(flag) {
  state.saving = flag;
  emit();
}

/**
 * Buổi nhậu như người dùng đang THẤY: dữ liệu đã lưu, chồng bản nháp lên trên.
 *
 * Trả về bản sao, không sửa vào `state.event` — nhờ vậy bấm Huỷ là quay về
 * nguyên trạng mà không cần tải lại từ database.
 */
export function effectiveEvent() {
  const ev = state.event;
  if (!ev) return null;
  if (!state.draft.size) return ev;

  const out = {
    ...ev,
    people: ev.people.map((p) => ({ ...p })),
    rounds: ev.rounds.map((r) => ({ ...r, thamGiaIds: [...r.thamGiaIds] })),
    sponsors: ev.sponsors.map((s) => ({ ...s })),
  };

  for (const entry of state.draft.values()) {
    if (entry.kind === 'event') {
      if ('name' in entry.patch) out.name = entry.patch.name;
      if ('eventDate' in entry.patch) out.eventDate = entry.patch.eventDate;
      if ('organizerId' in entry.patch) out.organizerId = entry.patch.organizerId;
    } else if (entry.kind === 'round') {
      const r = out.rounds.find((x) => x.id === entry.roundId);
      if (r) Object.assign(r, entry.patch);
    } else if (entry.kind === 'participants') {
      const r = out.rounds.find((x) => x.id === entry.roundId);
      if (r) r.thamGiaIds = [...entry.personIds];
    }
  }

  return out;
}

/**
 * Bản nháp đã sẵn sàng để ghi xuống database (xem core/persist.js).
 */
export function draftEntries() {
  return [...state.draft.values()];
}
