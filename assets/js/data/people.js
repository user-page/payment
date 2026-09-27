/**
 * Người tham gia và ảnh QR chuyển khoản của họ.
 */
import { newId } from './client.js';
import { mutateEvent, qrRef } from './events.js';
import { QR_MAX_BYTES } from '../config.js';

/**
 * Thêm người vào buổi. Người đầu tiên mặc định đứng ra chia tiền, đỡ một
 * bước thao tác.
 */
export function addPerson(eventId, name) {
  return mutateEvent(eventId, (ev) => {
    const person = { id: newId(), name, hasQr: false, isPaid: false, paidAmount: 0 };
    ev.people.push(person);
    if (!ev.organizerId) ev.organizerId = person.id;
    return person;
  });
}

/**
 * Xoá người khỏi buổi. Các chỗ đang trỏ tới họ (tham gia khoản nào, ai trả,
 * người chia tiền, tài trợ) được dọn tự động trong mutateEvent.
 */
export function removePerson(eventId, personId) {
  return mutateEvent(eventId, (ev, tx) => {
    const person = ev.people.find((p) => p.id === personId);
    if (person?.hasQr) tx.delete(qrRef(personId));
    ev.people = ev.people.filter((p) => p.id !== personId);
  });
}

function updatePerson(eventId, personId, patch) {
  return mutateEvent(eventId, (ev) => {
    const person = ev.people.find((p) => p.id === personId);
    if (person) Object.assign(person, patch);
  });
}

/**
 * Ghi nhận số tiền một người đã trả.
 *
 * Tự đánh dấu đã trả xong khi số tiền trả đủ hoặc vượt khoản phải trả —
 * để hai chỗ hiển thị không mâu thuẫn nhau.
 */
export function setPaidAmount(eventId, personId, amount, owedAmount) {
  const paid = Math.max(0, Math.round(Number(amount) || 0));
  return updatePerson(eventId, personId, {
    paidAmount: paid,
    isPaid: owedAmount > 0 && paid >= owedAmount,
  });
}

/** Bật/tắt trạng thái đã trả; bật thì coi như trả đủ, tắt thì về 0. */
export function setPaidFlag(eventId, personId, isPaid, owedAmount) {
  return updatePerson(eventId, personId, {
    isPaid,
    paidAmount: isPaid ? owedAmount : 0,
  });
}

/** Đọc ảnh thành chuỗi data URL để lưu thẳng vào database. */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(blob);
  });
}

/** Lưu ảnh QR của một người (ghi đè ảnh cũ nếu có). */
export async function uploadQr(eventId, personId, blob) {
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > QR_MAX_BYTES) {
    throw new Error('Ảnh QR quá nặng — chụp/cắt gọn lại phần mã QR rồi thử lại.');
  }

  await mutateEvent(eventId, (ev, tx) => {
    const person = ev.people.find((p) => p.id === personId);
    if (!person) throw new Error('Người này không còn trong buổi.');
    person.hasQr = true;
    tx.set(qrRef(personId), { ownerId: ev.ownerId, eventId, dataUrl });
  });
}

export function clearQr(eventId, personId) {
  return mutateEvent(eventId, (ev, tx) => {
    const person = ev.people.find((p) => p.id === personId);
    if (person) person.hasQr = false;
    tx.delete(qrRef(personId));
  });
}
