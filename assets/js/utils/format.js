/**
 * Định dạng và làm sạch dữ liệu hiển thị.
 */

/** Số tiền luôn là số nguyên nghìn đồng, không dấu phân cách, không thập phân. */
export function fmtNum(n) {
  return String(Math.round(n || 0));
}

/** Đọc số tiền người dùng gõ, bỏ mọi ký tự không phải chữ số. */
export function parseMoney(str) {
  const digits = String(str ?? '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Chống XSS: mọi dữ liệu người dùng nhập phải đi qua đây trước khi ghép
 * vào chuỗi HTML.
 */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/** Ngày hôm nay dạng YYYY-MM-DD, dùng cho ô chọn ngày. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Bỏ dấu tiếng Việt, chuyển thành slug — khớp với hàm slugify ở edge function. */
export function slugify(input) {
  let s = String(input || '').toLowerCase().replace(/đ/g, 'd');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 40);
}
