# Bộ kiểm thử — phải chạy qua trước mỗi lần cập nhật

Mọi thay đổi code đều phải chạy đủ hai bộ dưới đây và **đạt 100%** trước khi
commit. Không có bài nào được phép "tạm bỏ qua": mỗi bài trong đây đều sinh ra
từ một lỗi có thật đã xảy ra, hoặc từ một quy tắc tiền nong không được sai.

## Cách chạy

```bash
cd chia-tien-nhau-web

# 1. Phép tính tiền — thuần Node, chạy trong một giây
node --test tests/settlement.test.mjs          # phải: 31/31 pass

# 2. App thật trong trình duyệt, Firebase giả lập trong bộ nhớ
python3 -m http.server 8123 &                  # cần server tĩnh
node tests/browser.mjs                         # phải: 165/165 đạt
```

Bộ trình duyệt mất khoảng 2 phút. Nếu thấy `ERR_CONNECTION_REFUSED` thì server
tĩnh ở cổng 8123 chưa chạy hoặc đã tắt.

## Luật khi sửa code

1. **Không sửa bài test cho vừa với code mới.** Test đỏ nghĩa là một trong hai
   bên sai — phải xác định bên nào trước khi đụng vào. Chỉ sửa test khi hành vi
   mong muốn thực sự đổi (VD đổi tên nhãn trên giao diện), và phải nói rõ trong
   commit là đổi cái gì, vì sao.
2. **Thêm tính năng thì thêm bài test.** Tối thiểu: một bài cho đường đúng, một
   bài cho đường sai mà người dùng hay đi nhầm.
3. **Kiểm tra bài test có thật sự bắt lỗi hay không.** Sửa hỏng có chủ ý đúng
   cái chốt vừa viết (bỏ một dòng, đảo một điều kiện) rồi chạy lại — không bài
   nào đỏ nghĩa là bài test vô nghĩa, phải viết lại. Cách này đã bắt được 3 bài
   test vô nghĩa trong chính file này.
4. **Selector trong test phải trỏ đích danh.** Thêm `<select>` hay `<button>`
   vào một khối sẵn có sẽ làm `locator('select')` khớp nhiều phần tử và test vỡ.
   Đặt class riêng cho phần tử mới (`payer-select`, `chip-remove`, `ganh-ho-label`)
   thay vì vá selector.

---

# Những quy tắc không được phá

Phần này là phần quan trọng nhất. Các bài test bên dưới chỉ là cách kiểm tra
những điều sau, nếu phải viết lại test thì vẫn phải giữ đúng các điều này.

## Tiền

- **Tổng thu không bao giờ vượt tổng chi.** `distributeShares` làm tròn **xuống**
  và **bỏ phần lẻ** — thà thiếu vài nghìn còn hơn để một người trả nhiều hơn
  người khác.
- **Chia đều trước, dời phần sau.** Chuyện "ai mời ai" được xử lý bằng cách dời
  phần của người được mời sang người mời, **sau** khi đã chia đều — không bao giờ
  nhân trọng số rồi chia lại. Chia lại theo trọng số sẽ ra tổng khác vì làm tròn.
- **Thứ tự 5 bước trong `computeSummary` không được đổi.** Đổi thứ tự là sai tiền.
  Đặc biệt: khoản tài trợ đã hứa mà chưa đưa phải cộng ngược **sau** bước miễn
  phần nhậu, nếu không khoản nợ đó bị xoá mất.
- **Bảng chia tiền và bảng chuyển khoản phải dùng chung một nguồn số.**
  `roundShares()` và `computeSummary()` là nơi duy nhất tính, giao diện không
  được tự cộng trừ lại.

## Dữ liệu

- **Không ai đổi được chủ của một buổi**, trừ admin qua `claimEvent()`.
- **`createdAt` bất biến** với mọi người, kể cả admin.
- **Xoá người phải dọn sạch mọi chỗ trỏ tới họ**: người tham gia khoản, người
  trả khoản, người chia tiền, ảnh QR, và cặp "ai mời ai".
- **`ganhHoHopLe()` là nơi duy nhất định nghĩa cặp mời hợp lệ.** Tầng dữ liệu và
  tầng tính tiền phải gọi chung hàm này, không được tự kiểm tra riêng.
- **Firestore từ chối `undefined`** — mọi bản ghi phải đi qua `cleanPerson` /
  `cleanRound` / `cleanSponsor` cả lúc đọc lẫn lúc ghi.

