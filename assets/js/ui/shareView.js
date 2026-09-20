/**
 * Chế độ chỉ-xem: mở bằng link chia sẻ, không cần đăng nhập.
 *
 * Hai kiểu link:
 *   ?share=<id buổi>       một buổi nhậu
 *   ?shareAll=<tên đăng nhập>  tổng hợp mọi buổi của một người
 *
 * Dữ liệu lấy qua edge function công khai, không qua bảng trực tiếp — nhờ vậy
 * người xem không cần tài khoản mà cũng không đọc được gì ngoài phần được chia sẻ.
 */
import { byId, el } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { callPublicFunction } from '../data/client.js';
import { aggregateUnpaidDebts } from '../domain/settlement.js';
import { eventResultsHtml, debtTableHtml } from './resultsView.js';

/** Link chia sẻ luôn bám theo địa chỉ trang hiện tại, nên đổi host vẫn đúng. */
export function shareLink(param, value) {
  return `${location.origin}${location.pathname}?${param}=${encodeURIComponent(value)}`;
}

/** Đọc tham số chia sẻ trên URL; trả về null nếu là phiên bình thường. */
export function readShareTarget() {
  let params;
  try {
    params = new URLSearchParams(location.search);
  } catch {
    return null;
  }
  const eventId = params.get('share');
  if (eventId) return { kind: 'event', value: eventId };

  const username = params.get('shareAll');
  if (username) return { kind: 'owner', value: username };

  return null;
}

function enterShareMode() {
  byId('loadingNote').hidden = true;
  byId('authSection').hidden = true;
  byId('mainApp').hidden = true;

  const view = byId('shareView');
  view.hidden = false;
  view.innerHTML = '<div class="loading-note">Đang tải...</div>';
  return view;
}

function shareHeader(title, subtitle) {
  return `<header class="topbar">
    <p class="eyebrow">Xem trước &middot; chỉ đọc, không cần đăng nhập</p>
    <h1 class="title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
    <p class="unit-note">Đơn vị tiền: <strong>nghìn đồng</strong> — link này chỉ để xem, không sửa được.</p>
  </header>`;
}

const SHARE_FOOTER =
  '<footer class="note">Đây là link chỉ-xem — không cần đăng nhập, không sửa được dữ liệu.</footer>';

/** Hiển thị một buổi nhậu. */
export async function showSharedEvent(eventId) {
  const view = enterShareMode();
  try {
    const ev = await callPublicFunction('public-event-view', { id: eventId });
    view.innerHTML =
      shareHeader(ev.name || 'Buổi nhậu', ev.eventDate ? `Ngày nhậu: ${ev.eventDate}` : '') +
      eventResultsHtml(ev) +
      SHARE_FOOTER;
  } catch (err) {
    view.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

/** Hiển thị tổng hợp mọi buổi của một người. */
export async function showSharedOwner(username) {
  const view = enterShareMode();

  let data;
  try {
    data = await callPublicFunction('public-owner-view', { username });
  } catch (err) {
    view.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    return;
  }

  const events = data.events || [];
  const header = shareHeader(`Tổng hợp của ${data.ownerUsername || ''}`, '');

  if (!events.length) {
    view.innerHTML = `${header}<div class="empty-state">Chưa có buổi nhậu nào.</div>`;
    return;
  }

  const cards = events
    .map((ev, i) => {
      const meta = [ev.eventDate, `${(ev.people || []).length} người`].filter(Boolean).join(' · ');
      return `<div class="event-card is-expandable">
        <button type="button" class="event-card-toggle" data-index="${i}">
          <span class="name">${escapeHtml(ev.name || 'Buổi chưa đặt tên')}</span>
          <span class="meta">${escapeHtml(meta)}</span>
          <span class="view-hint">Xem chi tiết ▾</span>
        </button>
        <div class="event-card-detail" id="shareDetail${i}" hidden></div>
      </div>`;
    })
    .join('');

  view.innerHTML = `${header}
    <section class="debt-section" style="margin-top:20px;">
      <h2 style="margin-top:0;">Ai chưa trả (tổng hợp tất cả buổi)</h2>
      ${debtTableHtml(aggregateUnpaidDebts(events))}
    </section>
    <section class="event-list-section" style="margin-top:20px;">
      <h2 style="margin-top:0;">Các buổi nhậu</h2>
      <div class="event-list">${cards}</div>
    </section>
    ${SHARE_FOOTER}`;

  // Chi tiết từng buổi chỉ dựng khi bấm mở, đỡ nặng khi có nhiều buổi.
  for (const btn of view.querySelectorAll('.event-card-toggle')) {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      const detail = byId(`shareDetail${index}`);
      const hint = btn.querySelector('.view-hint');

      if (detail.hidden) {
        if (!detail.dataset.rendered) {
          detail.innerHTML = eventResultsHtml(events[index]);
          detail.dataset.rendered = '1';
        }
        detail.hidden = false;
        hint.textContent = 'Ẩn chi tiết ▴';
      } else {
        detail.hidden = true;
        hint.textContent = 'Xem chi tiết ▾';
      }
    });
  }
}

/** Điều hướng theo tham số trên URL. Trả về true nếu đang ở chế độ chia sẻ. */
export function handleShareRoute() {
  const target = readShareTarget();
  if (!target) return false;

  if (target.kind === 'event') showSharedEvent(target.value);
  else showSharedOwner(target.value);

  return true;
}
