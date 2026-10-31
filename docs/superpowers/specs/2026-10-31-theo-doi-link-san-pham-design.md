# Theo dõi link sản phẩm gửi khách

## Vì sao làm

Trân gửi link sản phẩm cho khách qua chat Zalo, một khách có thể nhận nhiều lần. Hiện nút "Copy link"
đưa thẳng link Facebook nên không biết khách có xem không. Trân cần biết sản phẩm đã gửi có được khách
quan tâm không, khách thích mẫu nào hơn, để quyết định chăm tiếp thế nào hay gửi thêm mẫu khác.

## Mục tiêu

- Mỗi cặp khách + sản phẩm có một link riêng, Trân tạo từ mục Sản phẩm.
- Hỗ trợ link YouTube và Facebook. Link khác vẫn đếm được lượt mở.
- Đo cho từng khách, từng sản phẩm: số lần mở, thời gian xem, số lần tương tác (Facebook: bấm sang Facebook;
  YouTube: bấm phát video), lần xem gần nhất.
- Xem kết quả ở hai chỗ: chi tiết lead (theo khách) và bảng Sản phẩm (theo sản phẩm).
- Trân làm được cả hai việc trong chat với Claude qua MCP: nhờ tạo link cho khách và hỏi số liệu.

## Không làm ở bản này

- Claude tự gửi tin Zalo cho khách: Claude chỉ tạo link, Trân tự dán sang Zalo.
- Nhắc việc tự động khi khách mở link.
- Lịch sử từng lượt xem (chỉ lưu số cộng dồn và mốc đầu/cuối).
- Tên miền riêng (đã chốt dùng `huyentran.vercel.app`, đổi sau được).
- Đo thời gian khách ở trong Facebook: không làm được.

## Điều không được xảy ra

- Giao diện khách trông khác lạ. Trang chỉ có bài Facebook trên nền trắng, không tiêu đề, logo hay nút của mình.
- Lộ thông tin nội bộ: trang và URL không chứa tên khách, UID, giá trong CRM hay bất kỳ dữ liệu lead nào.
- Đếm khống: bot tạo thẻ xem trước của Zalo không được tính là khách mở.
- Link cũ chết: link đã gửi vẫn mở được dù sản phẩm sau đó bị sửa hoặc xoá.

## Trải nghiệm

**Trân.** Mẫu: `tao-link-v1.html`. Tài khoản chỉ xem không thấy các nút dưới đây. "Copy link" giữ nguyên.

1. Bảng Sản phẩm có ô tick đầu dòng. Tick từ 1 mẫu trở lên thì hiện thanh "Đã chọn N sản phẩm · Bỏ chọn · Gửi cho
   khách". Mỗi dòng có thêm "Gửi khách" để gửi đúng một mẫu, không cần tick. Giới hạn 10 mẫu một lần, khớp tool MCP.
2. Modal "Gửi cho khách nào?": ô tìm theo tên hoặc số điện thoại, tự focus. Khi chưa gõ, hiện các lead cập nhật gần đây
   (bỏ won/lost). Mỗi dòng có tên, giai đoạn, ngày cưới; nếu đã gửi một phần các mẫu đang chọn thì có nhãn "Đã gửi 1/2 mẫu".
   Bấm vào khách là tạo link ngay, không có bước xác nhận (tạo link không gửi gì cho khách, tạo nhầm cũng vô hại).
3. Modal "Link cho <khách>": mỗi mẫu một dòng có tên, URL và nút Copy, đổi thành "Đã copy" sau khi bấm. Có nút "Copy tất
   cả" (mỗi mẫu 2 dòng: tên rồi link, cách nhau dòng trống). Link đã có từ trước thì ghi "Link đã gửi trước đó · khách mở
   N lần". Đang tạo thì dòng đó hiện khung chờ; lỗi thì có "Thử lại" đúng dòng đó, các dòng khác vẫn dùng được.
4. Tìm không thấy khách: báo khách phải có trong CRM mới tạo được link, không tạo lead mới ở đây.
5. Trong chi tiết lead, khối "Sản phẩm đã gửi" có nút "Gửi sản phẩm": mở màn chọn mẫu với khách đã chọn sẵn, gợi ý mẫu
   đúng venue của lead lên đầu, chọn xong sang thẳng bước 3.
6. Điện thoại: modal thành tấm trượt từ dưới lên, nút cao tối thiểu 44px.

**Khách.** Trong Zalo thấy thẻ có ảnh bìa và tên sản phẩm. Bấm vào thấy bài Facebook nhúng. Chạm vào bất kỳ
đâu trên bài thì sang đúng bài đó trên Facebook. Thanh địa chỉ hiện `huyentran.vercel.app`.

**Theo khách.** Khối "Sản phẩm đã gửi" trong chi tiết lead: tên sản phẩm, số lần mở, thời gian xem, lần xem gần
nhất, nhãn. Sắp xếp nhãn cao trước.

**Theo sản phẩm.** Bảng Sản phẩm thêm 3 cột: Đã gửi, Khách mở, Tương tác (đếm số khách, không đếm số lượt).

