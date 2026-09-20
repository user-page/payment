/**
 * Chạy thử app thật trong trình duyệt với một Supabase giả lập trong bộ nhớ.
 *
 * Mục tiêu: chứng minh app khởi động được, vẽ đúng, và luồng bản nháp + nút
 * Lưu hoạt động — mà không cần database thật.
 *
 * Chạy: node tests/browser.mjs
 */
import { chromium } from 'playwright';

const FAKE_SUPABASE = () => {
  // ---- dữ liệu mẫu trong bộ nhớ ----
  const db = {
    ctn_profiles: [{ id: 'u1', username: 'vthang1510', is_admin: true }],
    ctn_events: [
      {
        id: 'e1', owner_id: 'u1', owner_username: 'vthang1510', name: 'Ăn lòng',
        event_date: '2026-09-20', organizer_person_id: 'p1', created_at: '2026-09-20T10:00:00Z',
      },
    ],
    ctn_people: [
      { id: 'p1', event_id: 'e1', name: 'ThangLV11', qr_url: null, is_paid: false, paid_amount: 0, created_at: '1' },
      { id: 'p2', event_id: 'e1', name: 'HungNN14', qr_url: null, is_paid: false, paid_amount: 0, created_at: '2' },
      { id: 'p3', event_id: 'e1', name: 'PhongTH4', qr_url: null, is_paid: false, paid_amount: 0, created_at: '3' },
    ],
    ctn_rounds: [
      { id: 'r1', event_id: 'e1', ten: 'Tăng 1', ngay: '2026-09-20', dia_diem: 'Lòng', so_tien: 900, nguoi_tra_id: 'p1', sort_order: 0, created_at: '1' },
    ],
    ctn_round_participants: [
      { round_id: 'r1', person_id: 'p1' }, { round_id: 'r1', person_id: 'p2' }, { round_id: 'r1', person_id: 'p3' },
    ],
    ctn_sponsors: [],
  };

  // ghi lại mọi lệnh ghi để test kiểm chứng
  window.__writes = [];

  function match(row, filters) {
    return filters.every((f) => {
      if (f.op === 'eq') return row[f.col] === f.val;
      if (f.op === 'in') return f.val.includes(row[f.col]);
      if (f.op === 'ilike') return String(row[f.col] ?? '').toLowerCase() === String(f.val).toLowerCase();
      return true;
    });
  }

  function builder(table) {
    const filters = [];
    let mode = 'select';
    let payload = null;

    const run = () => {
      const rows = db[table] || [];
      if (mode === 'select') return { data: rows.filter((r) => match(r, filters)), error: null };

      if (mode === 'insert') {
        const list = [].concat(payload).map((r) => ({ id: r.id || `new-${Math.random().toString(36).slice(2, 8)}`, ...r }));
        db[table] = rows.concat(list);
        window.__writes.push({ table, op: 'insert', payload });
        return { data: list, error: null };
      }
      if (mode === 'update') {
        const hit = rows.filter((r) => match(r, filters));
        for (const r of hit) Object.assign(r, payload);
        window.__writes.push({ table, op: 'update', payload, filters: structuredClone(filters) });
        return { data: hit, error: null };
      }
      if (mode === 'delete') {
        db[table] = rows.filter((r) => !match(r, filters));
        window.__writes.push({ table, op: 'delete', filters: structuredClone(filters) });
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };

    const api = {
      select() { return api; },
      order() { return api; },
      eq(col, val) { filters.push({ op: 'eq', col, val }); return api; },
      in(col, val) { filters.push({ op: 'in', col, val }); return api; },
      ilike(col, val) { filters.push({ op: 'ilike', col, val }); return api; },
      insert(p) { mode = 'insert'; payload = p; return api; },
      update(p) { mode = 'update'; payload = p; return api; },
      delete() { mode = 'delete'; return api; },
      single() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: r.data.length ? null : { message: 'not found' } }); },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return api;
  }

  const session = { user: { id: 'u1', email: 'vthang1510@ctn.local', user_metadata: { username: 'vthang1510' } } };

  window.supabase = {
    createClient: () => ({
      from: builder,
      auth: {
        onAuthStateChange(cb) { window.__authCb = cb; },
        getSession: () => Promise.resolve({ data: { session } }),
        signInWithPassword: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({}),
      },
      functions: { invoke: () => Promise.resolve({ data: { email: 'x@ctn.local' }, error: null }) },
      storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://x/qr.png' } }) }) },
    }),
  };
};

