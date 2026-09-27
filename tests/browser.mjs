/**
 * Chạy thử app thật trong trình duyệt với một Firebase giả lập trong bộ nhớ.
 *
 * Thư viện Firebase thật (nạp từ gstatic.com) bị chặn và thay bằng ba module
 * giả ở cuối file. Bản giả cố tình khắt khe giống Firestore thật ở hai điểm
 * hay gây lỗi: từ chối giá trị `undefined`, và bắt giao dịch phải đọc xong
 * mới được ghi.
 *
 * Chạy (cần server tĩnh ở cổng 8123):
 *   python3 -m http.server 8123 &
 *   node tests/browser.mjs
 */
import { chromium } from 'playwright';
import { FAKE_MODULES } from './fake-firebase.mjs';

const BASE = process.env.APP_URL || 'http://localhost:8123/';
const PASSWORD = 'Ctn-Nhau-2026-xk9!';

// ------------------------------------------------------------------ dữ liệu mẫu

const SEED = {
  users: { 'vthang1510@ctn.example.com': { uid: 'u1', email: 'vthang1510@ctn.example.com', pw: PASSWORD } },
  docs: {
    'events/e1': {
      ownerId: 'u1', ownerUsername: 'vthang1510', createdAt: '2026-09-20T10:00:00Z',
      name: 'Ăn lòng', eventDate: '2026-09-20', organizerId: 'p1',
      people: [
        { id: 'p1', name: 'ThangLV11', hasQr: true, isPaid: false, paidAmount: 0 },
        { id: 'p2', name: 'HungNN14', hasQr: false, isPaid: false, paidAmount: 0 },
        { id: 'p3', name: 'PhongTH4', hasQr: false, isPaid: false, paidAmount: 0 },
      ],
      rounds: [
        { id: 'r1', ten: 'Tăng 1', ngay: '2026-09-20', diaDiem: 'Lòng', soTien: 900, nguoiTraId: 'p1', thamGiaIds: ['p1', 'p2', 'p3'] },
      ],
      sponsors: [],
    },
    'qrs/p1': { ownerId: 'u1', eventId: 'e1', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    'owners/vthang1510': { uid: 'u1', eventIds: ['e1'] },
  },
};

/** Chạy TRONG trình duyệt, trước mọi script của trang: dựng kho dữ liệu giả. */
function FAKE_ENV({ seed, signedInAs }) {
  const users = structuredClone(seed.users);
  const docs = new Map(Object.entries(structuredClone(seed.docs)));
  const listeners = [];
  const auth = { currentUser: null };

  const setUser = (u) => {
    auth.currentUser = u ? { uid: u.uid, email: u.email } : null;
    for (const cb of listeners) cb(auth.currentUser);
  };
  if (signedInAs) auth.currentUser = { uid: users[signedInAs].uid, email: signedInAs };

  window.__writes = [];
  window.__docs = docs;
  window.__fake = { users, docs, listeners, auth, setUser };
}

// ------------------------------------------------------------------ chạy test

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : '  LỖI '}${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const IGNORE = /fonts\.googleapis|Failed to load resource/i;

/** Mở một trang mới với Firebase giả. `configured:false` giữ nguyên config.js chưa điền. */
async function openPage(path, { signedInAs = 'vthang1510@ctn.example.com', configured = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  const note = (m) => { if (!IGNORE.test(m)) errors.push(m); };
  page.on('pageerror', (e) => note(e.message));
  page.on('console', (m) => { if (m.type() === 'error') note(m.text()); });
  page.on('dialog', (d) => d.accept());

  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/www.gstatic.com/firebasejs/**', (r) => {
    const name = r.request().url().split('/').pop();
    r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
      body: FAKE_MODULES[name] ?? 'throw new Error("module giả không có: ' + name + '")',
    });
  });
  // Test không phụ thuộc vào việc config.js thật đã điền hay chưa: giả lập cả
  // hai tình huống bằng cách viết đè giá trị ngay trên response.
  await page.route('**/assets/js/config.js', async (r) => {
    const res = await r.fetch();
    const body = configured
      ? (await res.text()).replaceAll(/'DIEN_VAO_DAY[^']*'/g, "'test'")
      : (await res.text()).replace(
          /export const FIREBASE_CONFIG = \{[^}]*\};/,
          "export const FIREBASE_CONFIG = { apiKey: 'DIEN_VAO_DAY', authDomain: 'DIEN_VAO_DAY', projectId: 'DIEN_VAO_DAY', storageBucket: 'DIEN_VAO_DAY', messagingSenderId: 'DIEN_VAO_DAY', appId: 'DIEN_VAO_DAY' };"
        );
    r.fulfill({ response: res, body });
  });
  await page.addInitScript(FAKE_ENV, { seed: SEED, signedInAs });
  await page.goto(BASE + path);
  await page.waitForTimeout(600);
  return { page, errors };
}

