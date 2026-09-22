# Brief thiết kế lại giao diện — HayDay CRM

## 1. Sản phẩm là gì

CRM bán hàng nội bộ của **HayDay Wedding**, một studio chụp ảnh và quay phim cưới. Người dùng chính là **Huyền Trân (sale)**. Mỗi tháng có khoảng 90 lead (cặp đôi sắp cưới). Chị dùng CRM cả trên **máy tính** lẫn **điện thoại**, tối nào cũng mở. Ngoài chị ra:

- **Sếp** xem báo cáo qua một link "chỉ xem", có mật khẩu.
- Một **extension Chrome** hiện thanh bên cạnh Zalo web, dùng để gắn hội thoại Zalo vào lead.

Mục tiêu thiết kế lại: **đẹp, hiện đại, đọc nhanh**. Chỉ cần liếc là biết hôm nay phải làm gì, khách nào đang chờ, deal nào sắp chốt. Tất cả chức năng hiện có phải còn nguyên.

## 2. Trong gói có gì

| File / thư mục | Là gì | Cách mở |
|---|---|---|
| `crm-demo.html` | CRM thật, bản hiện tại, chạy **offline với dữ liệu giả**. Không cần đăng nhập. | Mở bằng Chrome. Bấm thử được mọi nút; dữ liệu mất khi tải lại trang. |
| `trang-chia-se-demo.html` | Trang báo cáo "chỉ xem" cho sếp. | Mở bằng Chrome, nhập mật khẩu bất kỳ. |
| `zalo-thanh-ben/index.html` | Thanh bên của extension, hiện cạnh Zalo web, rộng khoảng 360px. | Cần mở qua một web server tĩnh vì dùng ES module. Xem ảnh chụp là đủ. |
| `anh-chup/` | Ảnh chụp **mọi màn hình**: sáng/tối, máy tính (1440px) và điện thoại (390px). | |

Có thể mở thẳng từng màn trong `crm-demo.html` bằng tham số trên đường dẫn:
- `?view=dashboard` hoặc `?view=conversations`
- `&conv=c01`: mở một hội thoại
- `&lead=L01`: mở chi tiết lead
- `&add=1`: mở form thêm lead
- `?lock=1`: màn đăng nhập
- `&theme=sang` hoặc `&theme=toi`: ép giao diện sáng/tối

**Toàn bộ dữ liệu trong gói là dữ liệu giả, không có thông tin khách thật.**

## 3. Các màn hình và chức năng

### CRM (`crm-demo.html`)

1. **Đăng nhập:** email + mật khẩu. Có lời chào theo buổi (sáng/trưa/tối) và trang trí hoa tulip.
2. **Khung chung:**
   - **Thanh bên trái:** logo, 3 tab (Pipeline, Dashboard, Hội thoại kèm số khách đang chờ), ô "Nhắc nhở" (số việc hôm nay / 7 ngày tới), nút đổi giao diện Tự động/Sáng/Tối, "Chia sẻ chỉ xem", "Kết nối Claude", Đăng xuất. Thanh này thu gọn được.
   - **Thanh trên:** tiêu đề trang, ô tìm theo tên, lọc theo gói, lọc theo trạng thái hạn, trạng thái đồng bộ, nút **Thêm lead**.
3. **Pipeline (kanban):**
   - Cột theo giai đoạn: Lead in → Báo giá → Follow up 1/2/3 → Nuôi dài hạn → Won. Lost không có cột riêng.
   - Mỗi cột có số lead và tổng doanh thu.
   - Card lead gồm: tên, ngày cưới, gói, loại lead, doanh thu, trạng thái hạn (trễ hẹn / hôm nay / sắp tới), số việc đã xong, nhãn 🔥 Tiềm năng, chip Zalo ("Khách chờ trả lời · 2 giờ" màu đỏ, "Khách im 4 ngày" màu vàng).
   - Kéo thả card giữa các cột; nút "⋮" để chuyển nhanh giai đoạn.
4. **Chi tiết lead (drawer lớn):**
   - Thanh tiến độ giai đoạn.
   - Thông tin khách (tên, ngày cưới, Facebook, SĐT, lịch trình, chân dung khách, objection).
   - **Hội thoại Zalo** dạng bong bóng chat, có tìm kiếm và tab nếu có nhiều hội thoại.
   - Ghi chú (thêm/sửa/xoá).
   - Log hoạt động.
   - Gói, giai đoạn, doanh thu, tháng dự kiến chốt.
   - Việc cần làm, mỗi việc có hạn riêng.
   - Chốt Won (nhập doanh thu thực) / Lost (chọn lý do); Xoá lead.
5. **Thêm lead:** form trong modal.
6. **Dashboard:**
   - Lời chào, chọn kỳ (tuần/tháng/quý/năm/tuỳ chọn), lọc loại lead.
   - Thẻ số liệu: giá trị pipeline, doanh thu thực tế so với kế hoạch, dự kiến chốt, CR, deal cycle, lead trễ hẹn…
   - Phễu chuyển đổi, lý do mất deal, danh sách lead tiềm năng / dự kiến chốt, việc cần làm hôm nay, việc đã hoàn thành.
   - Bấm vào số liệu thì mở danh sách chi tiết.
7. **Hội thoại:**
   - Cột trái là danh sách mọi hội thoại Zalo đã gắn lead (mới nhất trên cùng), lọc Tất cả / Chờ trả lời / Khách im, ô tìm.
   - Cột phải là khung chat kèm nút "Mở lead".
   - Trên điện thoại: danh sách và khung chat chuyển qua lại.
8. **Các modal nhỏ:** chuyển giai đoạn nhanh, chốt Won, lý do Lost, danh sách lead theo số liệu, việc đã hoàn thành theo tuần, cấu hình link chia sẻ, kết nối Claude.