// ---------------------------------------------------------------- chạy test

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : '  LỖI '}${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

// Bỏ qua lỗi tải font và CDN — chính test này chặn chúng để dùng bản giả lập.
const IGNORE = /fonts\.googleapis|jsdelivr|ERR_FAILED|Failed to load resource/i;
const errors = [];
const noteError = (msg) => { if (!IGNORE.test(msg)) errors.push(msg); };

page.on('pageerror', (e) => noteError(e.message));
page.on('console', (m) => { if (m.type() === 'error') noteError(m.text()); });

await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.route('**/cdn.jsdelivr.net/**', (r) => r.abort()); // thư viện thật bị chặn, ta dùng bản giả
await page.addInitScript(FAKE_SUPABASE);

// ES module cần http(s), không chạy qua file:// — nên test đi qua server tĩnh.
await page.goto(process.env.APP_URL || 'http://localhost:8123/index.html');
await page.waitForTimeout(600);

// 1. app khởi động, vào thẳng màn hình chính vì phiên đã có sẵn
check('app khởi động không lỗi JS', errors.length === 0, errors.join(' | '));
check('vào được màn hình chính', await page.isVisible('#mainApp'));
check('thanh tài khoản hiện tên đăng nhập', (await page.textContent('#userBar')).includes('vthang1510'));

// 2. tab Chỉnh sửa vẽ đủ dữ liệu
await page.click('.tab-btn[data-tab="edit"]');
await page.waitForTimeout(200);
check('vẽ đủ 3 người tham gia', (await page.locator('#peopleList .chip').count()) === 3);
check('vẽ được khoản chi', (await page.locator('#roundsList .round-card').count()) === 1);
check('ô tên buổi điền đúng', (await page.inputValue('#eventName')) === 'Ăn lòng');

// 3. thanh Lưu chưa hiện khi chưa sửa gì
check('thanh Lưu ẩn khi chưa sửa gì', await page.locator('#saveBar').isHidden());

// 4. sửa tên buổi -> thanh Lưu hiện, đếm đúng
await page.fill('#eventName', 'Ăn lòng tất niên');
await page.waitForTimeout(150);
check('sửa ô -> thanh Lưu hiện ra', await page.locator('#saveBar').isVisible());
check('đếm đúng 1 thay đổi', (await page.textContent('#saveStatus')).includes('1 thay đổi'));

// 5. sửa thêm số tiền -> đếm thành 2, và kết quả tính lại ngay dù chưa lưu
const moneyInput = page.locator('#roundsList .money-input').first();
await moneyInput.click();
await moneyInput.fill('600');
await moneyInput.blur();
await page.waitForTimeout(200);
check('đếm đúng 2 thay đổi', (await page.textContent('#saveStatus')).includes('2 thay đổi'));

await page.click('.tab-btn[data-tab="list"]');
await page.waitForTimeout(200);
check('kết quả tính theo số vừa gõ dù chưa lưu', (await page.textContent('#statTotal')) === '600');

// 6. chưa lưu thì database chưa bị đụng tới
let writes = await page.evaluate(() => window.__writes.length);
check('chưa bấm Lưu thì database chưa bị ghi', writes === 0, `có ${writes} lệnh ghi`);

// 7. bấm Lưu -> ghi đúng hai bảng
await page.click('#saveBtn');
await page.waitForTimeout(600);
const written = await page.evaluate(() =>
  window.__writes.filter((w) => w.op === 'update').map((w) => `${w.table}:${Object.keys(w.payload).join(',')}`)
);
check('Lưu ghi tên buổi vào ctn_events', written.some((w) => w.startsWith('ctn_events:name')), written.join(' | '));
check('Lưu ghi số tiền vào ctn_rounds', written.some((w) => w.includes('so_tien')), written.join(' | '));
check('lưu xong thanh Lưu biến mất', await page.locator('#saveBar').isHidden());

// 8. huỷ thay đổi thì quay về như cũ
await page.click('.tab-btn[data-tab="edit"]');
await page.fill('#eventName', 'Tên gõ nhầm');
await page.waitForTimeout(150);
page.once('dialog', (d) => d.accept());
await page.click('#discardBtn');
await page.waitForTimeout(400);
check('Huỷ trả ô về giá trị đã lưu', (await page.inputValue('#eventName')) === 'Ăn lòng tất niên',
  await page.inputValue('#eventName'));

check('không phát sinh lỗi JS trong suốt quá trình', errors.length === 0, errors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mục đạt`);
process.exit(failed.length ? 1 : 0);
