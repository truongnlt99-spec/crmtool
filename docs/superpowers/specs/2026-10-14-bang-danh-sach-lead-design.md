# View "Danh sách" — bảng lead kiểu Excel

**Ngày:** 2026-10-14
**Trạng thái:** Đã duyệt thiết kế, chờ duyệt spec

## Vấn đề

Pipeline (kanban) tốt để theo dõi từng lead theo giai đoạn, nhưng khó:

- nhìn **toàn bộ** lead (kể cả Won/Lost) cùng lúc và so sánh theo cột;
- lọc/sắp xếp theo bất kỳ trường nào (ngày cưới, deadline, doanh thu, tháng chốt…);
- sửa nhanh nhiều lead mà không phải mở chi tiết từng cái;
- đối chiếu với sổ sách / Excel bên ngoài.

## Mục tiêu

Thêm view **"Danh sách"**: bảng lead giống Excel để **rà soát, sửa nhanh trong ô, lọc theo
cột, và xuất .xlsx**, dùng song song (chuyển qua lại) với Pipeline trên cùng một dữ liệu.
80% dùng trên máy tính; điện thoại chỉ cần dùng được.

### Ngoài phạm vi (YAGNI)

- Bảng trong link chia sẻ `xem.html` / backend `/api/share` (để đợt sau).
- Kéo đổi thứ tự cột.
- Sửa nhiều ô cùng lúc, chọn vùng, copy/paste từ Excel vào bảng.
- Nhập (import) từ Excel.
- Giao diện riêng tối ưu cho điện thoại.

## Cách làm đã chọn

Tự viết bảng bằng JS thuần trong `index.html` (đồng bộ style/dark mode, gọi thẳng các hàm ghi
dữ liệu sẵn có). Thư viện ngoài **duy nhất** là SheetJS cho xuất `.xlsx`, **chỉ tải khi bấm
"Xuất Excel"** (không làm nặng lần mở app). Đã loại: thư viện grid (Tabulator/AG Grid — nặng,
khó khớp style và luồng Won/Lost) và tự sinh `.xlsx` bằng tay (dễ lỗi).

## Giao diện

### Vị trí

- Mục mới **"Danh sách"** ở menu bên, giữa Pipeline và Dashboard: thêm vào `VIEWS`
  (`list: { el:'viewList', nav:'navList', title:'Danh sách', sub:'Tất cả lead dạng bảng' }`).
- Điện thoại: mục "Danh sách" nằm trong tấm "Khác" (`menuKhacOverlay`).
- Ô tìm ở topbar **dùng chung** `searchQuery` với Pipeline (cùng quy tắc: khớp tên).
- `#filterPackage` / `#filterStatus` ở topbar **ẩn** khi `body[data-view="list"]` (bảng đã có
  lọc theo cột), giống cách đang ẩn ở Dashboard/Hội thoại. Bảng **không** áp `filterPackage`,
  `filterStatus`, `filterTag` của Pipeline — chỉ áp `searchQuery` + bộ lọc cột của chính nó.

### Thanh công cụ trên bảng

`[Cột ▾]  [Xuất Excel]   · Đang lọc 2 cột · Xoá lọc` (chip lọc chỉ hiện khi có lọc).

### Cột

Cột **Tên** luôn ghim trái (`position: sticky`) khi cuộn ngang. Tiêu đề bảng ghim trên khi cuộn dọc.

| Khoá | Tiêu đề | Lấy từ | Kiểu lọc | Sửa trong ô |
|---|---|---|---|---|
| name | Tên | `name` | chữ | ô chữ (bỏ trống → không lưu) |
| phone | SĐT | `phone` | chữ | ô chữ |
| facebook | Facebook | `facebook` | chữ | ô chữ |
| weddingDate | Ngày cưới | `weddingDate` | khoảng ngày | ô ngày |
| package | Gói | `package` | chọn nhiều (`PACKAGES`) | dropdown |
| leadType | Loại lead | `leadTypeOf(lead)` | chọn nhiều (`LEAD_TYPES`) | dropdown |
| stage | Giai đoạn | `stage` → `STAGE_MAP` | chọn nhiều (`STAGES`) | dropdown → `moveLeadToStage()` |
| status | Trạng thái hẹn | `leadStatus(lead)` | chọn nhiều (Trễ / Hôm nay / Còn hạn / Chưa hẹn / Won / Lost) | — |
| deadline | Deadline | `deadline` | khoảng ngày | ô ngày (chỉ khi chưa Won/Lost) |
| revenueExpected | DT dự kiến | `revenueExpected` | khoảng số | ô tiền |
| revenueActual | DT thực tế | `revenueActual` | khoảng số | ô tiền (chỉ khi Won) |
| expectedCloseMonth | Tháng dự kiến chốt | `expectedCloseMonth` | khoảng tháng | ô tháng |
| createdAt | Ngày tạo | `createdAt` | khoảng ngày | — |
| wonAt | Ngày Won | `wonAt` | khoảng ngày | — |
| lostAt | Ngày Lost | `lostAt` | khoảng ngày | — |
| lostReason | Lý do Lost | `lostReason` | chọn nhiều (`LOST_REASONS`) | — |
| tags | Tag | `tags` (nối bằng ", ") | chữ | — |
| todos | Việc | "xong/tổng" từ `todos` | khoảng số (số việc chưa xong) | — |
| lastNote | Ghi chú gần nhất | phần tử cuối của `notesList` (ghi chú mới được `push` vào cuối) (cắt ~80 ký tự, đủ nội dung ở `title`) | chữ | — |
| zalo | Zalo | có hội thoại gắn lead (`zaloConvsOf(id).length > 0`) | chọn nhiều (Có / Không) | — |