### Trang chia sẻ cho sếp (`trang-chia-se-demo.html`)

- Nhập mật khẩu → báo cáo chỉ xem: số liệu theo kỳ, phễu, danh sách deal, việc đã hoàn thành.
- Bấm vào deal để xem chi tiết: ghi chú, việc, log, hội thoại Zalo. Không hiện SĐT/Facebook của khách.

### Thanh bên extension Zalo (`zalo-thanh-ben/`, khoảng 360px, nằm cạnh Zalo web)

Có 7 trạng thái:
1. Chưa đăng nhập CRM
2. Chưa mở hội thoại
3. Hội thoại chưa gắn lead (3 nút: Tạo lead mới / Gắn vào lead có sẵn / Không phải khách)
4. Form tạo lead
5. Tìm lead để gắn
6. Đã gắn lead (thẻ lead thu gọn: chip chờ trả lời, đổi giai đoạn, gói, ngày cưới, hạn liên hệ, ghi chú nhanh, "Mở trong CRM")
7. Đã đánh dấu "không phải khách"

Dòng trạng thái đồng bộ nằm ở đáy.

## 4. Nhận diện hiện tại (được phép thay đổi)

- **Font:** Be Vietnam Pro (Google Fonts), 400–800.
- **Màu chủ đạo:**
  - Xanh lá: `#1FAE6F` (500), `#0F6E45` (700), nền `#EAF7F0` (50)
  - Chữ: `#1C2622` / `#5B6B64` / `#8B9992`
  - Nền trang `#F5F7F4`, thẻ `#FFFFFF`, viền `#E4E8E2`
- **Màu phụ theo nghĩa:**
  - Đỏ (trễ hẹn, chờ trả lời): `#DD525C`
  - Vàng hổ phách (sắp tới, khách im): `#C98A2E`
  - Hồng blush: `#E8899B`
  - Tím: `#8467C9`
  - Xám xanh: `#6E88A0`
- **Bo góc:** 6 / 10 / 18px. Trang trí hoa tulip (thương hiệu cưới).
- Chế độ tối có bảng màu riêng: nền `#101613`, thẻ `#18201C`, xanh sáng `#35C98A`.

## 4b. Vấn đề đang có (nhìn thấy trong ảnh chụp)

- **Điện thoại, thanh bên trái:** thanh bên thu thành cột icon nhưng các nút dưới cùng (Sáng/Tối, Chia sẻ chỉ xem, Kết nối Claude, Đăng xuất) vẫn cố hiện chữ nên bị cắt. Thanh bên cũng chiếm khá nhiều chiều ngang của màn hình nhỏ. Nên nghĩ lại cách điều hướng trên điện thoại, ví dụ thanh tab dưới đáy.
- **Điện thoại, Pipeline:** mỗi lần chỉ thấy một cột, phải vuốt ngang mới sang giai đoạn khác, khó nắm tổng thể.
- **Chi tiết lead** rất dài (nhiều khối xếp chồng), phải cuộn nhiều. Nên sắp xếp lại thứ tự ưu tiên thông tin.
- Nhiều chữ nhỏ và nhạt (11–12px, màu xám nhạt), khó đọc lúc tối.

## 5. Bắt buộc giữ

- **Tiếng Việt có dấu** ở mọi nơi. Font phải hiển thị dấu tiếng Việt đẹp.
- **Hai chế độ sáng và tối**, cả hai đều đọc tốt. Chế độ "Tự động" bật tối từ 18h tới 6h.
- **Dùng tốt trên điện thoại** từ 360px trở lên: không tràn ngang, nút đủ lớn để bấm bằng ngón tay.
- **Không bỏ chức năng nào** ở mục 3. Được phép sắp xếp lại, gộp hoặc đổi cách trình bày.
- **Màu mang nghĩa phải giữ nghĩa:** đỏ = gấp hoặc trễ, vàng = cần để ý, xanh = ổn hoặc đã xong. Không truyền đạt ý nghĩa chỉ bằng màu, phải kèm chữ hoặc icon.
- **Độ tương phản** đạt tối thiểu WCAG AA.
- **Kỹ thuật:** app là **một file HTML + CSS + JavaScript thuần** (không React, không bước build), chỉ tải thêm Google Fonts. Thiết kế nên hiện thực được bằng HTML/CSS thuần. Không dùng thư viện UI hay framework CSS.

## 6. Nên trả về dạng gì

Theo thứ tự ưu tiên:

1. **Bộ design token:** biến CSS cho màu (sáng + tối), font, cỡ chữ, khoảng cách, bo góc, đổ bóng. Viết dạng `:root { --... }` và `[data-theme="dark"] { --... }`.
2. **Mockup HTML/CSS cho từng màn** ở mục 3, tốt nhất là **sửa thẳng trên `crm-demo.html`**:
   - Được đổi thoải mái CSS và cấu trúc hiển thị.
   - **Giữ nguyên các `id`, các thuộc tính `onclick="..."` / `oninput="..."` và tên hàm JavaScript**, vì phần xử lý dữ liệu bám vào chúng.
   - Nếu phải đổi cấu trúc lớn thì ghi chú lại để dev nối lại logic.
3. **Mô tả trạng thái:** hover, đang tải, trống, lỗi. Kèm cách hiển thị trên điện thoại cho những màn có khác biệt.

Dev sẽ đưa thiết kế vào code thật và giữ nguyên toàn bộ logic, dữ liệu và kết nối Firebase.

**Ưu tiên màn hình:** Pipeline → Chi tiết lead → Hội thoại → Dashboard → Thanh bên Zalo → Trang chia sẻ → các modal.
