/**
 * Kết nối Supabase dùng chung. Mọi module khác lấy client từ đây,
 * không tự tạo client riêng.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

if (!window.supabase?.createClient) {
  throw new Error('Chưa nạp được thư viện Supabase — kiểm tra thẻ script trong index.html.');
}

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Gọi edge function công khai (không cần đăng nhập) bằng fetch thường,
 * vì sb.functions.invoke luôn đính kèm token của phiên hiện tại.
 */
export async function callPublicFunction(name, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}?${qs}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error || 'Không tải được dữ liệu.');
  }
  return data;
}