const writesTo = (page, prefix) =>
  page.evaluate((p) => window.__writes.filter((w) => w.path.startsWith(p)), prefix);
const getDoc = (page, path) => page.evaluate((p) => structuredClone(window.__docs.get(p)), path);

// ============================================= 1. app chính, đã đăng nhập sẵn
{
  const { page, errors } = await openPage('index.html');

  check('app khởi động không lỗi JS', errors.length === 0, errors.join(' | '));
  check('vào được màn hình chính', await page.isVisible('#mainApp'));
  check('thanh tài khoản hiện tên + nhãn admin',
    (await page.textContent('#userBar')).includes('vthang1510') && (await page.isVisible('.admin-badge')));

  await page.click('.tab-btn[data-tab="edit"]');
  await page.waitForTimeout(200);
  check('vẽ đủ 3 người tham gia', (await page.locator('#peopleList .chip').count()) === 3);
  check('vẽ được khoản chi', (await page.locator('#roundsList .round-card').count()) === 1);
  check('ô tên buổi điền đúng', (await page.inputValue('#eventName')) === 'Ăn lòng');
  check('nạp được ảnh QR đã lưu', (await page.locator('#qrList img').count()) === 1);
  check('thanh Lưu ẩn khi chưa sửa gì', await page.locator('#saveBar').isHidden());

  // --- bản nháp
  await page.fill('#eventName', 'Ăn lòng tất niên');
  await page.waitForTimeout(150);
  check('sửa ô -> thanh Lưu hiện, đếm 1 thay đổi',
    (await page.locator('#saveBar').isVisible()) && (await page.textContent('#saveStatus')).includes('1 thay đổi'));

  const money = page.locator('#roundsList .money-input').first();
  await money.click();
  await money.fill('600');
  await money.blur();
  await page.waitForTimeout(200);
  check('đếm đúng 2 thay đổi', (await page.textContent('#saveStatus')).includes('2 thay đổi'));

  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(200);
  check('kết quả tính theo số vừa gõ dù chưa lưu', (await page.textContent('#statTotal')) === '600');
  check('chưa bấm Lưu thì database chưa bị ghi', (await writesTo(page, 'events/')).length === 0);

  // --- thêm người trong lúc còn bản nháp: bản nháp phải còn nguyên
  await page.click('.tab-btn[data-tab="edit"]');
  await page.fill('#newPersonName', 'Anh Nam');
  await page.click('#addPersonForm button[type="submit"]');
  await page.waitForTimeout(400);
  check('thêm người ghi ngay xuống database',
    (await getDoc(page, 'events/e1')).people.some((p) => p.name === 'Anh Nam'));
  check('thêm người KHÔNG làm mất bản nháp đang gõ',
    (await page.textContent('#saveStatus')).includes('2 thay đổi') &&
    (await page.inputValue('#eventName')) === 'Ăn lòng tất niên',
    await page.textContent('#saveStatus'));

  // --- lưu: một giao dịch, ghi đủ cả hai thay đổi
  const before = (await writesTo(page, 'events/e1')).length;
  await page.click('#saveBtn');
  await page.waitForTimeout(500);
  const saveWrites = (await writesTo(page, 'events/e1')).slice(before);
  const saved = await getDoc(page, 'events/e1');
  check('Lưu ghi đúng MỘT lần vào buổi', saveWrites.length === 1, JSON.stringify(saveWrites.map((w) => w.op)));
  check('Lưu ghi tên buổi mới', saved.name === 'Ăn lòng tất niên', saved.name);
  check('Lưu ghi số tiền mới', saved.rounds[0].soTien === 600, String(saved.rounds[0].soTien));
  check('Lưu không đổi chủ buổi', saved.ownerId === 'u1' && saved.ownerUsername === 'vthang1510');
  check('lưu xong thanh Lưu biến mất', await page.locator('#saveBar').isHidden());

  // --- huỷ thay đổi
  await page.fill('#eventName', 'Tên gõ nhầm');
  await page.waitForTimeout(150);
  await page.click('#discardBtn');
  await page.waitForTimeout(300);
  check('Huỷ trả ô về giá trị đã lưu', (await page.inputValue('#eventName')) === 'Ăn lòng tất niên');

  // --- thêm khoản chi: cả nhóm tham gia, người chia tiền trả
  await page.click('#addRoundBtn');
  await page.waitForTimeout(400);
  let ev = await getDoc(page, 'events/e1');
  const r2 = ev.rounds[1];
  check('thêm khoản chi mặc định cả nhóm tham gia',
    r2 && r2.ten === 'Tăng 2' && r2.thamGiaIds.length === ev.people.length && r2.nguoiTraId === 'p1',
    JSON.stringify(r2));

  // --- xoá người: dọn mọi chỗ trỏ tới họ
  await page.locator('#peopleList .chip', { hasText: 'PhongTH4' }).locator('button').click();
  await page.waitForTimeout(400);
  ev = await getDoc(page, 'events/e1');
  check('xoá người khỏi danh sách', !ev.people.some((p) => p.id === 'p3'));
  check('xoá người -> gỡ họ khỏi mọi khoản chi', ev.rounds.every((r) => !r.thamGiaIds.includes('p3')));

  // --- xoá người đang đứng ra chia tiền (có QR): chuyển cho người khác, xoá luôn QR
  await page.locator('#peopleList .chip', { hasText: 'ThangLV11' }).locator('button').click();
  await page.waitForTimeout(400);
  ev = await getDoc(page, 'events/e1');
  check('xoá người chia tiền -> tự chọn người khác', ev.organizerId === 'p2', ev.organizerId);
  check('xoá người -> khoản họ trả thành chưa rõ ai trả', ev.rounds.every((r) => r.nguoiTraId !== 'p1'));
  check('xoá người -> xoá ảnh QR của họ', !(await getDoc(page, 'qrs/p1')));

  // --- tài trợ
  await page.fill('#newSponsorName', 'Anh A');
  await page.fill('#newSponsorAmount', '200');
  await page.click('#addSponsorForm button[type="submit"]');
  await page.waitForTimeout(400);
  ev = await getDoc(page, 'events/e1');
  check('thêm tài trợ', ev.sponsors.length === 1 && ev.sponsors[0].soTien === 200, JSON.stringify(ev.sponsors));

  // --- tải ảnh QR: nén, lưu vào qrs/{người}, đánh dấu hasQr
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const qrRow = page.locator('#qrList .qr-row', { hasText: 'HungNN14' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    qrRow.getByRole('button', { name: 'Tải QR lên' }).click(),
  ]);
  await chooser.setFiles({ name: 'qr.png', mimeType: 'image/png', buffer: PNG_1PX });
  await page.waitForTimeout(700);
  const qrDoc = await getDoc(page, 'qrs/p2');
  ev = await getDoc(page, 'events/e1');
  check('tải QR -> lưu ảnh dạng data URL kèm chủ buổi',
    qrDoc?.dataUrl?.startsWith('data:image/png;base64,') && qrDoc.ownerId === 'u1', JSON.stringify(qrDoc)?.slice(0, 120));
  check('tải QR -> đánh dấu người đó có QR', ev.people.find((p) => p.id === 'p2')?.hasQr === true);
  check('tải QR -> hiện ảnh trong danh sách', (await qrRow.locator('img').count()) === 1);

  await qrRow.getByRole('button', { name: 'Xoá QR' }).click();
  await page.waitForTimeout(400);
  check('xoá QR -> xoá ảnh và bỏ đánh dấu',
    !(await getDoc(page, 'qrs/p2')) && (await getDoc(page, 'events/e1')).people.find((p) => p.id === 'p2').hasQr === false);

  check('không phát sinh lỗi JS ở app chính', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============================================= 2. đăng nhập bằng tên, tạo buổi
{
  const { page, errors } = await openPage('index.html', { signedInAs: null });
  check('chưa đăng nhập -> hiện ô đăng nhập', await page.isVisible('#authSection'));

  await page.fill('#authUsername', 'Anh Nam');
  await page.click('#authEnterBtn');
  await page.waitForTimeout(600);
  const created = await page.evaluate(() => Object.keys(window.__fake.users));
  check('tên mới -> tự tạo tài khoản anh-nam', created.includes('anh-nam@ctn.example.com'), created.join(','));
  check('đăng nhập xong vào màn hình chính', await page.isVisible('#mainApp'));
  check('người thường không có nhãn admin', !(await page.isVisible('.admin-badge')));

  await page.fill('#createEventName', 'Buổi của Nam');
  await page.click('#createEventBtn');
  await page.waitForTimeout(500);
  const events = await page.evaluate(() =>
    [...window.__docs].filter(([k]) => k.startsWith('events/')).map(([k, v]) => ({ k, ...v })));
  const mine = events.find((e) => e.name === 'Buổi của Nam');
  check('tạo buổi đứng tên người tạo', mine?.ownerUsername === 'anh-nam', JSON.stringify(mine));
  const owner = await getDoc(page, 'owners/anh-nam');
  check('tạo buổi -> có trong danh sách chia sẻ tổng hợp', owner?.eventIds?.includes(mine?.k.split('/')[1]));
  check('người thường chỉ thấy buổi của mình',
    (await page.locator('#eventSelect option').count()) === 1);

  // đăng xuất rồi vào lại đúng tên đó -> đăng nhập, không tạo thêm
  await page.click('#userBar button');
  await page.waitForTimeout(300);
  await page.fill('#authUsername', 'anh nam');
  await page.click('#authEnterBtn');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => Object.keys(window.__fake.users).length);
  check('vào lại cùng tên -> dùng lại tài khoản cũ', after === 2 && (await page.isVisible('#mainApp')));

  check('không phát sinh lỗi JS khi đăng nhập', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============================================= 3. link chia sẻ (không đăng nhập)
{
  const { page, errors } = await openPage('index.html?share=e1', { signedInAs: null });
  const text = await page.textContent('#shareView');
  check('link chia sẻ một buổi hiện được khi chưa đăng nhập', text.includes('Ăn lòng') && text.includes('ThangLV11'));
  check('link chia sẻ không hiện ô đăng nhập', !(await page.isVisible('#authSection')));
  check('link chia sẻ không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  const { page, errors } = await openPage('index.html?shareAll=vthang1510', { signedInAs: null });
  const text = await page.textContent('#shareView');
  check('link tổng hợp liệt kê buổi của người đó', text.includes('Tổng hợp của vthang1510') && text.includes('Ăn lòng'));
  check('link tổng hợp không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============================================= 4. công cụ nhập dữ liệu cũ
{
  const { page, errors } = await openPage('tools/nhap-du-lieu-cu.html', { signedInAs: null });
  await page.click('#runBtn');
  await page.waitForTimeout(800);
  const log1 = await page.textContent('#log');
  const lòng = await getDoc(page, 'events/95333fb3-a060-454a-aac2-db916d61fc19');
  check('nhập dữ liệu cũ: đủ 3 buổi', (log1.match(/\+ Đã nhập/g) || []).length === 3, log1);
  check('nhập dữ liệu cũ: giữ nguyên id buổi (link chia sẻ cũ vẫn chạy)', !!lòng);
  check('nhập dữ liệu cũ: đứng tên admin', lòng?.ownerUsername === 'vthang1510' && lòng?.ownerId === 'u1');
  check('nhập dữ liệu cũ: đúng số tiền, người tham gia, tài trợ',
    lòng?.rounds.map((r) => r.soTien).join() === '800,140' &&
    lòng.rounds[0].thamGiaIds.length === 3 && lòng.sponsors[0].stillSplit === false);
  const owner = await getDoc(page, 'owners/vthang1510');
  check('nhập dữ liệu cũ: vào danh sách chia sẻ tổng hợp', owner.eventIds.length === 4, owner.eventIds.join());

  check('công cụ nhập không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  // Mỗi trang mới có kho giả riêng, nên chạy hai lần liền trên cùng một trang.
  const { page } = await openPage('tools/nhap-du-lieu-cu.html', { signedInAs: null });
  await page.click('#runBtn');
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('runBtn').disabled = false; });
  await page.click('#runBtn');
  await page.waitForTimeout(800);
  const log = await page.textContent('#log');
  check('chạy nhập lần hai -> bỏ qua buổi đã có', (log.match(/Bỏ qua/g) || []).length === 3, log);
  await page.close();
}

// ============================================= 5. chưa điền cấu hình
{
  const { page } = await openPage('index.html', { configured: false });
  check('chưa điền config.js -> báo rõ cần làm gì',
    (await page.textContent('#loadingNote')).includes('Chưa cấu hình Firebase'));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mục đạt`);
process.exit(failed.length ? 1 : 0);
