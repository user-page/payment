/**
 * Các khoản đã chi (tăng 1, tăng 2, taxi...) và ai tham gia khoản nào.
 */
import { sb } from './client.js';
import { today } from '../utils/format.js';

/**
 * Thêm khoản chi mới. Mặc định cho cả nhóm tham gia và lấy ngày của khoản
 * trước đó — vì các tăng thường cùng một đêm.
 */
export async function addRound(eventId, { index, people, organizerId, lastRound }) {
  const res = await sb
    .from('ctn_rounds')
    .insert({
      event_id: eventId,
      ten: `Tăng ${index + 1}`,
      ngay: lastRound?.ngay || today(),
      dia_diem: '',
      so_tien: 0,
      nguoi_tra_id: organizerId || people[0]?.id || null,
      sort_order: index,
    })
    .select()
    .single();

  if (res.error) throw new Error(res.error.message);

  if (people.length) {
    const rows = people.map((p) => ({ round_id: res.data.id, person_id: p.id }));
    const link = await sb.from('ctn_round_participants').insert(rows);
    if (link.error) throw new Error(link.error.message);
  }
  return res.data;
}

export async function updateRound(roundId, patch) {
  const res = await sb.from('ctn_rounds').update(patch).eq('id', roundId);
  if (res.error) throw new Error(res.error.message);
}

export async function removeRound(roundId) {
  const res = await sb.from('ctn_rounds').delete().eq('id', roundId);
  if (res.error) throw new Error(res.error.message);
}

/**
 * Đặt lại danh sách người tham gia một khoản cho khớp `personIds`.
 *
 * Chỉ ghi phần chênh lệch so với `currentIds` thay vì xoá sạch rồi thêm lại,
 * để không tạo rác và không mất dữ liệu nếu nửa chừng lỗi mạng.
 */
export async function setParticipants(roundId, personIds, currentIds) {
  const want = new Set(personIds);
  const have = new Set(currentIds);

  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toAdd.length) {
    const res = await sb
      .from('ctn_round_participants')
      .insert(toAdd.map((personId) => ({ round_id: roundId, person_id: personId })));
    if (res.error) throw new Error(res.error.message);
  }

  if (toRemove.length) {
    const res = await sb
      .from('ctn_round_participants')
      .delete()
      .eq('round_id', roundId)
      .in('person_id', toRemove);
    if (res.error) throw new Error(res.error.message);
  }
}
