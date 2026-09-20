/**
 * Đọc/ghi buổi nhậu và toàn bộ dữ liệu con của nó.
 *
 * Tầng này cũng là nơi DUY NHẤT dịch giữa tên cột trong database
 * (snake_case, tiếng Việt không dấu) và tên thuộc tính dùng trong app
 * (camelCase). Nhờ vậy đổi tên cột chỉ phải sửa ở đây.
 */
import { sb } from './client.js';
import { today } from '../utils/format.js';

/** Chuyển một dòng ctn_people thành dạng app dùng. */
function toPerson(row) {
  return {
    id: row.id,
    name: row.name,
    qr: row.qr_url,
    isPaid: !!row.is_paid,
    paidAmount: Number(row.paid_amount) || 0,
  };
}

/** Chuyển một dòng ctn_rounds thành dạng app dùng. */
function toRound(row, thamGiaIds) {
  return {
    id: row.id,
    ten: row.ten,
    ngay: row.ngay || '',
    diaDiem: row.dia_diem || '',
    soTien: row.so_tien,
    nguoiTraId: row.nguoi_tra_id,
    thamGiaIds,
  };
}

/** Chuyển một dòng ctn_sponsors thành dạng app dùng. */
function toSponsor(row) {
  return {
    id: row.id,
    ten: row.ten,
    soTien: row.so_tien,
    ghiChu: row.ghi_chu || '',
    personId: row.person_id || null,
    stillSplit: row.still_split !== false,
    isPaid: !!row.is_paid,
  };
}

/** Danh sách buổi nhậu xem được, mới nhất trước. */
export async function listEvents() {
  const res = await sb.from('ctn_events').select('*').order('created_at', { ascending: false });
  if (res.error) {
    console.error('listEvents', res.error);
    return [];
  }
  return res.data || [];
}

/** Nạp đầy đủ một buổi nhậu: người, khoản chi, ai tham gia khoản nào, tài trợ. */
export async function loadEvent(eventId) {
  const [eventRes, peopleRes, roundsRes, sponsorsRes] = await Promise.all([
    sb.from('ctn_events').select('*').eq('id', eventId).single(),
    sb.from('ctn_people').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
    sb.from('ctn_rounds').select('*').eq('event_id', eventId).order('sort_order', { ascending: true }),
    sb.from('ctn_sponsors').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
  ]);

  if (eventRes.error || peopleRes.error || roundsRes.error || sponsorsRes.error) {
    console.error('loadEvent', eventRes.error || peopleRes.error || roundsRes.error || sponsorsRes.error);
    return null;
  }

  const rounds = roundsRes.data || [];
  const participantsByRound = await loadParticipants(rounds.map((r) => r.id));
  const e = eventRes.data;

  return {
    id: e.id,
    name: e.name,
    eventDate: e.event_date || '',
    organizerId: e.organizer_person_id,
    ownerId: e.owner_id,
    ownerUsername: e.owner_username || e.owner_email,
    people: (peopleRes.data || []).map(toPerson),
    rounds: rounds.map((r) => toRound(r, participantsByRound[r.id] || [])),
    sponsors: (sponsorsRes.data || []).map(toSponsor),
  };
}

/** Bảng nối khoản chi <-> người tham gia. */
async function loadParticipants(roundIds) {
  const byRound = {};
  if (!roundIds.length) return byRound;

  const res = await sb.from('ctn_round_participants').select('*').in('round_id', roundIds);
  if (res.error) {
    console.error('loadParticipants', res.error);
    return byRound;
  }
  for (const row of res.data || []) {
    (byRound[row.round_id] ||= []).push(row.person_id);
  }
  return byRound;
}

/** Tạo buổi nhậu mới, trả về dòng vừa tạo. */
export async function createEvent({ name, eventDate, user }) {
  const res = await sb
    .from('ctn_events')
    .insert({
      owner_id: user.id,
      owner_email: user.email,
      owner_username: user.username,
      event_date: eventDate || today(),
      name: name || 'Buổi nhậu mới',
    })
    .select()
    .single();

  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function updateEvent(eventId, patch) {
  const res = await sb.from('ctn_events').update(patch).eq('id', eventId);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteEvent(eventId) {
  const res = await sb.from('ctn_events').delete().eq('id', eventId);
  if (res.error) throw new Error(res.error.message);
}
