/**
 * Ghi bản nháp xuống database.
 *
 * Tách riêng khỏi store.js để store chỉ giữ trạng thái trong bộ nhớ, không
 * biết gì về database.
 */
import { applyDraft } from '../data/events.js';
import { getState, draftEntries } from './store.js';

/**
 * Ghi toàn bộ thay đổi đang chờ, trong một giao dịch duy nhất: hoặc lưu đủ
 * hết, hoặc không lưu gì.
 *
 * @returns {Promise<{saved:number}>}
 * @throws nếu ghi thất bại (khi đó database giữ nguyên như trước)
 */
export async function saveDraft() {
  const { currentEventId } = getState();
  const entries = draftEntries();
  if (!currentEventId || !entries.length) return { saved: 0 };

  const saved = await applyDraft(currentEventId, entries);
  return { saved };
}
