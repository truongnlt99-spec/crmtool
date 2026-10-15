# Báo giá nhiều phương án

**Ngày:** 2026-10-15
**Trạng thái:** Đã duyệt thiết kế, chờ duyệt spec
**Nối tiếp:** `docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md` (đã ship, PR #24)

## Vấn đề

Trân hay gửi báo giá **so sánh nhiều phương án** để khách chọn (vd "Option 1 · Vừa vặn" và
"Option 2 · Trọn vẹn nhất"): có buổi **giống nhau ở mọi phương án** (lễ ăn hỏi Standard 1 buổi
20.900.000 đ) và buổi **khác nhau** (ngày cưới: Unique full ngày 46.900.000 đ vs Signature full ngày
65.900.000 đ); mỗi phương án một tổng (67.800.000 đ / 86.800.000 đ). Mô hình hiện tại chỉ có một
danh sách buổi và một tổng → không lưu được.

Khi chưa biết khách chọn phương án nào thì **doanh thu dự kiến / gói chưa xác định** — không được
đề xuất bừa.

## Mục tiêu

1. `save_quote` nhận được báo giá nhiều phương án (buổi chung + buổi riêng mỗi phương án); báo giá
   một phương án giữ nguyên định dạng cũ.
2. Server kiểm tra phép tính **từng phương án**.
3. Lưu báo giá nhiều phương án: chỉ đề xuất ngày cưới (nếu mọi phương án cùng ngày) + việc nhắc hạn
   ưu đãi; **chưa** đề xuất doanh thu / gói.
4. Ghi nhận **khách chọn phương án** ở hai nơi:
   - **App:** nút "Khách chọn phương án này" → cập nhật thẳng doanh thu dự kiến + gói (Trân tự bấm).
   - **Claude:** tool `chon_phuong_an` → đánh dấu đã chọn + tạo đề xuất doanh thu + gói vào hàng chờ.
5. Khối Báo giá hiện buổi chung một lần, các phương án cạnh nhau, đánh dấu phương án đã chọn.

### Ngoài phạm vi (YAGNI)

- Bỏ chọn / đổi phương án đã chọn trong app (chọn phương án khác thì ghi đè lựa chọn cũ — xem dưới).
- So sánh tự động "chỉ thêm X đ so với Option 1" (Claude ghi vào `diemKhacBiet` nếu muốn).
- Đề xuất khác nhau theo từng phương án cho ngày cưới (ngày khác nhau giữa phương án → không đề xuất).

## Mô hình dữ liệu

Mở rộng kiểu `BaoGia` (không đổi đường dẫn `leads/<id>/baoGia/<baoGiaId>`):

```
BaoGia {
  …như cũ (taoLuc, tieuDe, tenKhach, diaDiem, buoi, hanUuDai, ghiChu)…
  buoi:          BuoiBaoGia[]          // một phương án: mọi buổi; nhiều phương án: buổi DÙNG CHUNG (có thể rỗng)
  tongGiaGoc, tongSauUuDai, tietKiem   // CHỈ khi không có phuongAn
  phuongAn?: [ {                       // 2..4 phương án
    ma:           'opt1' | 'opt2' | …  // ^opt[1-9]$, duy nhất trong báo giá
    ten:          string ≤ 60          // "Option 1"
    nhan:         string ≤ 60 | null   // "Vừa vặn"
    buoi:         BuoiBaoGia[]         // buổi riêng của phương án (≥ 1)
    tongGiaGoc, tongSauUuDai, tietKiem: integer ≥ 0   // tính trên (buổi chung + buổi riêng)
    diemKhacBiet: string ≤ 600 | null
  } ]
  phuongAnDaChon?: string              // ma của phương án khách chọn
  chonLuc?:        ISO string
}
```

Quy tắc hình dạng (zod + `kiemTraBaoGia`):
- **Có `phuongAn`**: 2–4 phần tử, `ma` duy nhất; **không** có `tongGiaGoc/tongSauUuDai/tietKiem` ở gốc.
- **Không có `phuongAn`**: bắt buộc 3 trường tổng ở gốc, `buoi` ≥ 1 (như hiện tại).

### Kiểm tra phép tính

- Mỗi buổi (chung và riêng): giá sau ưu đãi ≈ giá gốc × (100 − %) (±1.000 đ) — như cũ.
- Mỗi phương án: `tongGiaGoc = Σ giaGoc(buổi chung + buổi riêng)`, tương tự `tongSauUuDai`;
  `tietKiem = tongGiaGoc − tongSauUuDai`. Lỗi ghi rõ phương án: "Option 2: Tổng sau ưu đãi phải là …".
- Tối đa một buổi `cuoi` **trong mỗi phương án** (tính cả buổi chung).

## Đề xuất

`deXuatTuBaoGia(bg, homNay, leadId)`:
- **Một phương án:** như hiện tại (doanh thu, ngày cưới, gói, việc nhắc).
- **Nhiều phương án:** ngày cưới chỉ khi **mọi** phương án có buổi `cuoi` cùng `ngay` (tìm trong buổi
  chung + buổi riêng); việc nhắc hạn ưu đãi như cũ; **không** doanh thu, **không** gói.

`deXuatTuPhuongAn(bg, ma)` (mới): doanh thu = `tongSauUuDai` của phương án; gói = gói của buổi
`cuoi` của phương án (buổi chung + riêng) nếu `khopGoi` khớp.

## Chọn phương án

### Qua Claude — tool `chon_phuong_an(lead, phuongAn, baoGiaId?)`

- Mô tả tool: chỉ gọi khi Trân **nói rõ** khách đã chọn phương án nào.
- `baoGiaId` bỏ trống → báo giá mới nhất. `phuongAn` nhận `ma` ("opt2") **hoặc** tên ("Option 2",
  không phân biệt hoa thường, bỏ dấu).
- Báo giá không có phương án / không tìm thấy phương án → lỗi rõ ràng.
- Ghi `phuongAnDaChon`, `chonLuc` (PATCH vào báo giá) + log hoạt động "Khách chọn <ten> (<tổng>)".
- Sinh đề xuất `deXuatTuPhuongAn` qua `themDeXuat` (chống trùng như mọi đề xuất), `nguon` báo giá,
  `reason`: "Khách chọn <ten> trong báo giá ngày dd/mm".
- Chọn lại phương án khác: ghi đè `phuongAnDaChon`; đề xuất doanh thu/gói mới **thay** đề xuất đang
  chờ (quy tắc chống trùng hiện có).

### Trong app — nút "Khách chọn phương án này"

- Chỉ hiện trên báo giá **mới nhất** có phương án, ở mỗi phương án chưa được chọn.
- Bấm → `confirm("Khách chọn Option 2? Doanh thu dự kiến → 86.800.000 đ, Gói → Signature")`.
- Đồng ý → cập nhật **trực tiếp** lead: `revenueExpected`, `package` (nếu khớp gói), và
  `baoGia[id].phuongAnDaChon/chonLuc`; ghi `logActivity`; lưu qua luồng `scheduleSave` sẵn có.
- Không tạo đề xuất (Trân đã quyết). Đề xuất doanh thu/gói đang chờ từ `chon_phuong_an` (nếu có) sẽ
  tự được đánh dấu duyệt bởi đối soát hiện có khi giá trị khớp.

## Giao diện khối Báo giá (`web/bao-gia.js`)

Báo giá **có phương án**:
- Buổi chung (nếu có) dưới tiêu đề nhỏ **"Giống nhau ở mọi phương án"**.
- Các phương án xếp **cạnh nhau** (lưới 2 cột máy tính, 1 cột điện thoại); mỗi thẻ: tên + nhãn,
  buổi riêng (dùng lại `veBuoi`), `diemKhacBiet`, **tổng sau ưu đãi** (giá gốc gạch nếu có tiết kiệm),
  nút "Khách chọn phương án này".
- Phương án đã chọn: viền nổi bật + nhãn **"Khách đã chọn"**; các phương án khác in mờ, ẩn nút chọn.
- Hạn ưu đãi, ghi chú, bản cũ: như hiện tại. Dòng bản cũ hiện tổng: một phương án → tổng; nhiều
  phương án → "x phương án · từ <tổng nhỏ nhất>" (hoặc tổng của phương án đã chọn).
- `veBaoGia` nhận thêm tuỳ chọn `{ choPhepChon: boolean }`; nút gọi hàm toàn cục
  `chonPhuongAn('<baoGiaId>','<ma>')` — id/ma qua kiểm tra `^[A-Za-z0-9_-]+$` trước khi vào onclick.

## Đọc

`get_lead` / `lead_context` trả `baoGiaMoiNhat` nguyên dạng (có `phuongAn`, `phuongAnDaChon`).
Prompt `cap-nhat-ho-so`: thêm "Báo giá có phuongAn mà chưa có phuongAnDaChon → ghi các phương án đã
chào vào nhóm Ngân sách; không đề xuất doanh thu/gói".

## Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Phép tính sai ở một phương án | Từ chối, nêu tên phương án + dòng sai |
| `phuongAn` có 1 phần tử / `ma` trùng / có cả tổng ở gốc | Từ chối (zod / kiểm tra hình dạng) |
| Phương án có ngày cưới khác nhau | Lưu được, không đề xuất ngày cưới |
| `chon_phuong_an` trên báo giá một phương án | Lỗi "Báo giá này không có phương án để chọn" |
| Tên phương án không khớp | Lỗi kèm danh sách phương án có sẵn |
| Báo giá cũ (trước tính năng) | Hiện như cũ — `phuongAn` không có |
| Chữ trong phương án chứa HTML | Escape; id/ma lạ không vào onclick |

## Kiểm thử

- `test/bao-gia.test.ts`: báo giá 2 phương án mẫu (Đức Minh) hợp lệ; sai tổng ở Option 2 → lỗi nêu
  "Option 2"; `phuongAn` 1 phần tử / `ma` trùng / có tổng ở gốc → lỗi; hai buổi cưới trong một phương
  án → lỗi; `deXuatTuBaoGia` nhiều phương án chỉ ra ngày cưới + việc; ngày cưới khác nhau → không;
  `deXuatTuPhuongAn` doanh thu + gói; tìm phương án theo tên.
- `test/mcp-bao-gia.test.ts`: lưu báo giá 2 phương án → 2 đề xuất (ngày cưới, việc); `chon_phuong_an`
  "Option 2" → `phuongAnDaChon = opt2` + đề xuất doanh thu 86.800.000 + gói Signature; chọn lại
  "opt1" → đề xuất doanh thu thay bằng 67.800.000; chọn trên báo giá một phương án → lỗi.
- `test/bao-gia.test.html`: buổi chung một lần, 2 thẻ phương án, nút chọn chỉ khi `choPhepChon`,
  phương án đã chọn có nhãn + ẩn nút, dòng bản cũ nhiều phương án, chống XSS ở phương án / id lạ.
