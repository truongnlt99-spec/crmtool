# Venue + kho sản phẩm theo tone — thiết kế

## Vì sao

Khi tư vấn, Trân hay cần **gửi cho khách link bài Facebook HayDay đã làm tại đúng venue khách
tổ chức** (ví dụ "ảnh HayDay chụp ở Chloe Gallery"), hoặc mẫu đúng tone khách thích. Hiện các link
này không nằm ở đâu trong CRM, còn tên venue chỉ có trong ô chữ tự do `schedule` của lead
("tiệc tối tại White Palace…"). Mục tiêu: tra nhanh "sản phẩm ở Gem Center", "mẫu tone xanh",
copy link gửi khách — trong app và qua Claude (MCP).

## Mục tiêu

1. Menu **Venue** ở thanh bên trái: danh sách venue, tạo/sửa/xoá venue, mỗi venue có danh sách sản phẩm.
2. **Sản phẩm** = link (thường là bài Facebook) + tên/mô tả ngắn + giá/gói (chữ tự do, tuỳ chọn)
   + **một hoặc nhiều tone**. Mỗi sản phẩm có nút **copy link**.
3. Tìm/lọc sản phẩm theo chữ (không dấu), theo tone, theo venue.
4. **Tone**: danh sách mặc định cố định có chấm màu — Trắng, Xanh lá, Xanh dương, Hồng, Đỏ,
   Vàng/Champagne, Tím, Be/Nude, Pastel, Đen. Người dùng thêm tone mới, lưu vào kho của tài khoản.
5. Lead có ô **Venue dự kiến** = chọn **1** venue (dropdown có tìm kiếm, tạo nhanh venue mới ngay tại đó).
6. **Venue mẫu**: app đề xuất venue rút từ dữ liệu lead hiện có, Trân tick cái nào thì tạo cái đó và
   gắn vào các lead khớp.
7. **MCP**: liệt kê venue, tìm sản phẩm (theo venue / tone / chữ), thêm sản phẩm thẳng vào kho,
   đề xuất gắn venue cho lead qua hàng chờ duyệt.

## Không làm

- Không tự lấy ảnh/tiêu đề từ link Facebook (không có ảnh xem trước).
- Không có ô sảnh/khu vực riêng — **mỗi chi nhánh là một venue riêng** ("White Palace Võ Văn Kiệt",
  "Pavillon Tân Sơn Nhất"); sảnh nếu cần thì ghi trong tên/mô tả sản phẩm.
- Lead chỉ gắn 1 venue, không gắn nhiều.
- Không dùng AI để đoán venue mẫu mỗi lần; không tự gắn venue cho lead mới về sau.
- Không có thư viện venue dùng chung giữa các tài khoản.

## Phản mục tiêu (làm vậy là hỏng dù "chạy được")

- App ghi venue mà **làm mất sản phẩm Claude vừa thêm** cùng lúc (hoặc ngược lại).
- Chế độ chỉ xem kho người khác mà vẫn ghi được venue/sản phẩm/tone.
- Link/tên do người dùng hoặc Claude nhập được vẽ ra không escape (XSS), hoặc link `javascript:`.
- Seed venue gắn sai lead hàng loạt mà Trân không thấy trước.

## Dữ liệu

Venue nằm **trong kho CRM của tài khoản** (`crmData` cho chủ cũ, `crmData_users/<uid>` cho tài khoản
khác) → rules hiện có đã che, không phải sửa `firebase-rules*.json`. Các cấu trúc mới:

```
<kho>/venues/<venueId> = {
  id, ten, taoLuc,
  sanPham: { <spId>: { id, ten, link, gia?, tone: [toneId, ...], taoLuc } }
}
<kho>/toneMau/<toneId> = { id, ten, mau: '#rrggbb' }      // chỉ tone người dùng thêm
<kho>/leads/<leadId>/venueId = <venueId> | null
```

- Tone mặc định nằm trong code (`web/venue.js`), không ghi DB; danh sách hiệu lực = mặc định + `toneMau`.
- `link` chỉ nhận `http(s)://` — kiểm ở cả app và MCP.
- Xoá venue: hỏi xác nhận; lead đang gắn venue đó trở về "chưa có venue".
- Ghi luôn kiểu PATCH theo đường dẫn nhỏ nhất (quy ước repo). **App phải ghi theo từng sản phẩm**
  (`venues/<id>/sanPham/<spId>`) và từng ô meta của venue, không ghi đè cả venue — để không đè sản phẩm
  Claude vừa thêm. Cách làm (chốt khi lên plan): app ghi venue/sản phẩm/tone **ngay khi bấm** theo đường
  dẫn nhỏ nhất, không đi qua diff `tinhThayDoiCucBo()`; state venue luôn lấy lại từ snapshot máy chủ.

## Giao diện

- **Menu Venue** (thanh bên trái, cạnh các mục hiện có, icon vị trí). Màn Venue:
  - Thanh trên: ô tìm kiếm (không dấu, khớp tên venue + tên sản phẩm), hàng chip tone để lọc (bấm nhiều
    chip = khớp bất kỳ tone nào), nút "+ Venue", nút "Gợi ý venue từ lead".
  - Danh sách venue (trái/trên), chọn venue → danh sách sản phẩm của nó. Có chế độ "Tất cả venue" khi
    đang lọc tone/tìm chữ để thấy sản phẩm ở mọi venue.
  - Mỗi sản phẩm: tên, giá/gói, chấm tone, link mở tab mới, nút copy link, sửa, xoá.
  - Mỗi venue hiện số lead đang gắn.
  - Quản lý tone: thêm tone (tên + màu). Không sửa/xoá tone mặc định.
