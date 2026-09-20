/**
 * Khoản tài trợ / bao thêm.
 */
import { sb } from './client.js';

export async function addSponsor(eventId, { ten, soTien, ghiChu, personId, stillSplit, isPaid }) {
  const res = await sb.from('ctn_sponsors').insert({
    event_id: eventId,
    ten,
    so_tien: soTien,
    ghi_chu: ghiChu || '',
    person_id: personId || null,
    still_split: stillSplit !== false,
    is_paid: !!isPaid,
  });
  if (res.error) throw new Error(res.error.message);
}

export async function updateSponsor(sponsorId, patch) {
  const res = await sb.from('ctn_sponsors').update(patch).eq('id', sponsorId);
  if (res.error) throw new Error(res.error.message);
}

export async function removeSponsor(sponsorId) {
  const res = await sb.from('ctn_sponsors').delete().eq('id', sponsorId);
  if (res.error) throw new Error(res.error.message);
}
