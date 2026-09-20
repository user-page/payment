# Chia Tiền Nhậu

Web chia tiền cho các buổi nhậu nhiều tăng. Chạy thuần trên trình duyệt, dữ liệu
lưu ở Supabase, không có máy chủ riêng.

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
    config.js               kết nối database, tên admin, danh sách tên gợi ý
    utils/                  hàm tiện ích thuần, không phụ thuộc gì
      format.js             định dạng số tiền, chống XSS
      dom.js                tạo phần tử, nút xác nhận hai lần, chép clipboard
    domain/
      settlement.js         TOÀN BỘ PHÉP TÍNH TIỀN — thuần, test được
    data/                   mọi truy vấn Supabase, và chỉ ở đây
      client.js             khởi tạo kết nối
      events.js             buổi nhậu + nạp đầy đủ dữ liệu con
      people.js             người tham gia, ảnh QR, trạng thái trả tiền
      rounds.js             khoản chi, ai tham gia khoản nào
      sponsors.js           tài trợ
    core/
      store.js              trạng thái app + bản nháp chưa lưu
      persist.js            ghi bản nháp xuống database
      auth.js               đăng nhập bằng tên
    ui/                     vẽ giao diện, KHÔNG tự gọi database
      tabs.js  saveBar.js  eventBar.js  people.js  rounds.js
      sponsors.js  results.js  resultsView.js  debt.js  shareView.js
    main.js                 ráp mọi thứ lại, định nghĩa các hành động
tests/
  settlement.test.mjs       test phép tính tiền (node --test)
  browser.mjs               test app thật trong trình duyệt
```

### Nguyên tắc phụ thuộc

```
config → utils → domain → data → core → ui → main
```

Một chiều, không có vòng. Cụ thể:

- **`domain/`** không biết gì về DOM lẫn mạng. Nhờ vậy test được bằng Node,
  không cần trình duyệt hay database.
- **`data/`** là nơi DUY NHẤT gọi Supabase, cũng là nơi duy nhất biết tên cột
  thật. Đổi tên cột chỉ phải sửa ở đây.
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
| Thêm/xoá người, khoản chi, tài trợ | Ghi ngay |
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
node tests/browser.mjs                    # app thật, cần server chạy ở cổng 8123
```

`browser.mjs` dựng một Supabase giả lập trong bộ nhớ, nên chạy được mà không
đụng tới database thật.

---

## Quy ước tiền

Mọi số tiền là **số nguyên, đơn vị nghìn đồng**. Nhập `2000` nghĩa là 2.000.000đ.
Không có số thập phân, không dấu phân cách.

Khi chia không hết, phần lẻ (vài nghìn) **không thu của ai** — thà thiếu vài
nghìn còn hơn để một người phải trả nhiều hơn người khác. Xem `distributeShares()`.

---

## Phụ thuộc bên ngoài

- **Supabase JS v2** — nạp từ CDN jsdelivr, ghim đúng phiên bản
- **Google Fonts** — Oswald, Be Vietnam Pro, IBM Plex Mono (đều có tiếng Việt)
- **3 edge function** trên Supabase: `username-login`, `public-event-view`,
  `public-owner-view` — mã nguồn nằm ở thư mục `db-moi/supabase/functions`

Không dùng framework, không cần bước build. Sửa file xong đẩy lên là chạy.

---

## Lưu ý về bảo mật

Cơ chế đăng nhập chỉ-bằng-tên dùng một mật khẩu chung nằm ngay trong mã nguồn
(`config.js`). Ai xem mã nguồn trang web cũng thấy được, nên **không có bảo mật
thật giữa các tài khoản**: biết tên đăng nhập là vào được.

Chấp nhận được cho một nhóm bạn chia tiền nhậu. Đừng dùng cho dữ liệu nhạy cảm.
