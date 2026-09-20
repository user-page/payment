/**
 * Ghi bản nháp xuống database.
 *
 * Tách riêng khỏi store.js vì store chỉ giữ trạng thái trong bộ nhớ, còn đây
 * mới là chỗ biết tên cột thật và thứ tự ghi an toàn.
 */
import { updateEvent } from '../data/events.js';
import { updateRound, setParticipants } from '../data/rounds.js';
import { getState, draftEntries } from './store.js';

/**
 * Ghi toàn bộ thay đổi đang chờ.
 *
 * Ghi tuần tự chứ không song song: số lượng thay đổi luôn nhỏ, mà chạy tuần
 * tự thì khi lỗi ta biết chính xác đã ghi tới đâu.
 *
 * @returns {Promise<{saved:number}>}
 * @throws nếu có bất kỳ thao tác nào thất bại
 */
export async function saveDraft() {
  const { currentEventId, event } = getState();
  if (!currentEventId || !event) return { saved: 0 };

  const entries = draftEntries();
  let saved = 0;

  for (const entry of entries) {
    if (entry.kind === 'event') {
      await updateEvent(currentEventId, toEventColumns(entry.patch));
    } else if (entry.kind === 'round') {
      await updateRound(entry.roundId, toRoundColumns(entry.patch));
    } else if (entry.kind === 'participants') {
      const round = event.rounds.find((r) => r.id === entry.roundId);
      await setParticipants(entry.roundId, entry.personIds, round?.thamGiaIds || []);
    }
    saved += 1;
  }

  return { saved };
}

/** Tên thuộc tính trong app -> tên cột ctn_events. */
function toEventColumns(patch) {
  const cols = {};
  if ('name' in patch) cols.name = patch.name;
  if ('eventDate' in patch) cols.event_date = patch.eventDate || null;
  if ('organizerId' in patch) cols.organizer_person_id = patch.organizerId;
  return cols;
}

/** Tên thuộc tính trong app -> tên cột ctn_rounds. */
function toRoundColumns(patch) {
  const cols = {};
  if ('ten' in patch) cols.ten = patch.ten;
  if ('ngay' in patch) cols.ngay = patch.ngay || null;
  if ('diaDiem' in patch) cols.dia_diem = patch.diaDiem;
  if ('soTien' in patch) cols.so_tien = patch.soTien;
  if ('nguoiTraId' in patch) cols.nguoi_tra_id = patch.nguoiTraId;
  return cols;
}
