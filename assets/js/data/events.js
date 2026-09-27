/**
 * Đọc/ghi buổi nhậu.
 *
 * CÁCH LƯU TRÊN FIRESTORE
 *
 *   events/{id}      MỘT bản ghi chứa trọn một buổi: tên, ngày, người chia tiền,
 *                    danh sách người, các khoản chi (kèm ai tham gia), tài trợ.
 *   qrs/{personId}   ảnh QR của từng người, tách riêng vì ảnh nặng mà mỗi bản
 *                    ghi Firestore chỉ chứa tối đa 1 MB.
 *   owners/{tên}     danh sách id các buổi của một người — để link "chia sẻ tổng
 *                    hợp" tìm ra các buổi mà không phải mở quyền đọc toàn bộ.
 *
 * Gộp cả buổi vào một bản ghi vì dữ liệu mỗi buổi rất nhỏ (vài người, vài
 * khoản), và nhờ vậy: mở một buổi chỉ tốn 1 lượt đọc, mọi thay đổi trong buổi
 * ghi trong một giao dịch (transaction) nên không bao giờ ghi dở dang.
 *
 * Tầng này nhận và trả dữ liệu đúng dạng app dùng (camelCase), không có bước
 * dịch tên cột như bản Supabase.
 */
import {
  db, doc, collection, query, where, getDoc, getDocs, runTransaction, writeBatch,
  arrayUnion, arrayRemove,
} from './client.js';
import { currentIdentity } from './identity.js';
import { today } from '../utils/format.js';

/**
 * Ném lại lỗi Firebase kèm lời giải thích, thay vì nuốt đi rồi trả về rỗng.
 *
 * Nuốt lỗi làm màn hình trống trơn mà không ai biết vì sao — đặc biệt với lỗi
 * quyền truy cập (quy tắc trong firestore.rules chưa đúng hoặc chưa đăng lên),
 * thứ nhìn hệt như "không có dữ liệu".
 */
const rethrow = (what) => (err) => {
  console.error(what, err);
  if (err?.code === 'permission-denied') {
    throw new Error(`${what}: không có quyền đọc. Kiểm tra lại phần Rules của Firestore (xem file firestore.rules).`);
  }
  if (err?.code === 'unavailable') {
    throw new Error(`${what}: không kết nối được, kiểm tra mạng rồi thử lại.`);
  }
  throw new Error(`${what}: ${err?.message || err}`);
};

const eventRef = (id) => doc(db, 'events', id);
export const qrRef = (personId) => doc(db, 'qrs', personId);
const ownerRef = (username) => doc(db, 'owners', username);

// ------------------------------------------------------------ chuẩn hoá

/*
 * Firestore từ chối giá trị `undefined`, và dữ liệu cũ có thể thiếu trường.
 * Mọi bản ghi đi qua các hàm dưới đây cả lúc đọc lẫn lúc ghi, nên luôn đủ
 * trường, đúng kiểu.
 */

const str = (v) => (v == null ? '' : String(v));
const int = (v) => Math.max(0, Math.round(Number(v) || 0));
const idOrNull = (v) => (v ? String(v) : null);

export function cleanPerson(p) {
  return {
    id: String(p.id),
    name: str(p.name),
    hasQr: !!p.hasQr,
    isPaid: !!p.isPaid,
    paidAmount: int(p.paidAmount),
  };
}

export function cleanRound(r) {
  return {
    id: String(r.id),
    ten: str(r.ten),
    ngay: str(r.ngay),
    diaDiem: str(r.diaDiem),
    soTien: int(r.soTien),
    nguoiTraId: idOrNull(r.nguoiTraId),
    thamGiaIds: [...new Set((r.thamGiaIds || []).map(String))],
  };
}

export function cleanSponsor(s) {
  return {
    id: String(s.id),
    ten: str(s.ten),
    soTien: int(s.soTien),
    ghiChu: str(s.ghiChu),
    personId: idOrNull(s.personId),
    stillSplit: s.stillSplit !== false,
    isPaid: !!s.isPaid,
  };
}