## Không được nuốt lỗi

- **Lỗi quyền truy cập phải hiện ra**, không được lặng lẽ trả về danh sách rỗng.
  Màn hình trống trơn trông y hệt "chưa có dữ liệu", người dùng tưởng mất hết.
- **Truy vấn admin không được lùi lặng lẽ** về "chỉ buổi của mình" khi bị rules
  chặn — lùi lặng lẽ thì không ai biết `firestore.rules` đang sai.

## Giao diện dễ mất dữ liệu

- **Ô nhập tiền phải ghi vào bản nháp ngay từng phím.** Chỉ ghi lúc rời ô là mất
  tiền khi bấm Cmd+S giữa chừng.
- **Ô chọn người (người trả, người chia tiền) phải có lựa chọn rỗng** khi chưa
  chọn ai. Thiếu nó, trình duyệt tự hiện tên người đầu danh sách trong khi dữ
  liệu vẫn trống — tổng tiền lệch mà không rõ vì sao.
- **Bấm chip không được vẽ lại cả khoản chi** — vẽ lại giữa chừng làm mất con
  trỏ đang gõ ở ô khác.
- **Thanh Lưu không được đè lên nội dung** và ăn mất cú click.

---

# Danh sách bài test

## A. Phép tính tiền — `tests/settlement.test.mjs` (31 bài)

### Chia đều (3)

1. mọi người trả đúng bằng nhau, phần lẻ bỏ qua
2. chia hết thì không thừa
3. không có ai thì trả về rỗng, không chia cho 0

### Khoản chi và người tham gia (2)

4. một khoản chi, một người trả, ba người tham gia
5. người không tham gia khoản nào thì không phải trả khoản đó

### Tài trợ (5)

6. tài trợ trừ đều vào phần mọi người phải trả
7. người tài trợ cũng tham gia, bỏ tích chia phần → miễn hẳn phần nhậu
8. tài trợ 800 chưa đưa tiền, bỏ tích chia phần → vẫn nợ 800
9. tài trợ chưa đưa tiền nhưng vẫn tích chia phần → nợ cả hai phần
10. tài trợ đã đưa tiền rồi thì không nợ gì thêm

### Trả nợ, cộng dồn nhiều buổi (6)

11. trả bớt một phần thì trừ đúng phần đã trả
12. cộng dồn nợ theo tên qua nhiều buổi, đã trừ phần trả góp
13. trả đủ rồi thì không còn trong danh sách nợ
14. buổi chưa chọn người chia tiền thì bỏ qua, không làm vỡ phép tính
15. tách tài trợ chưa đưa thành nhóm có và không có trong danh sách
16. **tổng thu không bao giờ vượt quá tổng chi**

### Ai mời ai (11)

17. phần của người được mời dồn sang người mời *(900, A mời B → A 600, B 0, C 300)*
18. **tổng phải trả vẫn đúng bằng số tiền của khoản** — bài chốt cách làm tròn
19. không mời ai thì kết quả y như cũ
20. một người mời được nhiều người
21. mỗi tăng một kiểu — tăng 1 được mời, tăng 2 tự trả
22. dây chuyền bị chặn — A mời B, B mời C thì bỏ cặp của B
23. vòng lặp bị chặn — A mời B, B mời A thì bỏ cả hai
24. bỏ cặp khi người được mời không tham gia khoản đó
25. bỏ cặp khi một trong hai người đã rời buổi
26. người mời rời buổi → người được mời trả lại phần của mình
27. người mời không dự khoản đó vẫn gánh được

### Mời + tài trợ (4)

28. **người được mời về 0, KHÔNG âm** — không dồn giảm trừ thì app bảo người được
    mời còn được nhận lại tiền
29. được mời một nửa thì chuyển một nửa phần giảm trừ
30. không mời ai thì phần tài trợ tính y như cũ
31. người được mời không nằm trong danh sách cần chuyển khoản

## B. App trong trình duyệt — `tests/browser.mjs` (165 bài)

Mỗi khối mở một trang riêng với dữ liệu mẫu riêng, dùng Firebase giả lập trong
bộ nhớ (`tests/fake-firebase.mjs`). Bản giả cố tình khắt khe giống Firestore
thật ở hai điểm hay gây lỗi: từ chối `undefined`, và bắt giao dịch phải đọc xong
mới được ghi.

