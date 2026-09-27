/**
 * Quy đổi giữa tên đăng nhập và email ẩn của Firebase.
 *
 * Tên `Anh Nam` → slug `anh-nam` → email `anh-nam@ctn.example.com`.
 * Luật tạo slug giữ y hệt bản Supabase cũ để ai quen tên nào vẫn gõ tên đó.
 */
import { LOGIN_EMAIL_DOMAIN, ADMIN_USERNAME } from '../config.js';
import { slugify } from '../utils/format.js';
import { auth } from './client.js';

export { slugify };

export const emailFor = (username) => `${slugify(username)}@${LOGIN_EMAIL_DOMAIN}`;

/** Lấy lại tên đăng nhập từ email; email lạ (không phải của app) thì trả ''. */
export function usernameOf(email) {
  const [name, domain] = String(email || '').split('@');
  return domain === LOGIN_EMAIL_DOMAIN ? name : '';
}

export const isAdminUsername = (username) => username === ADMIN_USERNAME;

/** Người đang đăng nhập, hoặc null. */
export function currentIdentity() {
  const u = auth.currentUser;
  if (!u) return null;
  const username = usernameOf(u.email);
  return { id: u.uid, email: u.email, username, isAdmin: isAdminUsername(username) };
}
