# Chia Tiền Nhậu

Web chia tiền cho các buổi nhậu nhiều tăng. Chạy thuần trên trình duyệt, dữ liệu
lưu ở Firebase (Firestore), không có máy chủ riêng, không cần hàm chạy trên máy chủ.

---

## Cài Firebase (làm một lần)

1. https://console.firebase.google.com → **Create a project** (tắt Google Analytics).
2. **Build → Authentication → Get started** → *Sign-in method* → bật **Email/Password**.
3. **Build → Firestore Database → Create database** → vị trí `asia-southeast1`
   → **production mode**.
4. **Firestore Database → Rules** → xoá hết, dán toàn bộ file `firestore.rules`
   → **Publish**.
5. ⚙ **Project settings → Your apps → `</>`** → đăng ký web app → chép các giá
   trị trong `firebaseConfig` vào `FIREBASE_CONFIG` ở `assets/js/config.js`.
6. Đẩy code lên, mở web, đăng nhập bằng `vthang1510` (tài khoản admin).
7. Nhập dữ liệu cũ: mở `tools/nhap-du-lieu-cu.html` trên web → bấm **Nhập dữ liệu**.
   Chạy lại nhiều lần cũng không sao.

Gói miễn phí (Spark) không tự tạm dừng khi lâu không dùng như Supabase, và dư
sức cho một nhóm bạn. Không cần nâng lên gói trả tiền: app không dùng kho file
(Storage) hay hàm máy chủ (Functions) — hai thứ đó mới đòi gói trả tiền.

---

## Chạy ở máy

**Không mở trực tiếp file `index.html` bằng cách nhấp đúp.** Code dùng ES module,
trình duyệt chặn không cho nạp module qua `file://`. Phải chạy qua một server tĩnh:

```
cd chia-tien-nhau-web
python3 -m http.server 8000
```

Rồi mở http://localhost:8000

Trên GitHub Pages thì không vướng gì, vì đó đã là https.

---

## Cấu trúc thư mục

```
index.html                  chỉ có cấu trúc trang, không nhúng CSS/JS
assets/
  css/
    tokens.css              biến màu, bóng đổ — mọi màu đều lấy từ đây
    base.css                reset, chữ, khung, ô nhập liệu
    components.css          nút, tab, thẻ, bảng, thanh lưu
  js/
    config.js               cấu hình Firebase, tên admin, danh sách tên gợi ý
    utils/                  hàm tiện ích thuần, không phụ thuộc gì
      format.js             định dạng số tiền, chống XSS
      dom.js                tạo phần tử, nút xác nhận hai lần, chép clipboard
    domain/
      settlement.js         TOÀN BỘ PHÉP TÍNH TIỀN — thuần, test được
    data/                   mọi truy vấn Firebase, và chỉ ở đây
      client.js             nơi DUY NHẤT nạp thư viện Firebase
      identity.js           tên đăng nhập <-> email ẩn, ai là admin
      events.js             buổi nhậu, giao dịch sửa buổi, link chia sẻ
      people.js             người tham gia, ảnh QR, trạng thái trả tiền
      rounds.js             thêm/xoá khoản chi
      sponsors.js           tài trợ
    core/
      store.js              trạng thái app + bản nháp chưa lưu
      persist.js            ghi bản nháp xuống database
      auth.js               đăng nhập bằng tên
    ui/                     vẽ giao diện, KHÔNG tự gọi database
      tabs.js  saveBar.js  eventBar.js  people.js  rounds.js
      sponsors.js  results.js  resultsView.js  debt.js  shareView.js
    main.js                 ráp mọi thứ lại, định nghĩa các hành động
firestore.rules             quy tắc bảo mật — dán vào Firebase Console
tools/
  nhap-du-lieu-cu.html      công cụ một lần: chép dữ liệu Supabase cũ sang
  du-lieu-cu.json           dữ liệu cũ đã xuất sẵn (3 buổi)
tests/
  settlement.test.mjs       test phép tính tiền (node --test)
  browser.mjs               test app thật trong trình duyệt
  fake-firebase.mjs         Firebase giả lập dùng cho browser.mjs
```

### Dữ liệu nằm ở đâu

| Firestore | Chứa gì |
|---|---|
| `events/{id}` | **Trọn một buổi** trong một bản ghi: tên, ngày, người chia tiền, danh sách người, các khoản chi (kèm ai tham gia), tài trợ |
| `qrs/{id người}` | Ảnh QR của một người (dạng chuỗi data URL) |
| `owners/{tên đăng nhập}` | Danh sách id các buổi của người đó — cho link chia sẻ tổng hợp |

Gộp cả buổi vào một bản ghi vì mỗi buổi rất nhỏ. Nhờ vậy mở một buổi chỉ tốn một
lượt đọc, và mọi thay đổi trong buổi (kể cả bấm Lưu nhiều ô một lúc) ghi trong
**một giao dịch**: hoặc lưu đủ, hoặc không lưu gì. Xem `mutateEvent()` trong
`data/events.js`.

