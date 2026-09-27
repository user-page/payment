/**
 * Khoản tài trợ / bao thêm.
 */
import { newId } from './client.js';
import { mutateEvent } from './events.js';

export function addSponsor(eventId, { ten, soTien, ghiChu, personId, stillSplit, isPaid }) {
  return mutateEvent(eventId, (ev) => {
    ev.sponsors.push({
      id: newId(),
      ten,
      soTien,
      ghiChu: ghiChu || '',
      personId: personId || null,
      stillSplit: stillSplit !== false,
      isPaid: !!isPaid,
    });
  });
}

/** Sửa khoản tài trợ, VD: { isPaid: true } hoặc { stillSplit: false }. */
export function updateSponsor(eventId, sponsorId, patch) {
  return mutateEvent(eventId, (ev) => {
    const sp = ev.sponsors.find((s) => s.id === sponsorId);
    if (sp) Object.assign(sp, patch);
  });
}

export function removeSponsor(eventId, sponsorId) {
  return mutateEvent(eventId, (ev) => {
    ev.sponsors = ev.sponsors.filter((s) => s.id !== sponsorId);
  });
}
