# Lưu báo giá vào lead (qua MCP)

**Ngày:** 2026-10-15
**Trạng thái:** Đã duyệt thiết kế, chờ duyệt spec

## Vấn đề

Trân làm báo giá cho từng khách **trên claude.ai** (mỗi khách một báo giá riêng: nhiều buổi, gói,
ưu đãi, tổng tiền, hạn ưu đãi), xuất thành ảnh rồi gửi qua Zalo. Extension chỉ ghi nhận "Hình ảnh",
nên CRM và hồ sơ khách AI không biết giá đã chào — thông tin bán hàng quan trọng nhất bị mất.

Đọc lại ảnh (OCR / vision) là đi đường vòng: lúc làm báo giá, Claude **đã có sẵn số liệu dạng chữ**.

## Mục tiêu

1. Tool MCP `save_quote` lưu báo giá **có cấu trúc** vào lead ngay khi Trân làm xong trên claude.ai.
2. Server **kiểm tra phép tính** (giá sau ưu đãi, tổng) — sai thì từ chối.
3. Lưu xong, server **tự tạo đề xuất vào hàng chờ** (doanh thu dự kiến, ngày cưới, gói, việc nhắc
   trước hạn ưu đãi) — lead chỉ đổi khi Trân bấm Duyệt.
4. App hiện khối **Báo giá** trong chi tiết lead; hồ sơ AI đọc được báo giá mới nhất.

### Ngoài phạm vi (YAGNI)

- Lưu ảnh báo giá (Firebase Storage cần gói Blaze; số liệu đã đủ, cần hình thì Claude dựng lại).
- Đọc ảnh trong tin Zalo (OCR / vision).
- Sửa / xoá báo giá trong app (báo giá sai → làm bản mới).
- Hiện báo giá trong link chia sẻ `xem.html` (đợt sau).
- Trạng thái báo giá (nháp / đã gửi / khách đồng ý).

## Cách làm đã chọn

**Lưu ngay trong lead**: `crmData/leads/<leadId>/baoGia/<baoGiaId>` (tài khoản khác:
`crmData_users/<uid>/leads/...`, qua `dataRoot()`). Báo giá là dữ liệu kinh doanh do Trân tạo, đi
cùng lead (xoá lead là xoá báo giá). Dữ liệu chữ nhỏ nên app tải thêm không đáng kể. Không cần đổi
Security Rules (rules `leads/$leadId` chỉ validate `id/name/stage/revenue*`).

Đã loại: lưu ở `aiData` (báo giá không phải dữ liệu AI, xoá lead để lại rác).

## Mô hình dữ liệu

```
leads/<leadId>/baoGia/<baoGiaId>: {
  taoLuc:      ISO string (server đặt),
  tieuDe:      string ≤ 200        // "Phương án quay chụp ăn hỏi & cưới"
  tenKhach:    string ≤ 100        // "Cô dâu Huyền Nguyễn"
  diaDiem:     string ≤ 100 | null // "Hà Nội"
  buoi: [ {                        // 1..6 buổi
    loai:        'anHoi' | 'cuoi' | 'khac',
    ten:         string ≤ 100      // "Lễ ăn hỏi"
    ngay:        'YYYY-MM-DD' | null,
    gio:         string ≤ 60 | null  // "3h - 5h chiều"
    soKhach:     string ≤ 30 | null  // "40-50"
    moTa:        string ≤ 300 | null // "Đón dâu sáng + tiệc tại The One"
    goi:         string ≤ 100      // "Combo 2 máy chụp", "Gói Standard"
    giaGoc:      integer ≥ 0       // 18000000
    uuDaiPhanTram: number 0..100   // 25
    giaSauUuDai: integer ≥ 0       // 13500000
    ekip:        string[] ≤ 10 mục, mỗi mục ≤ 200
    sanPham:     string[] ≤ 10
    quaTang:     string[] ≤ 10
  } ],
  tongGiaGoc:   integer ≥ 0,       // 47900000
  tongSauUuDai: integer ≥ 0,       // 41905000
  tietKiem:     integer ≥ 0,       // 5995000
  hanUuDai:     'YYYY-MM-DD' | null, // 2026-10-20
  ghiChu:       string[] ≤ 10      // ["Phụ phí chụp tiệc sau lễ ăn hỏi: 3.000.000 đ/máy"]
}
```