/** Dạng app dùng, dựng từ một bản ghi Firestore. */
function toEvent(id, d) {
  return {
    id,
    name: str(d.name),
    eventDate: str(d.eventDate),
    organizerId: idOrNull(d.organizerId),
    ownerId: str(d.ownerId),
    ownerUsername: str(d.ownerUsername),
    createdAt: str(d.createdAt),
    people: (d.people || []).map(cleanPerson),
    rounds: (d.rounds || []).map(cleanRound),
    sponsors: (d.sponsors || []).map(cleanSponsor),
  };
}

/** Các trường được phép sửa — chủ buổi và ngày tạo không bao giờ đổi. */
function editableFields(ev) {
  return {
    name: str(ev.name),
    eventDate: str(ev.eventDate),
    organizerId: idOrNull(ev.organizerId),
    people: ev.people.map(cleanPerson),
    rounds: ev.rounds.map(cleanRound),
    sponsors: ev.sponsors.map(cleanSponsor),
  };
}

/**
 * Dọn các tham chiếu tới người không còn trong buổi — thay cho "on delete
 * cascade / set null" của database quan hệ cũ.
 */
function pruneDanglingRefs(ev) {
  const ids = new Set(ev.people.map((p) => p.id));
  if (ev.organizerId && !ids.has(ev.organizerId)) ev.organizerId = ev.people[0]?.id || null;
  for (const r of ev.rounds) {
    r.thamGiaIds = r.thamGiaIds.filter((id) => ids.has(id));
    if (r.nguoiTraId && !ids.has(r.nguoiTraId)) r.nguoiTraId = null;
  }
  for (const s of ev.sponsors) {
    if (s.personId && !ids.has(s.personId)) s.personId = null;
  }
}

// ---------------------------------------------------------------- đọc

/** Danh sách buổi xem được (admin: tất cả; người thường: của mình), mới nhất trước. */
export async function listEvents() {
  const me = currentIdentity();
  if (!me) return [];

  /*
   * Admin hỏi TOÀN BỘ danh sách, không kèm điều kiện lọc.
   *
   * Firestore KHÔNG lọc bớt kết quả theo quy tắc — nó từ chối nguyên cả truy
   * vấn nào mà nó không chứng minh được là an toàn. Nên truy vấn này chỉ chạy
   * khi isAdmin() trong firestore.rules cũng đúng. Hai bên lệch nhau (VD:
   * rules ghi email thật thay vì email ẩn của cơ chế đăng nhập-bằng-tên) là
   * hỏng, và hỏng ở đây hiện ra thành thông báo lỗi chứ không lùi lặng lẽ về
   * danh sách của riêng mình — lùi lặng lẽ thì không ai biết rules đang sai.
   */
  const q = me.isAdmin
    ? collection(db, 'events')
    : query(collection(db, 'events'), where('ownerId', '==', me.id));

  const snap = await getDocs(q).catch(rethrow('Không đọc được danh sách buổi nhậu'));
  return snap.docs
    .map((d) => {
      const { people, rounds, sponsors, ...summary } = toEvent(d.id, d.data());
      return summary;
    })
    // Xếp ở máy người dùng: xếp trên Firestore kèm điều kiện lọc sẽ đòi tạo chỉ mục.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Nạp đầy đủ một buổi, kèm ảnh QR.
 * @param {{withQr?: boolean}} opts  link chia sẻ công khai không cần (và không được đọc) QR
 */
export async function loadEvent(eventId, { withQr = true } = {}) {
  const snap = await getDoc(eventRef(eventId)).catch(rethrow('Không đọc được buổi nhậu'));
  if (!snap.exists()) return null;

  const ev = toEvent(snap.id, snap.data());
  ev.people = ev.people.map((p) => ({ ...p, qr: null }));

  if (withQr) {
    await Promise.all(
      ev.people.filter((p) => p.hasQr).map(async (p) => {
        try {
          const q = await getDoc(qrRef(p.id));
          p.qr = q.exists() ? q.data().dataUrl || null : null;
        } catch {
          p.qr = null; // không có quyền đọc QR (VD: đang xem qua link chia sẻ)
        }
      })
    );
  }
  return ev;
}

/** Link chia sẻ một buổi: ai có link cũng xem được, không cần đăng nhập. */
export async function loadPublicEvent(eventId) {
  const ev = await loadEvent(eventId, { withQr: false });
  if (!ev) throw new Error('Không tìm thấy buổi nhậu này.');
  return ev;
}

/** Link chia sẻ tổng hợp: mọi buổi của một tên đăng nhập. */
export async function loadPublicOwner(username) {
  const snap = await getDoc(ownerRef(username)).catch(rethrow('Không đọc được danh sách buổi của người này'));
  if (!snap.exists()) return { ownerUsername: username, events: [] };

  const ids = snap.data().eventIds || [];
  const events = (await Promise.all(ids.map((id) => loadEvent(id, { withQr: false })))).filter(Boolean);
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ownerUsername: username, events };
}

