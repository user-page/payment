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
function FAKE_ENV({ seed, signedInAs, filterlessDenied }) {
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
  window.__fake = { users, docs, listeners, auth, setUser, filterlessDenied };
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
async function openPage(path, { signedInAs = 'vthang1510@ctn.example.com', configured = true, seed = SEED, filterlessDenied = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  const dialogs = [];
  const note = (m) => { if (!IGNORE.test(m)) errors.push(m); };
  page.on('pageerror', (e) => note(e.message));
  page.on('console', (m) => { if (m.type() === 'error') note(m.text()); });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });

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
  await page.addInitScript(FAKE_ENV, { seed, signedInAs, filterlessDenied });
  await page.goto(BASE + path);
  await page.waitForTimeout(600);
  return { page, errors, dialogs };
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

  // --- bấm chip người tham gia: phải đổi màu NGAY, không cần vẽ lại cả khoản
  // (renderRounds() chỉ chạy lại sau khi Lưu/Huỷ — xem ui/rounds.js)
  const round1 = page.locator('#roundsList .round-card').first();
  const chipPhong = round1.locator('.toggle-chip', { hasText: 'PhongTH4' });
  check('chip người tham gia: ban đầu đang bật', await chipPhong.evaluate((e) => e.classList.contains('is-on')));

  await chipPhong.click();
  check('bấm chip -> tắt ngay lập tức', !(await chipPhong.evaluate((e) => e.classList.contains('is-on'))));
  check('bấm chip -> số đếm người tham gia cập nhật ngay',
    (await round1.locator('.participants-label').textContent()).includes('2/3'));
  check('bấm chip -> tính vào bản nháp, đếm 3 thay đổi', (await page.textContent('#saveStatus')).includes('3 thay đổi'));

  await chipPhong.click();
  check('bấm lại chip -> bật lại', await chipPhong.evaluate((e) => e.classList.contains('is-on')));
  check('bấm lại chip -> số đếm trả về 3/3',
    (await round1.locator('.participants-label').textContent()).includes('3/3'));

  await chipPhong.click(); // tắt lại để kiểm tra lúc Lưu

  // Ô tiền: bấm ra rồi bấm vào lại KHÔNG được xoá số vừa gõ.
  await money.click();
  await page.waitForTimeout(150);
  check('bấm lại vào ô tiền -> số vừa gõ còn nguyên', (await money.inputValue()) === '600',
    await money.inputValue());
  await money.blur();
  await page.waitForTimeout(150);
  check('rời ô lần nữa -> bản nháp vẫn giữ số mới, không thêm thay đổi lạ',
    (await page.textContent('#saveStatus')).includes('3 thay đổi'),
    await page.textContent('#saveStatus'));

  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(200);
  check('kết quả tính theo số vừa gõ dù chưa lưu', (await page.textContent('#statTotal')) === '600');
  check('dải thống kê chỉ hiện MỘT lần', (await page.locator('#tabList .stat-strip').count()) === 1,
    `có ${await page.locator('#tabList .stat-strip').count()} dải`);
  check('chưa bấm Lưu thì database chưa bị ghi', (await writesTo(page, 'events/')).length === 0);

  // --- thêm người trong lúc còn bản nháp: bản nháp phải còn nguyên
  await page.click('.tab-btn[data-tab="edit"]');
  await page.fill('#newPersonName', 'Anh Nam');
  await page.click('#addPersonForm button[type="submit"]');
  await page.waitForTimeout(400);
  check('thêm người ghi ngay xuống database',
    (await getDoc(page, 'events/e1')).people.some((p) => p.name === 'Anh Nam'));
  check('thêm người KHÔNG làm mất bản nháp đang gõ',
    (await page.textContent('#saveStatus')).includes('3 thay đổi') &&
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
  check('Lưu ghi đúng người tham gia (chip bỏ tích ở trên)',
    !saved.rounds[0].thamGiaIds.includes('p3') && saved.rounds[0].thamGiaIds.includes('p1'),
    JSON.stringify(saved.rounds[0].thamGiaIds));
  check('Lưu không đổi chủ buổi', saved.ownerId === 'u1' && saved.ownerUsername === 'vthang1510');
  check('lưu xong thanh Lưu biến mất', await page.locator('#saveBar').isHidden());

  // --- huỷ thay đổi
  await page.fill('#eventName', 'Tên gõ nhầm');
  await page.waitForTimeout(150);
  await page.click('#discardBtn');
  await page.waitForTimeout(300);
  check('Huỷ trả ô về giá trị đã lưu', (await page.inputValue('#eventName')) === 'Ăn lòng tất niên');

  // Huỷ phải trả CẢ chip về như đã lưu.
  const chipHung = round1.locator('.toggle-chip', { hasText: 'HungNN14' });
  check('chip đang bật trước khi thử Huỷ', await chipHung.evaluate((e) => e.classList.contains('is-on')));
  await chipHung.click();
  await page.click('#discardBtn');
  await page.waitForTimeout(400);
  check('Huỷ tải lại từ database -> chip về trạng thái đã lưu',
    await round1.locator('.toggle-chip', { hasText: 'HungNN14' }).evaluate((e) => e.classList.contains('is-on')));
  check('Huỷ không ghi gì xuống database', (await getDoc(page, 'events/e1')).rounds[0].thamGiaIds.includes('p2'));

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

// ============================ 2a2. nút Lưu ngay trong tab Chỉnh sửa
{
  const { page, errors } = await openPage('index.html');
  await page.click('.tab-btn[data-tab="edit"]');
  await page.waitForTimeout(300);

  const bar = page.locator('#editSaveBar');
  const btn = page.locator('#editSaveBtn');

  check('nút Lưu trong tab Chỉnh sửa luôn hiện, kể cả khi chưa sửa gì',
    await bar.isVisible());
  check('chưa sửa gì -> nút mờ đi và nói đã lưu hết',
    (await btn.isDisabled()) && (await page.textContent('#editSaveStatus')).includes('Đã lưu hết'),
    await page.textContent('#editSaveStatus'));

  await page.fill('#eventName', 'Tên mới');
  await page.waitForTimeout(200);
  check('sửa ô -> nút bật lên, đếm đúng số thay đổi',
    !(await btn.isDisabled()) && (await page.textContent('#editSaveStatus')).includes('1 thay đổi'),
    await page.textContent('#editSaveStatus'));

  await btn.click();
  await page.waitForTimeout(800);
  check('bấm nút -> ghi thật xuống database',
    (await getDoc(page, 'events/e1')).name === 'Tên mới',
    (await getDoc(page, 'events/e1')).name);
  check('lưu xong -> nút mờ lại, báo đã lưu hết',
    (await btn.isDisabled()) && (await page.textContent('#editSaveStatus')).includes('Đã lưu hết'));

  // Huỷ ngay trong tab Chỉnh sửa
  await page.fill('#eventName', 'Gõ nhầm');
  await page.waitForTimeout(200);
  await page.click('#editDiscardBtn');
  await page.waitForTimeout(600);
  check('nút Huỷ trong tab Chỉnh sửa trả ô về giá trị đã lưu',
    (await page.inputValue('#eventName')) === 'Tên mới', await page.inputValue('#eventName'));

  check('nút Lưu trong tab Chỉnh sửa không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============ 2b. gõ tiền rồi bấm Cmd+S ngay, con trỏ còn trong ô
{
  const { page, errors } = await openPage('index.html');
  await page.click('.tab-btn[data-tab="edit"]');
  await page.waitForTimeout(300);

  const money = page.locator('#roundsList .money-input').first();
  await money.click();
  await money.fill('1734');
  // KHÔNG blur — bấm phím tắt ngay lúc con trỏ vẫn trong ô.
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(800);

  check('gõ tiền rồi Cmd+S ngay -> vẫn lưu được xuống database',
    (await getDoc(page, 'events/e1')).rounds[0].soTien === 1734,
    String((await getDoc(page, 'events/e1')).rounds[0].soTien));
  check('Cmd+S xong thanh Lưu biến mất', await page.locator('#saveBar').isHidden());
  check('gõ tiền + Cmd+S không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================= 2c. ô "đã trả" không còn nút tăng/giảm từng đơn vị
{
  const { page, errors } = await openPage('index.html');
  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(400);

  const paid = page.locator('.paid-amount-input').first();
  check('ô "đã trả" là ô chữ, không phải ô số có nút +1/-1',
    (await paid.getAttribute('type')) === 'text', await paid.getAttribute('type'));

  // Gõ có dấu chấm ngăn nghìn vẫn phải hiểu đúng, không thành 0.
  await paid.fill('1.200');
  await paid.blur();
  await page.waitForTimeout(700);
  check('ô "đã trả" hiểu được số có dấu ngăn nghìn',
    (await getDoc(page, 'events/e1')).people.find((p) => p.paidAmount === 1200) !== undefined,
    JSON.stringify((await getDoc(page, 'events/e1')).people.map((p) => p.paidAmount)));
  check('ô "đã trả" không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============= 2c2. bảng chia theo từng tăng + link riêng mỗi buổi
{
  const seed = structuredClone(SEED);
  seed.docs['events/e1'].rounds.push({
    id: 'r2', ten: 'Taxi', ngay: '2026-09-20', diaDiem: 'Về nhà',
    soTien: 300, nguoiTraId: 'p2', thamGiaIds: ['p1', 'p2'],
  });
  // Buổi thứ hai, để kiểm mỗi buổi ra một link khác nhau. Ngày tạo CŨ hơn e1
  // để app vẫn mở e1 (nó chọn buổi mới nhất), tức bảng đang xem là của e1.
  seed.docs['events/e2'] = {
    ...structuredClone(SEED.docs['events/e1']), name: 'Buổi thứ hai',
    createdAt: '2026-09-19T10:00:00Z',
  };
  seed.docs['owners/vthang1510'] = { uid: 'u1', eventIds: ['e1', 'e2'] };

  const { page, errors } = await openPage('index.html', { seed });
  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(500);

  const table = page.locator('table.rounds-breakdown');
  check('có bảng chia theo từng tăng', await table.isVisible());

  // Mỗi NGƯỜI một dòng, mỗi TĂNG một cột.
  // CSS viết hoa tiêu đề cột nên so không phân biệt hoa thường.
  const head = (await table.locator('thead th').allInnerTexts()).map((t) => t.toLowerCase());
  check('cột đầu là tên người, các cột sau là từng tăng',
    head[0].includes('người') && head[1].includes('tăng 1') && head[2].includes('taxi') &&
    head[3].includes('tổng các tăng') && head[4].includes('đã ứng') && head[5].includes('còn phải trả'),
    JSON.stringify(head));
  check('đầu cột chỉ ghi tên tăng, không kèm ngày/địa điểm/người trả',
    head[1].trim() === 'tăng 1' && head[2].trim() === 'taxi', JSON.stringify(head));

  const cells = (row) => table.locator('tbody tr').nth(row).locator('td');
  // Nhãn "Chia tiền" nằm ở dòng riêng trong ô nên gộp xuống dòng thành dấu cách.
  const line = async (r) => (await cells(r).allInnerTexts()).join('|').replace(/\n/g, ' ');

  // Tăng 1: 900 chia 3 người = 300 (p1 ứng). Taxi: 300 chia 2 = 150 (p2 ứng).
  check('người ứng 900, phải chia 450 -> còn phải trả −450 (được nhận lại)',
    (await line(0)).toLowerCase() === 'thanglv11 chia tiền|300|150|450|900|-450', await line(0));
  check('người ứng 300, phải chia 450 -> còn phải trả 150',
    (await line(1)) === 'HungNN14|300|150|450|300|150', await line(1));
  check('người không ứng gì, không đi Taxi -> chỉ trả 300',
    (await line(2)) === 'PhongTH4|300|—|300|—|300', await line(2));
  check('dòng cuối: tổng từng tăng, tổng chi, tổng đã ứng',
    (await line(3)) === 'Tổng chi|900|300|1200|1200|', await line(3));
  check('ghi chú nói rõ số âm là được nhận lại',
    (await page.textContent('.table-note')).includes('được nhận lại'));

  // --- link riêng cho từng buổi, chép ngay trong danh sách
  await page.evaluate(() => {
    window.__copied = [];
    navigator.clipboard.writeText = (t) => { window.__copied.push(t); return Promise.resolve(); };
  });

  const cards = page.locator('#eventListBody .event-card');
  check('mỗi buổi có nút Chia sẻ riêng',
    (await cards.count()) === 2 && (await page.locator('.event-share-btn').count()) === 2);

  await cards.nth(0).locator('.event-share-btn').click();
  await cards.nth(1).locator('.event-share-btn').click();
  await page.waitForTimeout(400);

  const copied = await page.evaluate(() => window.__copied);
  check('hai buổi cho ra hai link KHÁC nhau', copied.length === 2 && copied[0] !== copied[1],
    JSON.stringify(copied));
  check('link chứa đúng id của từng buổi',
    copied.some((l) => l.includes('share=e1')) && copied.some((l) => l.includes('share=e2')),
    JSON.stringify(copied));
  // Cả thẻ là nút chuyển buổi. Vừa bấm Chia sẻ ở thẻ thứ hai (buổi KHÔNG đang
  // xem) — nếu click lan ra thẻ thì app đã nhảy sang buổi đó.
  const cardTexts = await cards.allInnerTexts();
  check('bấm Chia sẻ không làm nhảy sang buổi khác',
    cardTexts[0].includes('Đang xem') && !cardTexts[1].includes('Đang xem'),
    JSON.stringify(cardTexts));
  check('bấm Chia sẻ có báo đã chép', (await page.textContent('#saveFlash')).includes('Đã chép link'),
    await page.textContent('#saveFlash'));

  check('bảng từng tăng + chia sẻ không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ======================= 2c3. link chia sẻ cũng hiện bảng từng tăng
{
  const { page } = await openPage('index.html?share=e1', { signedInAs: null });
  await page.waitForTimeout(700);
  const text = await page.textContent('#shareView');
  check('người xem qua link cũng thấy bảng chia từng tăng',
    text.includes('Từng khoản đã chi') && text.includes('Tăng 1') && text.includes('Tổng chi') &&
    text.includes('ThangLV11'),
    text.slice(0, 160));
  await page.close();
}

// ============================================= 2d. tab "Ai chưa trả"
{
  const { page, errors } = await openPage('index.html');
  await page.click('.tab-btn[data-tab="debt"]');
  await page.waitForTimeout(300);

  await page.click('#calcDebtBtn');
  await page.waitForTimeout(900);

  const body = await page.textContent('#debtBody');
  // Buổi mẫu: p1 trả 900, cả 3 cùng chia -> p2 và p3 mỗi người nợ p1 300.
  check('tab Ai chưa trả: liệt kê được người còn nợ',
    body.includes('HungNN14') && body.includes('PhongTH4'), body.slice(0, 200));
  check('tab Ai chưa trả: đúng số tiền nợ', body.includes('300'), body.slice(0, 200));
  check('tab Ai chưa trả: không báo lỗi', !(await page.textContent('#debtStatus')).includes('lỗi'),
    await page.textContent('#debtStatus'));
  check('tab Ai chưa trả: không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ====== 2e. buổi chưa chọn người chia tiền: ô phải để trống, phải nói rõ
{
  const seed = structuredClone(SEED);
  seed.docs['events/e1'].organizerId = null;

  const { page, errors } = await openPage('index.html', { seed });
  await page.click('.tab-btn[data-tab="edit"]');
  await page.waitForTimeout(300);

  const org = page.locator('#organizerSelect');
  check('chưa chọn người chia tiền -> ô để trống, KHÔNG tự hiện tên người đầu',
    (await org.inputValue()) === '', `ô đang hiện: ${await org.inputValue()}`);

  check('chưa chọn người chia tiền -> chưa cho tải QR',
    (await page.locator('#qrList .qr-row').count()) === 0 &&
    (await page.textContent('#qrList')).includes('Chọn người đứng ra chia tiền'));

  await page.click('.tab-btn[data-tab="debt"]');
  await page.click('#calcDebtBtn');
  await page.waitForTimeout(900);
  check('tab Ai chưa trả nói rõ buổi nào bị bỏ qua',
    (await page.textContent('#debtStatus')).includes('chưa chọn người đứng ra chia tiền'),
    await page.textContent('#debtStatus'));

  // chọn người chia tiền -> mọi thứ chạy lại bình thường
  await page.click('.tab-btn[data-tab="edit"]');
  await org.selectOption({ label: 'ThangLV11' });
  await page.waitForTimeout(150);
  await page.click('#saveBtn');
  await page.waitForTimeout(800);
  check('chọn xong -> lưu đúng người chia tiền',
    (await getDoc(page, 'events/e1')).organizerId === 'p1');
  check('chọn xong -> hiện đúng một ô tải QR của người chia tiền',
    (await page.locator('#qrList .qr-row').count()) === 1 &&
    (await page.textContent('#qrList')).includes('ThangLV11 (chia tiền)'));

  await page.click('.tab-btn[data-tab="debt"]');
  await page.click('#calcDebtBtn');
  await page.waitForTimeout(900);
  check('chọn xong -> tab Ai chưa trả hết bỏ qua, có dữ liệu',
    (await page.textContent('#debtStatus')) === '' &&
    (await page.textContent('#debtBody')).includes('HungNN14'));
  check('buổi chưa chọn người chia tiền không lỗi JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ============ 2f. lỗi quyền truy cập phải hiện ra, không được nuốt
{
  const { page } = await openPage('index.html');
  await page.click('.tab-btn[data-tab="debt"]');

  // Giả lập đúng lỗi Firestore trả về khi quy tắc bảo mật chặn.
  await page.evaluate(() => {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    window.__fake.failNextRead = err;
  });
  await page.click('#calcDebtBtn');
  await page.waitForTimeout(900);

  const status = await page.textContent('#debtStatus');
  check('lỗi quyền truy cập hiện ra chứ không im lặng trống trơn',
    status.includes('không có quyền đọc') && status.includes('firestore.rules'), status);
  await page.close();
}

// ==== 2g. rules chặn truy vấn admin -> phải BÁO LỖI, không im lặng hiện thiếu
{
  const { page, dialogs } = await openPage('index.html', { filterlessDenied: true });
  await page.waitForTimeout(1000);

  // Lùi lặng lẽ về "chỉ buổi của mình" sẽ giấu mất việc firestore.rules sai —
  // đúng thứ đã làm tab "Ai chưa trả" trống mà không ai biết vì sao.
  const alerted = dialogs.join(' | ');
  check('rules chặn truy vấn admin -> hiện lỗi nói rõ cần xem lại Rules',
    alerted.includes('không có quyền đọc') && alerted.includes('firestore.rules'), alerted);
  await page.close();
}

// ================================== 3b. khoản chi chưa chọn ai trả
{
  // Xảy ra thật khi thêm khoản chi TRƯỚC lúc thêm người: nguoiTraId là rỗng.
  const seed = structuredClone(SEED);
  seed.docs['events/e1'].rounds.push({
    id: 'r2', ten: 'Taxi', ngay: '2026-09-20', diaDiem: 'Taxi',
    soTien: 300, nguoiTraId: null, thamGiaIds: ['p1', 'p2', 'p3'],
  });

  const { page, errors } = await openPage('index.html', { seed });
  await page.click('.tab-btn[data-tab="edit"]');
  await page.waitForTimeout(300);

  const payer2 = page.locator('#roundsList .round-card').nth(1).locator('select');
  check('khoản chưa chọn người trả -> ô để trống, KHÔNG tự hiện tên người đầu danh sách',
    (await payer2.inputValue()) === '', `ô đang hiện: ${await payer2.inputValue()}`);
  check('ô người trả có lựa chọn "chưa chọn"',
    (await payer2.locator('option').first().textContent()).includes('chưa chọn'));

  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(300);
  const body = await page.textContent('#resultsBody');
  check('kết quả cảnh báo khoản chưa có người trả', body.includes('Chưa chọn ai trả cho'), body.slice(0, 120));
  check('tiền khoản đó vẫn được chia (900+300 chia 3 = 400/người)', body.includes('400'));

  // chọn người trả -> cảnh báo biến mất, tiền vào cột "đã trả"
  await page.click('.tab-btn[data-tab="edit"]');
  await payer2.selectOption({ label: 'HungNN14' });
  await page.waitForTimeout(200);
  await page.click('#saveBtn');
  await page.waitForTimeout(600);
  check('chọn người trả -> lưu đúng vào database',
    (await getDoc(page, 'events/e1')).rounds[1].nguoiTraId === 'p2');

  await page.click('.tab-btn[data-tab="list"]');
  await page.waitForTimeout(300);
  check('chọn xong -> hết cảnh báo', !(await page.textContent('#resultsBody')).includes('Chưa chọn ai trả cho'));
  check('khoản chưa chọn người trả không gây lỗi JS', errors.length === 0, errors.join(' | '));
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