Hiển thị: ngày dạng `formatDate()`, tiền dạng `formatMoney()`, Gói/Loại dùng badge màu như thẻ
Pipeline, Trạng thái dùng màu `status-*` sẵn có.

### Sửa trong ô

- **Bấm đúp** ô sửa được → hiện ô nhập tương ứng ngay trong ô. **Enter** hoặc rời ô = lưu,
  **Esc** = huỷ. Dropdown/ô ngày lưu ngay khi chọn.
- Ghi qua đúng hàm sẵn có để giữ nguyên hành vi:
  - trường thường → `onFieldChange(id, field, value)` (lưu Firebase bằng `scheduleSave()`);
  - Giai đoạn → `moveLeadToStage(id, newStage)` → chọn Won/Lost vẫn bật hộp xác nhận doanh
    thu / lý do lost; huỷ hộp thì ô trở về giá trị cũ.
  - Tiền → `moneyInputValue()` như form hiện tại.
- Ô không sửa được: hiện con trỏ thường, bấm đúp không làm gì.
- **Bấm vào tên lead** → `openLead(id)` mở chi tiết như Pipeline.
- Đang sửa một ô mà dữ liệu đổi từ nơi khác (Firebase đồng bộ, MCP ghi) → **hoãn vẽ lại bảng**
  đến khi ô đó lưu/huỷ, để không mất chữ đang gõ.

### Lọc & sắp xếp kiểu Excel

- Mỗi tiêu đề có nút **▾** → menu nổi:
  - **Sắp xếp A→Z / Z→A** (một cột sắp xếp tại một thời điểm; bấm tiêu đề cũng đổi chiều sắp xếp);
  - phần lọc theo kiểu cột (bảng trên): *chữ* = ô "chứa…" (không phân biệt hoa thường/dấu);
    *chọn nhiều* = danh sách tick + "Chọn tất cả"; *khoảng ngày/tháng/số* = hai ô Từ – Đến
    (để trống một đầu = không giới hạn);
  - nút **Xoá lọc cột này**.
- Cột đang lọc: icon ▾ đổi màu nhấn. Giá trị rỗng: sắp xếp luôn xuống cuối; lọc khoảng loại
  dòng rỗng.
- Mặc định: không lọc, sắp xếp theo Ngày tạo mới nhất trước, hiện **tất cả** lead kể cả Won/Lost.

### Tuỳ chỉnh cột

- Nút **"Cột"** → danh sách tick ẩn/hiện từng cột (Tên luôn hiện) + "Khôi phục mặc định".
  Mặc định ẩn: Ngày Won, Ngày Lost, Lý do Lost, Ngày tạo (bật lên khi cần).
- **Kéo mép phải tiêu đề** để đổi độ rộng (tối thiểu ~60px).
- Lưu trong `localStorage` khoá `bangLeadCaiDat`: `{ an:[...], rong:{khoa:px}, sapXep:{khoa,chieu}, loc:{...} }`.
  Đọc/ghi bọc `try/catch`; hỏng/thiếu → dùng mặc định.

### Dòng tổng

Ghim cuối bảng: **"N lead"** + tổng **DT dự kiến** và **DT thực tế** của các dòng **đang hiện**
(sau tìm + lọc).

### Trạng thái trống

- Chưa có lead nào → lời nhắn + nút "Thêm lead" (gọi form thêm lead sẵn có).
- Có lead nhưng lọc ra 0 dòng → "Không có lead khớp bộ lọc" + nút "Xoá lọc".

### Xuất Excel

- Nút **"Xuất Excel"** → nạp SheetJS từ `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`
  (một lần, lần sau dùng lại) → tải file `Danh-sach-lead-YYYY-MM-DD.xlsx`.
