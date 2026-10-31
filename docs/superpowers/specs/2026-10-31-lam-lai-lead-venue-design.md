# Làm lại màn chi tiết lead và màn Venue

Người dùng chọn bỏ qua phần hỏi đáp, nên mọi quyết định dưới đây là do Claude chọn, dựa trên đọc code và xem app thật. Trường duyệt trên PR trước khi lên production.

## Vấn đề

**Chi tiết lead**
- Màn cao gần 2.000px trên máy tính. Hồ sơ AI, sản phẩm đã gửi và gói đứng trước, nên việc cần làm và ghi chú nằm dưới nếp gấp; thông tin khách còn xuống sâu hơn.
- Hạn liên hệ (việc làm nhiều nhất) nằm lẫn trong form gói dịch vụ.
- Giai đoạn có hai chỗ đổi: hàng chip và ô chọn.
- Nút "Xóa lead" đứng cạnh Won/Lost, dễ bấm nhầm.

**Venue**
- Tab "Sản phẩm" và "Venue" tách rời: muốn lọc theo venue phải gõ vào ô gợi ý, muốn đổi tên venue phải sang tab khác.
- Lọc tone là ô chọn thả xuống, mỗi lần đổi phải bấm 2 lần.
- Mỗi dòng có 4 thao tác cùng cấp, "Gửi khách" không nổi hơn "Xoá".
- Điện thoại phải cuộn ngang bảng 10 cột.

## Chi tiết lead

Bố cục kiểu bàn làm việc: phần đầu đứng yên, mỗi cột tự cuộn.

- **Đầu màn:** tên, chip trạng thái, Won/Lost. Hàng giai đoạn chuyển lên đây, luôn thấy ở mọi tab. Bỏ ô chọn giai đoạn trùng lặp.
- **Cột trái, luôn thấy:** Thông tin khách → Gói & doanh thu → Lịch trình & chân dung → nút Xóa lead ở cuối cột.
- **Cột giữa, chia tab:** Việc & ghi chú / Hồ sơ AI (có số đề xuất chờ duyệt) / Báo giá & sản phẩm.
- **Cột phải, luôn thấy:** Hội thoại Zalo.

Theo độ rộng:

| Rộng | Bố cục |
|---|---|
| ≥ 1280px | 3 cột |
| 761–1279px | 2 cột, Hội thoại thành tab ở cột giữa |
| ≤ 760px | 1 cột, 5 tab, Won/Lost neo đáy |

Thêm:
- Khối "Hạn liên hệ tiếp theo" đầu tab Việc, có nút nhanh Hôm nay / Ngày mai / 3 ngày / 1 tuần.
- Link "Mở" cạnh Facebook, "Gọi" cạnh số điện thoại.
- Ctrl+Enter lưu ghi chú, Esc đóng màn chi tiết khi con trỏ không ở ô nhập.

Bỏ: thu gọn khối Hồ sơ (đã có tab riêng), thu gọn khối Thông tin (cột tự cuộn).

## Venue

- Tên màn đổi thành "Venue & sản phẩm", mở ra là tab Thống kê (đứng trước tab Sản phẩm). Trường yêu cầu sau khi xem bản đầu.
- **Lọc venue là một nút** cùng hàng chip tone, thay cho tab "Venue". Bản đầu là danh sách cố định bên trái, nhưng hơn 30 venue, đa số chưa có sản phẩm, vừa nhiều chữ vừa làm bảng phải cuộn ngang. Bấm nút mở hộp có ô tìm: chỉ tên + số sản phẩm, venue nhiều sản phẩm lên trước, venue trống gom xuống cuối. "+ Thêm venue" và "Gợi ý từ lead" nằm đáy hộp.
- Chọn một venue: tiêu đề phía trên bảng có số liệu, Đổi tên, Xoá; bảng ẩn cột Venue.
- **Tone là hàng chip** bấm một lần, bấm lại để bỏ, có chip "+ Tone".
- Mỗi dòng: "Gửi khách" nổi nhất, Sửa/Xoá chỉ hiện khi rê chuột hoặc focus. Màn cảm ứng luôn hiện.
- Điện thoại: chip tone cuộn ngang, mỗi sản phẩm là một thẻ thay vì dòng bảng.

## Không đổi

- Dữ liệu Firebase, Rules, MCP, cách lưu (`onFieldChange`, `scheduleSave`, ghi venue theo đường dẫn nhỏ nhất).
- Bộ màu, phông chữ, token hiện có.
- Chế độ chỉ xem, ẩn theo quyền `zalo` / `ai`.
- `index.html` vẫn là file duy nhất của app, không thêm thư viện.

## Kế hoạch

1. Khung HTML + CSS màn chi tiết lead, sắp lại khối trong `openLead`.
2. Hàng giai đoạn lên đầu màn, khối hạn liên hệ, link liên hệ, phím tắt, số đề xuất trên tab.
3. `renderVenue`: nút lọc venue, chip tone, tiêu đề venue; `veDongSanPham`: thao tác và thẻ trên điện thoại.
4. Test mới `test/lead-venue-ui.test.html` chạy hàm thật trích từ `index.html` với dữ liệu giả, không chạm Firebase.
5. Chạy toàn bộ test UI và test thuần, xem ở 3 độ rộng, sáng và tối.