**Trong chat với Claude.** Trân nói "gửi sản phẩm tone be ở An Lâm cho chị Mai Anh". Claude tìm lead và sản phẩm,
tạo link, trả về từng tên sản phẩm kèm link để Trân dán sang Zalo. Trân hỏi "chị Mai Anh xem mấy mẫu tuần này chưa"
hoặc "mẫu nào được mở nhiều nhất", Claude trả số liệu và nhãn như trong app.

Mẫu giao diện: `.superpowers/brainstorm/2521-1793421326/content/` (`luong-tracking.html`, `trang-khach-v2.html`).

## Kỹ thuật

Tất cả nằm trong `api/mcp.ts` theo quy ước một file; logic thuần phía web để trong `web/link-gui.js`.
Không cần sửa Firebase Rules: service account ghi, app đọc qua nhánh `aiData*` đã có quyền.

### Dữ liệu

- `linkXem/<token>`: bảng tra toàn cục, chỉ server đọc được (rules mặc định chặn), gồm
  `{ aiRoot, tieuDe, anh, linkGoc, nenTang, ytId }`. Đây là bản chụp lúc tạo nên link không chết khi sản phẩm đổi.
  `nenTang` là `facebook`, `youtube` hoặc `khac`.
- `<aiRoot>/linkGui/<token>`: `{ leadId, venueId, spId, tenSp, nenTang, taoLuc, soLanGui, soLanMo, tongGiay, soLanTuongTac, lanDau, lanCuoi }`.

Dùng nhánh `aiData*` để heartbeat không kích hoạt `onValue(dataRef)` của toàn bộ CRM. App lắng nghe
`linkGui` riêng theo cách các khối AI đang làm. Ghi đếm bằng `{".sv":{"increment":n}}` qua PATCH để nhiều
lượt cùng lúc không đè nhau.

Token là chuỗi ngẫu nhiên 10 ký tự chữ + số.

### Endpoint

Thêm các nhánh `mode` trong `fetch` và rewrite trong `vercel.json`:

- `POST /api/link-gui` (`mode=linkGui`): xác thực ID token như `xuLyAdmin`, cho phép chủ kho hoặc admin không
  bị khoá. Body `{ khoUid, leadId, venueId, spId }`. Kiểm tra lead và sản phẩm có thật, link là http(s).
  Nếu cặp lead + sản phẩm đã có link thì trả lại link cũ và tăng `soLanGui`. Tách phần kiểm tra quyền dùng chung
  với `xuLyAdmin`, không chép.
- `GET /xem/<token>` (`mode=xem`): trả HTML có `og:title`, `og:image`, iframe và lớp phủ. Token lạ trả trang
  trắng có dòng "Link không còn hiệu lực" với status 404. Mọi giá trị đưa vào HTML đều escape.
- `POST /api/xem-su-kien` (`mode=xemSuKien`): nhận `{ t, loai: 'mo'|'giay'|'tuongTac', giay }`, không cần đăng nhập.
  Kiểm tra token tồn tại, chỉ nhận đúng 3 loại, `giay` trong 1..30. Không lưu IP, user agent hay thông tin thiết bị.

### Tool MCP

Cả hai tool và endpoint `/api/link-gui` gọi chung một hàm tạo link. Kho lấy từ `dataRoot()`, không nhận từ tham số.

- `create_product_links`: nhận `leadId` và mảng `{ venueId, spId }` (tối đa 10), trả `{ tenSp, url }` cho từng sản
  phẩm. Claude dùng `find_venue_products` có sẵn để tìm theo venue/tone và tool tìm lead có sẵn để lấy `leadId`.
  Ghi thẳng, không qua hàng chờ duyệt, vì không sửa ô nào của lead. Mô tả tool ghi rõ: nếu tìm ra nhiều lead trùng
  tên thì hỏi lại Trân, và không tự nhận là đã gửi cho khách.
- `get_link_stats`: nhận `leadId` hoặc `venueId` + `spId`, hoặc để trống để lấy toàn kho. Trả số lần mở, thời gian xem,
  số lần sang Facebook, lần xem gần nhất và nhãn. Mô tả tool nhắc thời gian xem không gồm phần xem trên Facebook.

Sửa mô tả `find_venue_products`: bỏ ý "trả link để gửi khách", thay bằng hướng dẫn gọi `create_product_links` khi
gửi cho một khách cụ thể, nếu không Claude sẽ đưa thẳng link Facebook và không đo được.

Quy tắc nhãn **chép 2 nơi** (`web/link-gui.js` và `api/mcp.ts`), test chạy cùng bộ ca trên cả hai, và ghi vào `CLAUDE.md`.

### Chuẩn hoá link YouTube

- Nhận dạng `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/live/<id>`, `/embed/<id>`, cả tên miền `m.` và `www.`.
  ID phải khớp `^[A-Za-z0-9_-]{11}$`. Link kênh, playlist không có video cụ thể coi là `khac`.
