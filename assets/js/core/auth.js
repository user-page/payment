/**
 * Đăng nhập chỉ bằng tên, không cần email cũng không cần mật khẩu.
 *
 * Cách chạy: edge function `username-login` tạo (hoặc tìm) một tài khoản ẩn
 * dạng <ten>@ctn.local với mật khẩu dùng chung, rồi trả về email đó để trình
 * duyệt đăng nhập như bình thường.
 *
 * Đổi lại sự tiện lợi này là app KHÔNG có bảo mật thật giữa các tài khoản:
 * ai biết tên đăng nhập của bạn đều vào được. Chấp nhận được với một nhóm bạn
 * chia tiền nhậu, không dùng cho dữ liệu nhạy cảm.
 */
import { sb } from '../data/client.js';
import { SHARED_LOGIN_PASSWORD } from '../config.js';

/** Dịch lỗi của Supabase sang câu tiếng Việt người dùng hiểu được. */
function translateError(error) {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Không đăng nhập được, thử lại.';
  if (/rate limit/i.test(msg)) return 'Thử lại sau ít phút (giới hạn tần suất).';
  return msg || 'Có lỗi xảy ra, thử lại.';
}

/**
 * Đăng nhập bằng tên.
 * @throws {Error} với thông điệp tiếng Việt đã dịch sẵn
 */
export async function signInWithUsername(username) {
  const name = String(username || '').trim();
  if (!name) throw new Error('Nhập tên đăng nhập đã.');

  let fnRes;
  try {
    fnRes = await sb.functions.invoke('username-login', { body: { username: name } });
  } catch {
    throw new Error('Không kết nối được, thử lại.');
  }

  if (fnRes.error || fnRes.data?.error) {
    throw new Error(fnRes.data?.error || 'Không kết nối được, thử lại.');
  }

  const res = await sb.auth.signInWithPassword({
    email: fnRes.data.email,
    password: SHARED_LOGIN_PASSWORD,
  });
  if (res.error) throw new Error(translateError(res.error));
}

export async function signOut() {
  await sb.auth.signOut();
}

/** Hồ sơ đi kèm tài khoản: tên hiển thị và cờ admin. */
export async function loadProfile(session) {
  const userId = session.user.id;
  const res = await sb.from('ctn_profiles').select('is_admin, username').eq('id', userId).single();

  return {
    user: {
      id: userId,
      email: session.user.email,
      username: res.data?.username || session.user.user_metadata?.username || '',
    },
    isAdmin: !!res.data?.is_admin,
  };
}

/** Gọi `handler` mỗi khi trạng thái đăng nhập đổi, và một lần ngay lúc nạp trang. */
export function watchSession(handler) {
  sb.auth.onAuthStateChange((_event, session) => handler(session));
  sb.auth.getSession().then((res) => handler(res.data.session));
}