Ảnh QR tách riêng vì Firestore giới hạn 1 MB mỗi bản ghi.

### Nguyên tắc phụ thuộc

```
config → utils → domain → data → core → ui → main
```

Một chiều, không có vòng. Cụ thể:

- **`domain/`** không biết gì về DOM lẫn mạng. Nhờ vậy test được bằng Node,
  không cần trình duyệt hay database.
- **`data/`** là nơi DUY NHẤT gọi Firebase. Đổi database lần nữa thì chỉ viết
  lại thư mục này (lần đổi Supabase → Firebase đã làm đúng như vậy).
- **`ui/`** không tự gọi database. Nó nhận các hàm hành động từ `main.js`.
- **`main.js`** là chỗ duy nhất nối các tầng, nên muốn biết một nút bấm dẫn tới
  đâu thì mở file này.

---

## Nút Lưu hoạt động thế nào

Không phải thao tác nào cũng chờ bấm Lưu:

| Thao tác | Khi nào ghi |
|---|---|
| Sửa tên buổi, ngày, người chia tiền | **Chờ bấm Lưu** |
| Sửa tên khoản, ngày, địa điểm, số tiền, người trả | **Chờ bấm Lưu** |
| Tích ai tham gia khoản nào | **Chờ bấm Lưu** |
| Thêm/xoá người, khoản chi, tài trợ | Ghi ngay (không làm mất những ô đang sửa dở) |
| Tải/xoá ảnh QR | Ghi ngay |
| Đánh dấu đã trả, nhập số tiền đã trả | Ghi ngay |
| Bật/tắt hai nhãn của khoản tài trợ | Ghi ngay |

Lý do chia đôi: thêm/xoá là hành động dứt khoát, mà các bước sau lại phụ thuộc
vào việc bản ghi đã tồn tại thật (vừa thêm người xong đã muốn tích họ vào khoản
chi). Còn gõ vào ô nhập thì nên gom lại rồi ghi một lần.

Trong lúc chưa lưu, bảng kết quả vẫn tính theo con số vừa gõ — xem
`effectiveEvent()` trong `core/store.js`: nó chồng bản nháp lên dữ liệu đã lưu.

Ba lớp chống mất dữ liệu: thanh Lưu luôn hiện khi còn thay đổi, chặn đóng tab,
và hỏi lại khi chuyển buổi khác hoặc đăng xuất. Phím tắt `Cmd/Ctrl + S`.

---

## Chạy test

```
node --test tests/settlement.test.mjs     # phép tính tiền
python3 -m http.server 8123 &             # server cho test trình duyệt
node tests/browser.mjs                    # app thật, cần Playwright
```

`browser.mjs` chặn thư viện Firebase thật và thay bằng bản giả lập trong bộ nhớ
(`fake-firebase.mjs`), nên chạy được mà không đụng tới database thật. Bản giả
cố tình khắt khe như Firestore thật: từ chối giá trị `undefined` và bắt giao
dịch đọc xong mới được ghi.

Test KHÔNG kiểm được `firestore.rules` (cần bộ giả lập chính thức của Google).
Sửa quy tắc xong thì thử lại trên web thật: đăng nhập, sửa, mở link chia sẻ.

---

## Quy ước tiền

Mọi số tiền là **số nguyên, đơn vị nghìn đồng**. Nhập `2000` nghĩa là 2.000.000đ.
Không có số thập phân, không dấu phân cách.

Khi chia không hết, phần lẻ (vài nghìn) **không thu của ai** — thà thiếu vài
nghìn còn hơn để một người phải trả nhiều hơn người khác. Xem `distributeShares()`.

---

## Phụ thuộc bên ngoài

- **Firebase JS SDK** — nạp từ `www.gstatic.com`, ghim phiên bản ở `config.js`
- **Google Fonts** — Oswald, Be Vietnam Pro, IBM Plex Mono (đều có tiếng Việt)

Không dùng framework, không cần bước build. Sửa file xong đẩy lên là chạy.

---

## Lưu ý về bảo mật

Đăng nhập chỉ-bằng-tên dùng một mật khẩu chung nằm ngay trong mã nguồn
(`config.js`). Ai xem mã nguồn trang web cũng thấy được, nên **không có bảo mật
thật giữa các tài khoản**: biết tên đăng nhập là vào được.

Các khoá trong `FIREBASE_CONFIG` thì công khai là bình thường — dữ liệu được bảo
vệ bằng `firestore.rules`: mỗi người chỉ sửa được buổi của mình, admin sửa được
tất cả, ai có link thì xem được đúng buổi đó.

Chấp nhận được cho một nhóm bạn chia tiền nhậu. Đừng dùng cho dữ liệu nhạy cảm.
