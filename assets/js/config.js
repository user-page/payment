/**
 * Cấu hình tập trung. Sửa kết nối database ở đây, không rải rác trong code.
 */

/**
 * Kết nối Firebase — lấy ở Firebase Console → Project settings → Your apps.
 *
 * Mấy giá trị này KHÔNG phải mật khẩu: Google thiết kế để chúng nằm công khai
 * trong mã nguồn trang web. Dữ liệu được bảo vệ bằng quy tắc trong file
 * `firestore.rules`, không phải bằng việc giấu các khoá này.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDynfHFKSuV0RelS4ia1GqK5EgdynUR07Y',
  authDomain: 'chia-tien-nhau.firebaseapp.com',
  projectId: 'chia-tien-nhau',
  storageBucket: 'chia-tien-nhau.firebasestorage.app',
  messagingSenderId: '637602490984',
  appId: '1:637602490984:web:dc739c06fa5d0237d0e9dd',
};

/** Phiên bản thư viện Firebase, ghim cố định để không tự dưng đổi hành vi. */
export const FIREBASE_SDK_VERSION = '12.19.0';

/**
 * Đăng nhập chỉ-bằng-tên chạy trên tài khoản email/mật khẩu của Firebase:
 * tên `anhnam` thành email `anhnam@<LOGIN_EMAIL_DOMAIN>`, mật khẩu dùng chung.
 *
 * Không có email nào được gửi đi thật. Dùng tên miền con của example.com vì
 * tên miền này được dành riêng cho ví dụ, chắc chắn không thuộc về ai.
 *
 * ĐỔI MỘT TRONG HAI GIÁ TRỊ NÀY = mọi người thành tài khoản mới, mất dữ liệu cũ.
 * Nếu đổi LOGIN_EMAIL_DOMAIN thì sửa luôn dòng isAdmin() trong firestore.rules.
 */
export const LOGIN_EMAIL_DOMAIN = 'ctn.example.com';

/**
 * Mật khẩu dùng chung cho cơ chế đăng nhập chỉ-bằng-tên.
 *
 * Đây KHÔNG phải lớp bảo mật: ai đọc mã nguồn trang web cũng thấy được.
 * Nó chỉ để phân biệt người dùng với nhau trong một nhóm bạn bè tin nhau.
 */
export const SHARED_LOGIN_PASSWORD = 'Ctn-Nhau-2026-xk9!';

/**
 * Tên đăng nhập có quyền xem dữ liệu của mọi người.
 * Quyền thật nằm ở firestore.rules — sửa ở đây thì sửa cả ở đó.
 */
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

/** Cạnh dài tối đa của ảnh QR sau khi nén, tính bằng pixel. */
export const QR_MAX_SIZE = 500;

/**
 * Ảnh QR lưu thẳng trong database (dạng chuỗi) thay vì kho file, vì kho file
 * của Firebase bắt buộc gói trả tiền. Firestore giới hạn 1 MB mỗi bản ghi,
 * nên chặn ảnh quá cỡ này từ trước.
 */
export const QR_MAX_BYTES = 700 * 1024;