- `baoGiaId` = `bg_<base36 thời gian><4 ký tự>`; **bản mới nhất = `taoLuc` lớn nhất** là bản hiệu lực.
- Ghi bằng `patchPath(\`${dataRoot()}/leads/${id}/baoGia\`, { [baoGiaId]: ... })` — không đè bản cũ.
- Thêm một dòng `activityLog`: "Lưu báo giá: <tổng sau ưu đãi> (n buổi)" (dùng `logActivity` sẵn có).

### Kiểm tra phép tính — hàm thuần `kiemTraBaoGia(bg)` → `string[]` lỗi

Làm tròn đến **nghìn đồng** (`Math.round(x / 1000) * 1000`), cho phép lệch ≤ 1.000 đ:
- mỗi buổi: `giaSauUuDai ≈ giaGoc × (100 − uuDaiPhanTram) / 100`;
- `tongGiaGoc = Σ giaGoc`, `tongSauUuDai = Σ giaSauUuDai` (chính xác);
- `tietKiem = tongGiaGoc − tongSauUuDai` (chính xác);
- `hanUuDai`, `ngay` là ngày có thật (dùng kiểm tra ngày của `kiemTraGiaTriO('weddingDate', …)`);
- tối đa một buổi `loai: 'cuoi'`.

Lỗi nêu rõ dòng: "Buổi 1 (Lễ ăn hỏi): 18.000.000 × 75% = 13.500.000, không phải 13.600.000".

## Tool MCP (`api/mcp.ts`)

### `save_quote(lead, baoGia)`

Mô tả tool nói rõ: dùng **sau khi Trân làm xong báo giá trên claude.ai**; nếu chưa rõ lead thì
**hỏi Trân** "lưu vào lead nào?" trước khi gọi; mọi số tiền là số nguyên VND.

1. zod strict theo mô hình trên → `kiemTraBaoGia` → lỗi thì từ chối cả lệnh, liệt kê lỗi.
2. Ghi báo giá + log hoạt động + `touch()`.
3. **Sinh đề xuất** (hàm `deXuatTuBaoGia(bg, lead, today)` thuần → danh sách item), rồi đi qua
   đúng luồng chống trùng của `propose_changes` (`xetDeXuat`, ghi `aiRoot()/proposals`):
   - `revenueExpected` = `tongSauUuDai`;
   - `weddingDate` = `ngay` của buổi `loai: 'cuoi'` (nếu có);
   - `package` = gói của buổi cưới **nếu** khớp một gói của app (so không dấu, không phân biệt hoa
     thường, bỏ tiền tố "gói": "Gói Standard" → `Standard`; không khớp thì không đề xuất);
   - việc (`type: 'todo'`): "Nhắc khách ưu đãi hết hạn dd/mm", `due` = `hanUuDai − 2 ngày`
     (nhưng không trước hôm nay); bỏ qua nếu `hanUuDai` đã qua. Id tất định theo ngày hạn và lead: `todo_bguu<YYYYMMDD>_<leadId>` (bản báo giá mới cùng hạn không sinh việc trùng).
   - Mỗi đề xuất mang `nguon: { loai: 'baoGia', baoGiaId, taoLuc }` và `evidence: []`;
     `reason`: "Theo báo giá ngày dd/mm".
4. Trả về: id báo giá, số đề xuất đã tạo / bỏ qua (kèm lý do).

**Không** sửa ô nào của lead ngoài `baoGia` và `activityLog`.

### Đọc

- `get_lead`: thêm `baoGiaMoiNhat` (bản đầy đủ) và `soBanBaoGia`.
- `lead_context`: thêm `baoGiaMoiNhat` để hồ sơ AI dùng (ngân sách, giá đã chào, hạn ưu đãi).
- Prompt `cap-nhat-ho-so`: thêm quy tắc "Nếu lead có báo giá, coi `baoGiaMoiNhat` là giá đã chào
  chính thức; ghi vào nhóm Ngân sách kèm hạn ưu đãi."

