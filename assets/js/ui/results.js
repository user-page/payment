/**
 * Tab "Các buổi nhậu": danh sách buổi và bảng kết quả của buổi đang chọn.
 *
 * Việc đánh dấu ai đã trả tiền ghi ngay — đó là hành động ghi nhận sự thật đã
 * xảy ra ngoài đời, không phải bản nháp đang soạn.
 */
import { byId, el, copyText, showQrModal } from '../utils/dom.js';
import { fmtNum, escapeHtml } from '../utils/format.js';
import {
  computeSummary,
  computeSettlement,
  totalSpent,
  totalSponsored,
  personName,
} from '../domain/settlement.js';
import { getState, effectiveEvent } from '../core/store.js';
import { eventResultsHtml } from './resultsView.js';

let actions = {};

export function initResults(handlers) {
  actions = handlers;
}

export function renderEventList() {
  const { events, currentEventId, isAdmin, user } = getState();
  const body = byId('eventListBody');
  body.innerHTML = '';

  if (!events.length) {
    body.innerHTML = '<div class="empty-state">Chưa có buổi nhậu nào — sang tab "+ Tạo mới" để bắt đầu.</div>';
    return;
  }

  const list = el('div', { class: 'event-list' });

  for (const e of events) {
    const card = el('div', {
      class: `event-card${e.id === currentEventId ? ' is-active' : ''}`,
      onclick: () => {
        if (e.id === currentEventId) return;
        actions.onSelectEvent(e.id);
      },
    }, [el('span', { class: 'name', textContent: e.name || 'Buổi chưa đặt tên' })]);

    if (e.event_date) card.append(el('span', { class: 'meta', textContent: e.event_date }));
    if (isAdmin && e.owner_id !== user?.id) {
      card.append(el('span', { class: 'meta', textContent: e.owner_username || e.owner_email || '' }));
    }
    card.append(
      el('span', {
        class: 'view-hint',
        textContent: e.id === currentEventId ? 'Đang xem' : 'Xem chi tiết →',
      })
    );

    list.append(card);
  }

  body.append(list);
}

export function renderResults() {
  const ev = effectiveEvent();
  const body = byId('resultsBody');

  if (!ev) {
    setStats(null);
    body.innerHTML = '<div class="empty-state">Chưa có buổi nhậu nào — tạo buổi mới ở tab "+ Tạo mới".</div>';
    return;
  }

  setStats(ev);

  if (!ev.people.length || !ev.rounds.length) {
    body.innerHTML = '<div class="empty-state">Thêm người và ít nhất một khoản chi để xem kết quả.</div>';
    return;
  }
  if (!ev.organizerId) {
    body.innerHTML = '<div class="empty-state">Chọn người đứng ra chia tiền ở mục "Người tham gia" để xem cách thanh toán.</div>';
    return;
  }

  body.innerHTML =
    eventResultsHtml(ev, { interactive: true, extraHtml: organizerQrHtml(ev) }) +
    `<div class="results-footer">
       <span class="toast" id="copyToast">Đã sao chép</span>
       <button class="btn btn-ghost btn-small" id="shareBtn" type="button">Chia sẻ (chỉ xem)</button>
       <button class="btn btn-small" id="copyBtn" type="button">Sao chép kết quả</button>
     </div>`;

  wireResultActions(ev);
}

function setStats(ev) {
  const spent = ev ? totalSpent(ev) : 0;
  const sponsored = ev ? totalSponsored(ev) : 0;
  byId('statTotal').textContent = fmtNum(spent);
  byId('statSponsor').textContent = fmtNum(sponsored);
  byId('statNet').textContent = fmtNum(Math.max(0, spent - sponsored));
  byId('statRounds').textContent = String(ev?.rounds.length ?? 0);
  byId('statPeople').textContent = String(ev?.people.length ?? 0);
}