- **Chi tiết lead**: ô "Venue dự kiến" (dropdown tìm kiếm + "Tạo venue mới: …"). Bảng Danh sách
  (`web/bang-lead.js`) thêm cột Venue.
- **Chỉ xem**: ẩn/khoá mọi nút sửa; copy link vẫn dùng được.
- Nhóm ẩn theo quyền (`crm`/`zalo`/`ai` trong `web/phan-quyen.js`): Venue thuộc nhóm `crm`.
- Mobile: theo layout hiện có của app.

## Venue mẫu (seed)

- Khi code: đọc dữ liệu lead thật (chỉ đọc), rút ra danh sách venue cùng các cách viết, ghi sẵn
  vào `web/venue.js` dạng `VENUE_MAU = [{ ten: 'White Palace Võ Văn Kiệt', bietDanh: ['white palace vvk', 'white palace võ văn kiệt'] }, ...]`.
  Đã thấy trong dữ liệu (chưa đủ, builder rà lại cả `schedule`, ghi chú, `baoGia.*.diaDiem`): White Palace
  (+ VVK), Pavillon Tân Sơn Nhất, Pavillon C, Gem Center, Chloe Gallery, Capella Park View, Capella 3/2 Q10,
  Luxury Palace, Nikko, InterContinental, Mường Thanh, Maison de Charme Q7, An Lâm Retreats, Claris Thủ Đức,
  Pullman Phú Quốc, Thisky Hall, Gala Center, Amor Resort, Trống Đồng Long Biên, Asian Phan Đăng Lưu,
  TTTC The One, Diamond Palace, Mipec, Naman Retreat, Queen Plaza Kỳ Hoà, Adora Center, Lotte Sài Gòn,
  Cát Đằng Palace, The Rustic, Emmi Thủ Đức, Ái Huê, Riverside, Sala Beach Tuy Hoà, The Mira, Sân Golf Sông Bé,
  Hoa viên Tám Quỳnh.
- Nút "Gợi ý venue từ lead": so khớp (không dấu, không phân biệt hoa thường) `bietDanh` với `schedule`,
  ghi chú, `baoGia.*.diaDiem` của mọi lead → hộp thoại liệt kê "Tên venue — N lead (tên lead…)".
  Bỏ qua venue đã có trong kho (so tên không dấu). Trân tick → tạo venue + gắn `venueId` cho các lead khớp
  **duy nhất** venue đó và **chưa có** venueId. Lead khớp ≥2 venue thì liệt kê riêng "cần chọn tay",
  không tự gắn. Chạy lại bao nhiêu lần cũng không tạo trùng, không đè venue đã gắn.
- Thứ tự ưu tiên khi bí danh lồng nhau: "White Palace Võ Văn Kiệt" thắng "White Palace" (khớp dài nhất,
  chỉ tính một venue cho cùng đoạn chữ).

## MCP (`api/mcp.ts`)

Mọi tool đọc/ghi qua `dataRoot()`.

- `list_venues` — tên, id, số sản phẩm, số lead đang gắn.
- `find_venue_products({ venue?, tone?, q? })` — `venue` khớp tên không dấu (chứa), `tone` khớp tên tone
  không dấu ("xanh" khớp cả Xanh lá + Xanh dương), `q` khớp tên/giá sản phẩm. Trả venue, tên, link, giá, tone.
- `add_venue_product({ venue, ten, link, gia?, tone: string[] })` — ghi **thẳng** (không qua hàng chờ).
  `venue` là tên hoặc id; không có thì tạo venue mới với tên đó. Tone phải nằm trong danh sách hiệu lực,
  sai thì trả lỗi kèm danh sách tone hợp lệ. Link phải `http(s)://`. Trùng link trong cùng venue → không
  thêm, trả về sản phẩm đã có.
- Gắn venue cho lead: thêm `venueId` vào bộ ô đề xuất của hàng chờ (`FIELD_WHITELIST` / `kiemTraGiaTriO` /
  `giaTriBang`, **chép 2 nơi**: `web/ho-so-ai.js` + `api/mcp.ts`), giá trị phải là venueId đang tồn tại;
  thẻ đề xuất hiện tên venue. Claude không tự ghi `venueId` vào lead.
- `list_leads` / `get_lead` trả thêm tên venue.
- Danh sách tone mặc định có ở 2 nơi (`web/venue.js`, `api/mcp.ts`) — ghi chú "chép 2 nơi" như các hằng khác,
  và bổ sung vào CLAUDE.md.

## Test

- `web/venue.js` (hàm thuần: tone hiệu lực, lọc/tìm, khớp seed, kiểm link) → `test/venue.test.ts`, không chạm Firebase.
- Tool MCP mới → `test/mcp-venue.test.ts` trên sandbox `crmDataTest`.
- Vẽ màn Venue + thẻ sản phẩm chống XSS → `test/venue-ui.test.html` (Chrome ngầm), theo mẫu các test UI hiện có.
- `npm run test:html-tinh`, `npm run test:ho-so` vẫn qua sau khi thêm `venueId` vào whitelist.

## Để builder tự quyết

Bố cục chi tiết màn Venue, icon, mã màu tone mặc định, tên hàm/id, cách sinh id (theo kiểu id hiện có của app).

## Quyết định Claude tự đưa ra (Trường xem lại)

- Venue nằm trong `crmData` (không tạo nhánh gốc mới) → không phải dán rules mới.
- Ô giá/gói là chữ tự do, không ràng buộc vào `PACKAGES`.
- Lọc nhiều tone = khớp **bất kỳ** (không phải khớp tất cả).
- Seed chỉ gắn lead chưa có venue và khớp đúng 1 venue.
- MCP thêm sản phẩm với tone lạ → báo lỗi, không tự tạo tone.
- Trùng link trong cùng venue → không thêm lần hai.