- Ảnh thẻ: `https://img.youtube.com/vi/<id>/hqdefault.jpg`. Không cần gọi mạng nên không có độ trễ.

### Chuẩn hoá link Facebook

- Link `facebook.com/share/...`: gọi GET không theo redirect với UA `facebookexternalhit/1.1`, lấy `Location`
  đã bỏ query. Đã thử thật: UA trình duyệt bị 400, UA này trả 302 về link bài gốc.
- Lấy `og:image` từ cùng cách gọi, lỗi thì bỏ trống. Thẻ Zalo khi đó chỉ có tên sản phẩm.
- Timeout 5 giây. Nếu không đổi được link share thì vẫn tạo link, dùng link gốc.
- Link không phải Facebook hay YouTube: `/xem/<token>` trả trang rỗng, JS gửi `mo` rồi `location.replace` tới link đó, nên bot
  không bị tính. Không có thời gian xem.

### Trang khách

- `<iframe src="https://www.facebook.com/plugins/post.php?href=...&show_text=true&width=500">`, rộng theo màn
  hình, cao cố định theo chiều rộng. Đã thử thật với bài viết và album.
- Một thẻ `<a href="linkGoc">` trong suốt phủ kín iframe. Chạm vào là gửi `fb` rồi sang Facebook. Không dùng cách
  dò focus iframe vì không tin cậy trên điện thoại. Đánh đổi: không bấm Thích/Chia sẻ ngay trong bài nhúng.
- YouTube: trình phát YouTube trên nền trắng, rộng theo màn hình, tỉ lệ 16:9 (Shorts 9:16), không lớp phủ nên khách xem
  và tua như bình thường. Dùng IFrame Player API qua `www.youtube-nocookie.com`: lần phát đầu của mỗi lượt tải trang gửi
  `tuongTac`. Trình phát báo lỗi (101, 150 là chủ video chặn nhúng) thì tự chuyển sang link gốc trên YouTube.
- JS gửi `mo` khi tải trang, bỏ qua nếu `localStorage` có cờ `crmNoiBo` do app CRM đặt (cùng tên miền). Bot không
  chạy JS nên không tính.
- Khi trang đang hiển thị, cứ 15 giây gửi `giay=15` bằng `sendBeacon`. Dừng khi `visibilitychange` sang ẩn, chạy
  lại khi hiện. Tối đa 30 phút cho một lần tải trang.
- Bọc mọi lời gọi tracking để lỗi không ảnh hưởng việc xem.

### Nhãn (`web/link-gui.js`)

- **Quan tâm**: có tương tác, hoặc mở từ 2 lần, hoặc xem từ 60 giây.
- **Xem qua**: có mở nhưng chưa đạt mức trên.
- **Chưa mở**: chưa có lượt nào.

## Test

- `npm run test:link-gui`: hàm thuần (nhãn, chuẩn hoá link, kiểm tra sự kiện), không chạm Firebase.
- `npm run test:mcp-link-gui`: endpoint và hai tool MCP trên sandbox `aiDataTest` (tạo, tái dùng link, tăng đếm, token sai, sai quyền, đúng kho).
- `npm run test:link-gui-ui`: khối trong lead và cột bảng, chống XSS, chế độ chỉ xem (Chrome ngầm).
- Kiểm thử tay trên điện thoại thật sau deploy: mở từ Zalo iOS và Android.

## Rủi ro còn lại

- **Chưa thử trong trình duyệt của Zalo.** Embed mới thử trên trình duyệt thường. Không phát hiện được embed lỗi từ
  trang mình (iframe khác tên miền), khách sẽ thấy khung báo lỗi của Facebook. Phải thử máy thật trước khi Trân dùng.
- **Bài phải công khai.** Bài riêng tư hoặc đã xoá sẽ hiện lỗi trong khung nhúng.
- **Phụ thuộc Facebook.** Facebook có thể đổi hoặc chặn plugin nhúng và cách lấy `og:image`.
- **Thời gian xem thấp hơn thực tế với Facebook.** Không tính phần khách xem trên Facebook, nên dùng để so sánh tương
  đối. YouTube sát thực tế hơn vì khách xem ngay trên trang, nhưng không so trực tiếp được với Facebook. Thời gian là lúc
  trang đang mở, nên video tạm dừng mà trang còn mở vẫn được tính. Khách bấm nút YouTube trong trình phát để sang app thì
  phần xem ở đó không tính.
- **Số liệu không chống gian lận.** Ai có link đều gửi được sự kiện, và Trân tự bấm trong Zalo trên điện thoại vẫn bị đếm.
- **Quyền riêng tư.** Khách không được báo trước là đang được đo. Thiết kế chỉ lưu số đếm gắn với lead.

## Phần người làm tự quyết (đều là đề xuất của Claude, chưa được duyệt riêng)

Nhãn và ngưỡng; dùng lại một link cho cùng khách + sản phẩm; lớp phủ thay nút; lưu ở `aiData*`, nên tài khoản
được xem kho mà không có nhóm `ai` sẽ không thấy số liệu; nhịp 15 giây và trần 30 phút.
