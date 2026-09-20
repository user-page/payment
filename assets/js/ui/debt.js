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
    // Tải tuần tự cho nhẹ tải database; số buổi của một người luôn nhỏ.
    const events = [];
    for (const row of rows) {
      const ev = await loadEvent(row.id);
      if (ev) events.push(ev);
    }

    status.textContent = '';
    body.innerHTML = debtTableHtml(aggregateUnpaidDebts(events));
  } catch (err) {
    console.error('computeDebt', err);
    status.textContent = 'Có lỗi khi tính tổng nợ, thử lại.';
  } finally {
    btn.disabled = false;
  }
}