- Nội dung = **đúng các dòng đang hiện (theo thứ tự đang sắp xếp) và các cột đang hiện**, tiêu đề
  tiếng Việt. Tiền là **số** (định dạng `#,##0`), ngày là **ngày Excel** (định dạng `dd/mm/yyyy`),
  tháng là `mm/yyyy`; Trạng thái/Giai đoạn là chữ hiển thị. Độ rộng cột trong file theo độ rộng
  đang dùng.
- Nạp thư viện lỗi (mất mạng) → toast "Không tải được công cụ xuất Excel, kiểm tra mạng rồi thử lại".

### Điện thoại

Bảng vẫn dùng được: cuộn ngang, cột Tên ghim, bấm đúp để sửa. Không có layout riêng.

## Kiến trúc code

### `web/bang-lead.js` — logic thuần (mới)

ES module, **không** đụng DOM/Firebase, nạp vào `index.html` bằng `<script type="module">` giống
`zalo-map.js` (gán `window.BangLead`). Đặt ở `web/` (không phải `lib/`) để không lẫn với quy tắc
"đừng tách `api/mcp.ts` sang `lib/`". Hàm thuần nhận các hàm/bảng tra từ ngoài vào (ví dụ
`leadStatus`, `STAGE_MAP`) qua tham số `ctx` để test được trong Node.

- `COT` — định nghĩa cột: `{ khoa, tieuDe, kieuLoc, laySoSanh(lead, ctx), layHienThi(lead, ctx), sua?, xuat(lead, ctx) }`.
- `locLead(leads, boLoc, searchQuery, ctx)` → mảng lead khớp.
- `sapXep(leads, {khoa, chieu}, ctx)` → mảng mới, rỗng xuống cuối, ổn định.
- `tinhTong(leads)` → `{ soLead, duKien, thucTe }`.
- `dongXuat(leads, cotHien, ctx)` → `{ tieuDe:[...], dong:[[...]] }` với giá trị kiểu thật
  (số / `Date` / chữ) để SheetJS ghi.
- `docCaiDat(chuoiJson)` / `macDinhCaiDat()` → cài đặt hợp lệ (bỏ khoá cột không tồn tại).
- `boDau(s)` — so khớp chữ không phân biệt dấu.

### `index.html` — giao diện

- `<section class="view" id="viewList">` + nút nav `navList` + mục trong `menuKhacOverlay`.
- `renderBangLead()`: vẽ thanh công cụ, `<table>` (thead ghim, cột Tên ghim, tfoot dòng tổng).
  Gọi trong `renderAll()`; `onFieldChange()` hiện chỉ gọi `renderPipeline()` → thêm gọi
  `renderBangLead()` khi view Danh sách đang mở.
- Menu lọc cột, menu "Cột", kéo độ rộng, sửa trong ô, xuất Excel — các hàm đặt cạnh nhau dưới
  một khối `/* ======================= RENDER: DANH SÁCH ======================= */`.
- Mọi chữ từ dữ liệu đi qua `esc()` (chống XSS như phần còn lại của app).
- CSS: dùng token màu sẵn có (`--green-*`, `--slate`…), tự hợp dark mode.

### Không đổi

`api/mcp.ts`, `xem.html`, Firebase rules, mô hình dữ liệu lead (không thêm trường mới).

## Xử lý lỗi

- Ghi Firebase: dùng nguyên `scheduleSave()` (đã có báo trạng thái đồng bộ).
- Tên bỏ trống khi sửa → giữ tên cũ.
- Cài đặt localStorage hỏng → mặc định.
- SheetJS không tải được → toast, không văng lỗi.

## Kiểm thử

- `test/bang-lead.test.ts` (Node, **không** chạm Firebase) — `npm run test:bang`:
  lọc chữ không dấu, lọc chọn nhiều, lọc khoảng ngày/số (kể cả để trống một đầu, giá trị rỗng),
  sắp xếp (rỗng xuống cuối, ổn định, tăng/giảm), dòng tổng, dòng xuất có kiểu thật, đọc cài đặt
  hỏng/có khoá lạ.
- Kiểm tra tay trên app chạy local trong trình duyệt: chuyển Pipeline ⇄ Danh sách, tìm kiếm dùng
  chung, sửa từng loại ô, đổi giai đoạn sang Won/Lost (hộp xác nhận hiện, huỷ thì ô về cũ),
  lọc/sắp xếp/ẩn cột/kéo độ rộng và tải lại trang vẫn nhớ, dòng tổng đúng, xuất .xlsx mở được
  trong Excel với số/ngày đúng kiểu, dark mode, khung điện thoại.