### `xetDeXuat` / `propose_changes`

Không đổi quy tắc. Đề xuất từ báo giá dùng chung dedup: bản báo giá mới cùng ô → thay đề xuất đang
chờ; giá trị Trân đã Bỏ → không đề xuất lại.

## App (`index.html` + `web/bao-gia.js` mới)

### `web/bao-gia.js` — logic thuần

Theo mẫu `web/ho-so-ai.js`: `baoGiaMoiNhat(lead)`, `veBaoGia(lead, homNay)` (HTML, **escape mọi
chuỗi**), định dạng tiền. Nạp bằng `<script type="module">` → `window.BaoGia`.

### Khối "Báo giá" — tab Thông tin của chi tiết lead (đặt trước "Gói dịch vụ & giai đoạn")

- Ẩn khi lead chưa có báo giá.
- Thẻ bản mới nhất: tiêu đề · ngày lưu; mỗi buổi một dòng: tên buổi · ngày · gói, giá gốc gạch
  ngang → **giá sau ưu đãi** (−x%); ekip / sản phẩm / quà tặng thu gọn trong "Chi tiết ▾".
- Dải tổng: **tổng sau ưu đãi**, giá gốc gạch ngang, "Tiết kiệm …".
- Hạn ưu đãi: "Ưu đãi đến dd/mm" — **đỏ** khi còn ≤ 3 ngày, xám "đã hết hạn" khi qua.
- Bản cũ: danh sách thu gọn "Lần 1 · 12/10 · 45.000.000 đ", bấm mở xem.
- Nút thu gọn khối dùng `toggleKhoiChiTiet` sẵn có.

### Đề xuất từ báo giá

`veTheDeXuat` (web/ho-so-ai.js): khi `p.nguon?.loai === 'baoGia'` thì dòng "Lý do" hiện
"Theo báo giá ngày dd/mm" thay cho chip trích dẫn. Duyệt / Sửa rồi duyệt / Bỏ giữ nguyên.

## Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Phép tính sai | Từ chối, nêu từng dòng sai |
| Lead không xác định / trùng tên | Lỗi như `findLead` hiện có (Claude hỏi lại Trân) |
| Gói không khớp gói của app | Lưu báo giá bình thường, không đề xuất ô Gói |
| Hạn ưu đãi đã qua | Không đề xuất việc nhắc |
| App đang sửa lead khi MCP ghi | Luồng đồng bộ hiện có (pendingRemote / banGoc) xử lý như các tool ghi khác |
| Báo giá chứa HTML / ký tự lạ | Escape trong `web/bao-gia.js`; có test |

## Kiểm thử

- `test/bao-gia.test.ts` (thuần, không Firebase): `kiemTraBaoGia` với mẫu thật (đúng) + các ca sai
  (giá sau ưu đãi, tổng, tiết kiệm, ngày không có thật, 2 buổi cưới); `deXuatTuBaoGia` (khớp gói,
  hạn đã qua, due không trước hôm nay); `baoGiaMoiNhat`.
- `test/mcp-bao-gia.test.ts` (sandbox `crmDataTest` + `aiDataTest`): lưu báo giá mẫu; bản thứ hai
  thành bản mới nhất; đề xuất được tạo đúng 4 loại; lưu lại không sinh trùng; từ chối phép tính sai;
  lead fields không đổi; `get_lead` / `lead_context` trả `baoGiaMoiNhat`.
- `test/bao-gia.test.html` (Chrome ngầm): vẽ khối Báo giá, hạn ưu đãi đỏ/hết hạn, bản cũ thu gọn,
  chống XSS; thẻ đề xuất nguồn báo giá.
- Thử trên bản demo dữ liệu giả.

## Cập nhật tài liệu

- `CLAUDE.md`: mục `web/bao-gia.js`, lệnh test mới, ghi chú `baoGia` nằm trong lead.
- Prompt hằng ngày đã soạn: thêm quy tắc báo giá (như prompt `cap-nhat-ho-so`).
