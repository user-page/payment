/**
 * Người tham gia và ảnh QR chuyển khoản của họ.
 */
import { sb } from './client.js';
import { QR_BUCKET } from '../config.js';

export async function addPerson(eventId, name) {
  const res = await sb.from('ctn_people').insert({ event_id: eventId, name }).select().single();
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function removePerson(personId) {
  const res = await sb.from('ctn_people').delete().eq('id', personId);
  if (res.error) throw new Error(res.error.message);
}

export async function updatePerson(personId, patch) {
  const res = await sb.from('ctn_people').update(patch).eq('id', personId);
  if (res.error) throw new Error(res.error.message);
}

/**
 * Ghi nhận số tiền một người đã trả.
 *
 * Tự đánh dấu đã trả xong khi số tiền trả đủ hoặc vượt khoản phải trả —
 * để hai chỗ hiển thị không mâu thuẫn nhau.
 */
export async function setPaidAmount(personId, amount, owedAmount) {
  const paid = Math.max(0, Math.round(Number(amount) || 0));
  await updatePerson(personId, {
    paid_amount: paid,
    is_paid: owedAmount > 0 && paid >= owedAmount,
  });
}

/** Bật/tắt trạng thái đã trả; bật thì coi như trả đủ, tắt thì về 0. */
export async function setPaidFlag(personId, isPaid, owedAmount) {
  await updatePerson(personId, {
    is_paid: isPaid,
    paid_amount: isPaid ? owedAmount : 0,
  });
}

/** Tải ảnh QR lên kho lưu trữ, trả về đường dẫn công khai. */
export async function uploadQr(eventId, personId, blob) {
  const path = `${eventId}/${personId}-${Date.now()}.png`;

  const up = await sb.storage.from(QR_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/png',
  });
  if (up.error) throw new Error(up.error.message);

  const { data } = sb.storage.from(QR_BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  await updatePerson(personId, { qr_url: url });
  return url;
}

export async function clearQr(personId) {
  await updatePerson(personId, { qr_url: null });
}
