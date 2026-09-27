/**
 * Kết nối Firebase dùng chung.
 *
 * Đây là file DUY NHẤT nạp thư viện Firebase. Các module khác lấy hàm từ đây,
 * nên muốn đổi phiên bản hay thay thư viện (VD: bản giả lập khi chạy test) chỉ
 * phải đụng một chỗ.
 */
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from '../config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

const [appSdk, authSdk, dbSdk] = await Promise.all([
  import(`${CDN}/firebase-app.js`),
  import(`${CDN}/firebase-auth.js`),
  import(`${CDN}/firebase-firestore.js`),
]);

/** Chưa điền cấu hình thật trong config.js thì app báo rõ thay vì lỗi khó hiểu. */
export const isConfigured = !Object.values(FIREBASE_CONFIG).some((v) => String(v).includes('DIEN_VAO_DAY'));

const app = appSdk.initializeApp(FIREBASE_CONFIG);

export const auth = authSdk.getAuth(app);
export const db = dbSdk.getFirestore(app);

export const {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} = authSdk;

export const {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  arrayUnion,
  arrayRemove,
} = dbSdk;

/** Mã ngẫu nhiên cho người, khoản chi, tài trợ (các phần tử nằm trong một buổi). */
export const newId = () => crypto.randomUUID();
