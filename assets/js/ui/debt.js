/**
 * Tab "Ai chưa trả": cộng dồn nợ của từng người qua tất cả các buổi.
 */
import { byId } from '../utils/dom.js';
import { listEvents, loadEvent } from '../data/events.js';
import { aggregateUnpaidDebts } from '../domain/settlement.js';
import { debtTableHtml } from './resultsView.js';

let actions = {};

export function initDebt(handlers) {
  actions = handlers;
  byId('calcDebtBtn').addEventListener('click', computeDebt);
  byId('shareAllBtn').addEventListener('click', () => actions.onShareAll());
}

async function computeDebt() {
  const btn = byId('calcDebtBtn');
  const status = byId('debtStatus');
  const body = byId('debtBody');

  btn.disabled = true;
  status.textContent = 'Đang tính...';
  body.innerHTML = '';

  try {
    const rows = await listEvents();
    // Tải tuần tự cho nhẹ; số buổi của một người luôn nhỏ.
    const events = [];
    for (const row of rows) {
      const ev = await loadEvent(row.id, { withQr: false }); // tính nợ không cần ảnh
      if (ev) events.push(ev);
    }

    // Buổi chưa chọn người chia tiền thì không quy được nợ về ai — nói rõ ra,
    // vì nếu không, bảng trống trơn nhìn y như "không ai nợ gì".
    const skipped = events.filter((ev) => !ev.organizerId);
    status.textContent = skipped.length
      ? `Bỏ qua ${skipped.length} buổi chưa chọn người đứng ra chia tiền: ${skipped
          .map((ev) => ev.name || 'buổi chưa đặt tên')
          .join(', ')}`
      : '';

    body.innerHTML = debtTableHtml(aggregateUnpaidDebts(events));
  } catch (err) {
    console.error('computeDebt', err);
    status.textContent = err.message || 'Có lỗi khi tính tổng nợ, thử lại.';
  } finally {
    btn.disabled = false;
  }
}