function organizerQrHtml(ev) {
  const organizer = ev.people.find((p) => p.id === ev.organizerId);
  if (!organizer?.qr) return '';
  return `<div class="organizer-qr-card">
    <img id="organizerQrImg" src="${organizer.qr}" alt="QR chuyển khoản cho ${escapeHtml(organizer.name)}" />
    <div class="organizer-qr-caption">Quét QR để chuyển khoản trực tiếp cho <strong>${escapeHtml(organizer.name)}</strong></div>
  </div>`;
}

function wireResultActions(ev) {
  const organizer = ev.people.find((p) => p.id === ev.organizerId);

  byId('organizerQrImg')?.addEventListener('click', (e) => {
    showQrModal(e.target.src, organizer?.name);
  });

  byId('copyBtn').addEventListener('click', () => copyResults(ev));
  byId('shareBtn').addEventListener('click', () => actions.onShareEvent(ev));

  for (const btn of byId('resultsBody').querySelectorAll('.paid-toggle')) {
    btn.addEventListener('click', () => {
      const person = ev.people.find((p) => p.id === btn.dataset.personId);
      btn.disabled = true;
      actions.onTogglePaid(btn.dataset.personId, !person?.isPaid, Number(btn.dataset.amount) || 0);
    });
  }

  for (const input of byId('resultsBody').querySelectorAll('.paid-amount-input')) {
    input.addEventListener('change', () => {
      input.disabled = true;
      actions.onSetPaidAmount(input.dataset.personId, input.value, Number(input.dataset.amount) || 0);
    });
  }
}

// -------------------------------------------------------- sao chép ra text

/** Bản tóm tắt dạng chữ để dán vào Zalo/Messenger. */
function buildResultsText(ev) {
  const summary = computeSummary(ev);
  const settlement = computeSettlement(ev, summary);
  const spent = totalSpent(ev);
  const lines = [];

  lines.push(`CHIA TIỀN NHẬU — ${ev.name || 'Buổi nhậu'}`);
  lines.push(`Tổng chi: ${fmtNum(spent)} nghìn đồng · ${ev.people.length} người · ${ev.rounds.length} khoản`);
  lines.push(`Người chia tiền: ${personName(ev, ev.organizerId)}`);

  if (ev.sponsors.length) {
    lines.push('', 'Tài trợ / bao thêm:');
    for (const sp of ev.sponsors) {
      const trangThai = sp.isPaid ? '' : ' [chưa đưa tiền]';
      lines.push(`- ${sp.ten}: ${fmtNum(sp.soTien)}${sp.ghiChu ? ` (${sp.ghiChu})` : ''}${trangThai}`);
    }
    lines.push(
      `Tổng tài trợ: ${fmtNum(summary.totalSponsor)} → còn phải chia: ${fmtNum(Math.max(0, spent - summary.totalSponsor))} (đã trừ đều cho mỗi người).`
    );
  }

  lines.push('', 'Các khoản:');
  for (const r of ev.rounds) {
    const meta = [r.ngay, r.diaDiem].filter(Boolean).join(' · ');
    lines.push(`- ${r.ten || 'Khoản'}: ${fmtNum(r.soTien)} (trả: ${personName(ev, r.nguoiTraId)}${meta ? `, ${meta}` : ''})`);
  }

  lines.push('', 'Tổng hợp từng người (đã trả / phải trả / chênh lệch):');
  for (const p of ev.people) {
    const bal = summary.chenhLech[p.id];
    lines.push(`- ${p.name}: ${fmtNum(summary.daTra[p.id])} / ${fmtNum(summary.phaiTra[p.id])} / ${bal > 0 ? '+' : ''}${fmtNum(bal)}`);
  }

  lines.push('');
  if (!settlement.length) {
    lines.push('Không cần chuyển khoản thêm.');
  } else {
    lines.push('Cần chuyển khoản:');
    for (const s of settlement) {
      lines.push(`- ${personName(ev, s.fromId)} -> ${personName(ev, s.toId)}: ${fmtNum(s.amount)}`);
    }
  }

  return lines.join('\n');
}

async function copyResults(ev) {
  const ok = await copyText(buildResultsText(ev));
  if (ok) showToast('Đã sao chép');
}

export function showToast(message) {
  const toast = byId('copyToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}