// ---------------------------------------------------------------- ghi

/**
 * Sửa một buổi trong một giao dịch: đọc bản mới nhất, cho `change` sửa trên
 * bản sao, rồi ghi lại. Hai người sửa cùng lúc cũng không đè mất của nhau,
 * vì Firestore tự chạy lại giao dịch khi có xung đột.
 *
 * `change(ev, tx)` được sửa thẳng vào `ev`; giá trị nó trả về được trả ra ngoài.
 */
export async function mutateEvent(eventId, change) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef(eventId));
    if (!snap.exists()) throw new Error('Buổi nhậu này không còn tồn tại.');

    const ev = toEvent(snap.id, snap.data());
    const result = await change(ev, tx);
    pruneDanglingRefs(ev);
    tx.update(eventRef(eventId), editableFields(ev));
    return result;
  });
}

/** Tạo buổi nhậu mới cho người đang đăng nhập, trả về { id }. */
export async function createEvent({ name, eventDate }) {
  const me = currentIdentity();
  if (!me) throw new Error('Chưa đăng nhập.');

  const ref = doc(collection(db, 'events'));
  const batch = writeBatch(db);

  batch.set(ref, {
    ownerId: me.id,
    ownerUsername: me.username,
    createdAt: new Date().toISOString(),
    ...editableFields({
      name: name || 'Buổi nhậu mới',
      eventDate: eventDate || today(),
      organizerId: null,
      people: [],
      rounds: [],
      sponsors: [],
    }),
  });
  batch.set(ownerRef(me.username), { uid: me.id, eventIds: arrayUnion(ref.id) }, { merge: true });

  await batch.commit();
  return { id: ref.id };
}

/** Sửa tên, ngày, người chia tiền. */
export function updateEvent(eventId, patch) {
  return mutateEvent(eventId, (ev) => {
    if ('name' in patch) ev.name = patch.name;
    if ('eventDate' in patch) ev.eventDate = patch.eventDate;
    if ('organizerId' in patch) ev.organizerId = patch.organizerId;
  });
}

/** Xoá buổi, kèm ảnh QR của những người trong buổi và mục trong danh sách chia sẻ. */
export async function deleteEvent(eventId) {
  const snap = await getDoc(eventRef(eventId));
  if (!snap.exists()) return;
  const ev = toEvent(snap.id, snap.data());

  const batch = writeBatch(db);
  batch.delete(eventRef(eventId));
  for (const p of ev.people) if (p.hasQr) batch.delete(qrRef(p.id));
  if (ev.ownerUsername) {
    batch.set(ownerRef(ev.ownerUsername), { eventIds: arrayRemove(eventId) }, { merge: true });
  }
  await batch.commit();
}

/**
 * Ghi bản nháp (các ô nhập liệu chờ bấm Lưu) trong MỘT giao dịch: hoặc ghi đủ
 * tất cả, hoặc không ghi gì — không có chuyện lưu được nửa chừng.
 *
 * @param {Array} entries  lấy từ draftEntries() trong core/store.js
 */
export function applyDraft(eventId, entries) {
  return mutateEvent(eventId, (ev) => {
    for (const entry of entries) {
      if (entry.kind === 'event') {
        const p = entry.patch;
        if ('name' in p) ev.name = p.name;
        if ('eventDate' in p) ev.eventDate = p.eventDate;
        if ('organizerId' in p) ev.organizerId = p.organizerId;
      } else if (entry.kind === 'round') {
        const r = ev.rounds.find((x) => x.id === entry.roundId);
        if (r) Object.assign(r, entry.patch); // khoản đã bị xoá thì bỏ qua
      } else if (entry.kind === 'participants') {
        const r = ev.rounds.find((x) => x.id === entry.roundId);
        if (r) r.thamGiaIds = [...entry.personIds];
      }
    }
    ev.rounds = ev.rounds.map(cleanRound);
    return entries.length;
  });
}