| Khối | Nội dung | Số bài |
|---|---|---:|
| 1 | App chính: vẽ dữ liệu, bản nháp, Lưu/Huỷ, thêm–xoá người, tải QR | 45 |
| 2 | Đăng nhập bằng tên, tạo buổi, phân quyền thường/admin | 9 |
| 3 | Link chia sẻ (không đăng nhập) | 5 |
| 2a2 | Nút Lưu trong tab Chỉnh sửa | 7 |
| 2a3 | Chip người tham gia: bấm tên để chọn người chia tiền, bấm X để xoá | 7 |
| 2a4 | QR trên trang chia sẻ: xem, tải về, phóng to | 5 |
| 2b | Gõ tiền rồi bấm Cmd+S ngay khi con trỏ còn trong ô | 3 |
| 2c | Ô "đã trả" là ô chữ, không có nút +1/−1 | 3 |
| 2c2 | Bảng chia theo từng tăng + link riêng cho mỗi buổi | 14 |
| 2c3 | Link chia sẻ cũng hiện bảng từng tăng | 1 |
| 2d | Tab "Ai chưa trả" | 4 |
| 2d2 | Admin nhận buổi của tài khoản khác về tài khoản mình | 10 |
| 2d3 | Người thường KHÔNG đổi được chủ buổi (cả qua giao diện lẫn gọi thẳng hàm) | 5 |
| 2d4 | Bấm "Nhận về" hai lần: lần hai không làm gì, không nhân đôi | 3 |
| 2d5 | Ai mời ai: nhập, chặn cặp sai, hiện trong bảng, lưu xuống DB | 14 |
| 2d6 | Xoá người mời → người được mời tự trả lại, không còn cặp treo | 3 |
| 2d7 | Giấu dòng: giấu đúng người, ô trống không kèm chữ gì | 3 |
| 2e | Buổi chưa chọn người chia tiền | 7 |
| 2f | Lỗi quyền truy cập phải hiện ra, không được nuốt | 1 |
| 2g | Rules chặn truy vấn admin → phải báo lỗi, không im lặng hiện thiếu | 1 |
| 3b | Khoản chi chưa chọn ai trả | 7 |
| 4 | Công cụ nhập dữ liệu cũ (chạy hai lần không nhân đôi) | 7 |
| 5 | Chưa điền `config.js` → báo rõ cần làm gì | 1 |

### Mấy bài dễ bị hiểu nhầm là thừa

- **1 › "dải thống kê chỉ hiện MỘT lần"** — có lúc cả `index.html` lẫn
  `eventResultsHtml()` cùng vẽ, ra hai dải giống hệt nhau.
- **1 › "bấm lại vào ô tiền → số vừa gõ còn nguyên"** — bài này sinh ra từ lỗi
  mất tiền: ô tiền nạp lại giá trị cũ khi được bấm vào.
- **2a3 › "thanh Lưu không đè lên hàng người tham gia"** — dùng `elementFromPoint`
  quét đúng toạ độ nút X. Thanh Lưu từng `position: sticky` và ăn mất cú click.
- **2d3 › "người thường gọi thẳng claimEvent → bị từ chối"** — ẩn nút chỉ là
  chuyện giao diện. Hai bài phía trên nó (danh sách trống, không có nút) **không**
  chứng minh được điều kiện `isAdmin` ở nút, vì danh sách của người thường vốn đã
  trống. Bài này mới là bài có giá trị.
- **2d7** — khối 2d5 không với tới được hai đường: ở đó mọi người đều tham gia
  khoản duy nhất nên không ô `—` nào được vẽ, và ai ứng tiền cũng đều còn phải
  trả. Thiếu 2d7 thì bỏ chốt `daTra` hay nhét chữ vào ô `—` đều lọt qua.

### Phần KHÔNG có test nào phủ

Phải tự kiểm bằng mắt khi đụng vào:

- **`firestore.rules`** — Firebase giả trong bộ test không áp rules, và môi
  trường này không chạy được emulator. Mỗi lần sửa rules phải tự đối chiếu khi
  dán lên Firebase Console, và nhớ dán **toàn bộ file**, đừng chèn thêm dòng.
- **Nhánh người thường trong `allow update`** của `events` (chặn người thường đổi
  chủ buổi) — muốn thử phải đăng nhập bằng tài khoản khác.
- **Điều kiện `isAdmin` ở nút "Nhận về"** trong `results.js` — lớp chặn thứ hai,
  không có đường nào chạm tới vì `listEvents` đã lọc sẵn.
