/**
 * Đăng nhập chỉ bằng tên, không cần email cũng không cần mật khẩu.
 *
 * Cách chạy: tên được đổi thành một email ẩn (<ten>@ctn.example.com) với mật
 * khẩu dùng chung. Đăng nhập thử; chưa có tài khoản thì tạo luôn. Tất cả chạy
 * trong trình duyệt, không cần hàm máy chủ nào.
 *
 * Đổi lại sự tiện lợi này là app KHÔNG có bảo mật thật giữa các tài khoản:
 * ai biết tên đăng nhập của bạn đều vào được. Chấp nhận được với một nhóm bạn
 * chia tiền nhậu, không dùng cho dữ liệu nhạy cảm.
 */
import {
  auth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, onAuthStateChanged,
} from '../data/client.js';
import { slugify, emailFor, currentIdentity } from '../data/identity.js';
import { SHARED_LOGIN_PASSWORD } from '../config.js';

/** Dịch mã lỗi của Firebase sang câu tiếng Việt người dùng hiểu được. */
function translateError(err) {
  const code = err?.code || '';
  if (code === 'auth/network-request-failed') return 'Không kết nối được, kiểm tra mạng rồi thử lại.';
  if (code === 'auth/too-many-requests') return 'Thử lại sau ít phút (đăng nhập quá nhiều lần).';
  if (code === 'auth/operation-not-allowed') return 'Firebase chưa bật đăng nhập Email/Password — xem README.';
  if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') {
    return 'Cấu hình Firebase trong config.js chưa đúng.';
  }
  return err?.message || 'Có lỗi xảy ra, thử lại.';
}

/** Firebase trả các mã này khi chưa có tài khoản (tuỳ có bật chống dò email hay không). */
const NOT_FOUND = new Set(['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials']);

/**
 * Đăng nhập bằng tên; lần đầu dùng tên đó thì tự tạo tài khoản.
 * @throws {Error} với thông điệp tiếng Việt đã dịch sẵn
 */
export async function signInWithUsername(username) {
  const slug = slugify(username);
  if (slug.length < 2) throw new Error('Tên đăng nhập cần ít nhất 2 ký tự chữ/số.');

  const email = emailFor(slug);

  try {
    await signInWithEmailAndPassword(auth, email, SHARED_LOGIN_PASSWORD);
    return;
  } catch (err) {
    if (!NOT_FOUND.has(err?.code)) throw new Error(translateError(err));
  }

  try {
    await createUserWithEmailAndPassword(auth, email, SHARED_LOGIN_PASSWORD);
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      throw new Error('Tên này đã có người dùng nhưng không đăng nhập được — báo admin kiểm tra.');
    }
    throw new Error(translateError(err));
  }
}

export async function signOut() {
  await fbSignOut(auth);
}

/**
 * Tài khoản đang đăng nhập: tên hiển thị và cờ admin.
 * Quyền admin thật do firestore.rules quyết định; cờ ở đây chỉ để vẽ giao diện.
 */
export function loadProfile() {
  const me = currentIdentity();
  return {
    user: { id: me.id, email: me.email, username: me.username },
    isAdmin: me.isAdmin,
  };
}

/**
 * Gọi `handler(session)` mỗi khi trạng thái đăng nhập đổi, kể cả lần đầu nạp
 * trang. `session` là null khi chưa đăng nhập.
 */
export function watchSession(handler) {
  onAuthStateChanged(auth, (user) => handler(user ? { user } : null));
}
