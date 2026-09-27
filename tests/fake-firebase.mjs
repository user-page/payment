/**
 * Ba module Firebase giả, phục vụ thay cho bản thật trên gstatic.com khi chạy
 * tests/browser.mjs. Chỉ cài những hàm app dùng (xem assets/js/data/client.js).
 *
 * Dữ liệu nằm ở window.__fake (dựng bởi FAKE_ENV trong browser.mjs).
 * Mọi lệnh ghi được chép vào window.__writes để test kiểm tra.
 */

const app = `
export function initializeApp(config) { return { config }; }
`;

const auth = `
const F = window.__fake;
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };

export function getAuth() { return F.auth; }

export async function signInWithEmailAndPassword(_auth, email, pw) {
  const u = F.users[email];
  // Firebase bật chống dò email trả cùng một mã cho "sai mật khẩu" và "chưa có tài khoản".
  if (!u || u.pw !== pw) fail('auth/invalid-credential');
  F.setUser(u);
}

export async function createUserWithEmailAndPassword(_auth, email, pw) {
  if (F.users[email]) fail('auth/email-already-in-use');
  const u = { uid: 'u-' + Math.random().toString(36).slice(2, 8), email, pw };
  F.users[email] = u;
  F.setUser(u);
}

export async function signOut() { F.setUser(null); }

export function onAuthStateChanged(_auth, cb) {
  F.listeners.push(cb);
  queueMicrotask(() => cb(F.auth.currentUser));
  return () => {};
}
`;

const firestore = `
const F = window.__fake;
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function getFirestore() { return {}; }

export function collection(_db, name) { return { kind: 'collection', name }; }

export function doc(a, name, id) {
  if (a && a.kind === 'collection') {
    const auto = Math.random().toString(36).slice(2, 12);
    return { kind: 'doc', path: a.name + '/' + auto, id: auto };
  }
  return { kind: 'doc', path: name + '/' + id, id };
}

export function where(field, op, value) { return { field, op, value }; }
export function query(col, ...filters) { return { kind: 'query', name: col.name, filters }; }

export const arrayUnion = (...values) => ({ __op: 'union', values });
export const arrayRemove = (...values) => ({ __op: 'remove', values });

function snapshot(path) {
  const data = F.docs.get(path);
  return { id: path.split('/').pop(), exists: () => data !== undefined, data: () => clone(data) };
}

export async function getDoc(ref) { return snapshot(ref.path); }

export async function getDocs(q) {
  const name = q.name;
  const filters = q.filters || [];
  const docs = [...F.docs.keys()]
    .filter((p) => p.startsWith(name + '/'))
    .map(snapshot)
    .filter((s) => filters.every((f) => f.op === '==' && s.data()[f.field] === f.value));
  return { docs };
}

/** Firestore thật ném lỗi khi gặp undefined — bản giả cũng vậy, để bắt lỗi sớm. */
function assertNoUndefined(value, where) {
  if (value === undefined) throw new Error('Firestore: giá trị undefined ở ' + where);
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, where + '.' + k);
  }
}

function resolveOps(prev, data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__op === 'union') out[k] = [...new Set([...(prev?.[k] || []), ...v.values])];
    else if (v && v.__op === 'remove') out[k] = (prev?.[k] || []).filter((x) => !v.values.includes(x));
    else out[k] = clone(v);
  }
  return out;
}

function apply(op) {
  const prev = F.docs.get(op.path);
  if (op.op === 'delete') F.docs.delete(op.path);
  else if (op.op === 'update') {
    if (!prev) throw new Error('Firestore: update bản ghi không tồn tại ' + op.path);
    F.docs.set(op.path, { ...prev, ...resolveOps(prev, op.data) });
  } else if (op.op === 'set') {
    F.docs.set(op.path, op.merge ? { ...prev, ...resolveOps(prev, op.data) } : resolveOps(undefined, op.data));
  }
  window.__writes.push({ path: op.path, op: op.op, data: clone(op.data) });
}

function collector() {
  const ops = [];
  return {
    ops,
    set(ref, data, opts) { assertNoUndefined(data, ref.path); ops.push({ op: 'set', path: ref.path, data, merge: !!opts?.merge }); },
    update(ref, data) { assertNoUndefined(data, ref.path); ops.push({ op: 'update', path: ref.path, data }); },
    delete(ref) { ops.push({ op: 'delete', path: ref.path }); },
  };
}

export function writeBatch() {
  const c = collector();
  return {
    set: (...a) => { c.set(...a); },
    update: (...a) => { c.update(...a); },
    delete: (...a) => { c.delete(...a); },
    async commit() { c.ops.forEach(apply); },
  };
}

export async function runTransaction(_db, fn) {
  const c = collector();
  const tx = {
    async get(ref) {
      // Firestore bắt mọi lượt đọc trong giao dịch phải xong trước lượt ghi đầu tiên.
      if (c.ops.length) throw new Error('Firestore: giao dịch đọc sau khi đã ghi');
      return snapshot(ref.path);
    },
    set(...a) { c.set(...a); return tx; },
    update(...a) { c.update(...a); return tx; },
    delete(...a) { c.delete(...a); return tx; },
  };
  const result = await fn(tx);
  c.ops.forEach(apply);
  return result;
}
`;

export const FAKE_MODULES = {
  'firebase-app.js': app,
  'firebase-auth.js': auth,
  'firebase-firestore.js': firestore,
};
