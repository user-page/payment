/**
 * Cấu hình tập trung. Sửa kết nối database ở đây, không rải rác trong code.
 */

export const SUPABASE_URL = 'https://waspavioedptudetycqp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_VkvD3ZlbzhEA52AK0_zkuQ_ee6pI4RT';

/**
 * Mật khẩu dùng chung cho cơ chế đăng nhập chỉ-bằng-tên.
 *
 * Đây KHÔNG phải lớp bảo mật: ai đọc mã nguồn trang web cũng thấy được.
 * Nó chỉ để phân biệt người dùng với nhau trong một nhóm bạn bè tin nhau.
 * Muốn bảo mật thật thì phải đổi sang đăng nhập có mật khẩu riêng từng người.
 */
export const SHARED_LOGIN_PASSWORD = 'Ctn-Nhau-2026-xk9!';

/** Tên đăng nhập có quyền xem dữ liệu của mọi người. */
export const ADMIN_USERNAME = 'vthang1510';

/** Tên gợi ý sẵn trong ô chọn nhanh khi thêm người tham gia. */
export const QUICK_NAMES = [
  'HungNN14',
  'TanBM',
  'NamVH5',
  'PhongTH4',
  'DaiNV4',
  'DatPM',
  'ManhND16',
  'ThangLV11',
  'HungNQ23',
  'DucNL',
  'NhungNTH3',
];

/** Kho lưu ảnh QR chuyển khoản. */
export const QR_BUCKET = 'qr-codes';

/** Cạnh dài tối đa của ảnh QR sau khi nén, tính bằng pixel. */
export const QR_MAX_SIZE = 500;
