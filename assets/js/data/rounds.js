/**
 * Các khoản đã chi (tăng 1, tăng 2, taxi...) và ai tham gia khoản nào.
 *
 * Thứ tự các khoản chính là thứ tự trong mảng `rounds` của buổi.
 * Sửa nội dung một khoản và danh sách người tham gia thì đi qua bản nháp —
 * xem applyDraft() trong events.js.
 */
import { newId } from './client.js';
import { mutateEvent } from './events.js';
import { today } from '../utils/format.js';

/**
 * Thêm khoản chi mới. Mặc định cho cả nhóm tham gia, người chia tiền là người
 * trả, và lấy ngày của khoản trước đó — vì các tăng thường cùng một đêm.
 */
export function addRound(eventId) {
  return mutateEvent(eventId, (ev) => {
    const last = ev.rounds.at(-1);
    const round = {
      id: newId(),
      ten: `Tăng ${ev.rounds.length + 1}`,
      ngay: last?.ngay || ev.eventDate || today(),
      diaDiem: '',
      soTien: 0,
      nguoiTraId: ev.organizerId || ev.people[0]?.id || null,
      thamGiaIds: ev.people.map((p) => p.id),
    };
    ev.rounds.push(round);
    return round;
  });
}

export function removeRound(eventId, roundId) {
  return mutateEvent(eventId, (ev) => {
    ev.rounds = ev.rounds.filter((r) => r.id !== roundId);
  });
}
