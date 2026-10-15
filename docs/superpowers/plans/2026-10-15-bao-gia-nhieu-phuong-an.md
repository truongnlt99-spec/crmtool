# Báo giá nhiều phương án — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `save_quote` nhận báo giá nhiều phương án (buổi chung + buổi riêng), kiểm tra phép tính từng phương án, chỉ đề xuất ngày cưới + việc nhắc; ghi nhận khách chọn phương án qua app (cập nhật thẳng) hoặc qua tool `chon_phuong_an` (đề xuất).

**Architecture:** Mở rộng kiểu `BaoGia` trong `api/mcp.ts` với `phuongAn[]`, `phuongAnDaChon`, `chonLuc`; hàm thuần `cacPhuongAn` chuẩn hoá mọi báo giá thành danh sách phương án (báo giá một phương án = một phương án ẩn danh) để kiểm tra phép tính dùng chung một vòng lặp. `web/bao-gia.js` vẽ buổi chung + lưới phương án và có hàm cho nút chọn; `index.html` thêm `chonPhuongAn()` cập nhật lead qua luồng lưu sẵn có.

**Tech Stack:** như plan `2026-10-15-bao-gia-trong-lead.md`.

**Spec:** `docs/superpowers/specs/2026-10-15-bao-gia-nhieu-phuong-an-design.md`

## Global Constraints

- Báo giá một phương án (không có `phuongAn`) phải chạy y như trước: mọi test `test:bao-gia`, `test:mcp-bao-gia`, `test:bao-gia-ui` hiện có vẫn PASS (trừ ca `khopGoi` đổi theo ruling dưới).
- `phuongAn`: 2–4 phần tử, `ma` khớp `^opt[1-9]$` và duy nhất; có `phuongAn` thì **không** có tổng ở gốc; không có `phuongAn` thì **bắt buộc** tổng ở gốc và `buoi` ≥ 1.
- Báo giá nhiều phương án lúc lưu: **không** đề xuất doanh thu / gói.
- Chọn trong app: cập nhật thẳng lead (không tạo đề xuất). Chọn qua Claude: tạo đề xuất (không sửa lead).
- Firebase bỏ mảng rỗng: mọi chỗ đọc `buoi` của báo giá đã lưu phải chịu được `undefined`.
- Escape mọi chuỗi; id / ma chỉ vào onclick khi khớp `^[A-Za-z0-9_-]+$`.
- Commit tiếng Việt không dấu + Co-Authored-By.

**Ruling (đổi so với tính năng trước):** `khopGoi` khớp theo **tiền tố trọn từ** ("Gói Unique full ngày" → `Unique`, "Gói Signature trọn ngày" → `Signature`) thay vì khớp tuyệt đối — báo giá thật luôn có hậu tố "full ngày / trọn ngày / 1 buổi", khớp tuyệt đối làm đề xuất gói không bao giờ chạy. Cái giá nếu sai: một gói tên như "Signature Plus" sẽ bị hiểu là `Signature` (Trân vẫn phải duyệt).

## Review Focus

1. **Báo giá nhiều phương án đọc lại từ Firebase với `buoi` chung rỗng** (Firebase bỏ mảng rỗng → `undefined`) → hiển thị / `chon_phuong_an` không vỡ. → test Task 1 (`cacPhuongAn` với `buoi` thiếu) + Task 3.
2. **Tên phương án Trân gõ khác chữ hoa / dấu** ("option 2", "OPTION 2") → tìm đúng. → test Task 1.
3. **Chọn lại phương án khác** → đề xuất doanh thu đang chờ được thay, không chồng. → test Task 2.
4. **Phương án có ngày cưới khác nhau** → không đề xuất ngày cưới. → test Task 1.
5. **Nút chọn trên báo giá đã chọn** → ẩn ở phương án đã chọn, phương án khác vẫn chọn được (đổi ý). → test Task 3.

---

### Task 1: Hàm thuần server cho phương án

**Files:** Modify `api/mcp.ts` (kiểu `BaoGia`, `kiemTraBaoGia`, `khopGoi`, `deXuatTuBaoGia`, thêm `cacPhuongAn`, `timPhuongAn`, `deXuatTuPhuongAn`); Modify `test/bao-gia.test.ts`.

**Interfaces (produces):**
- `type PhuongAn = { ma: string; ten: string; nhan: string | null; buoi: BuoiBaoGia[]; tongGiaGoc: number; tongSauUuDai: number; tietKiem: number; diemKhacBiet: string | null }`
- `BaoGia` thêm `phuongAn?: PhuongAn[]; phuongAnDaChon?: string; chonLuc?: string`; `tongGiaGoc/tongSauUuDai/tietKiem` thành optional.
- `cacPhuongAn(bg) -> Array<{ ma: string | null; ten: string | null; buoi: BuoiBaoGia[]; tongGiaGoc?: number; tongSauUuDai?: number; tietKiem?: number }>` — `buoi` = buổi chung + buổi riêng.
- `timPhuongAn(bg, tenHoacMa) -> PhuongAn | null`
- `deXuatTuPhuongAn(bg, ma) -> MucDeXuatBaoGia[]` (doanh thu + gói)

- [ ] **Step 1: Test thất bại** — nối vào `test/bao-gia.test.ts` trước dòng tổng kết:

```ts
console.log('\n>> nhieu phuong an');
const BUOI_AN_HOI: S.BuoiBaoGia = { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-24', gio: null, soKhach: null, moTa: null,
  goi: 'Gói Standard 1 buổi', giaGoc: 20900000, uuDaiPhanTram: 0, giaSauUuDai: 20900000, ekip: [], sanPham: [], quaTang: [] };
const cuoi = (goi: string, gia: number, ngay = '2026-11-25'): S.BuoiBaoGia => ({ loai: 'cuoi', ten: 'Rước dâu + tiệc Mipec', ngay, gio: null, soKhach: '75 mâm', moTa: null,
  goi, giaGoc: gia, uuDaiPhanTram: 0, giaSauUuDai: gia, ekip: [], sanPham: [], quaTang: [] });
const NHIEU: S.BaoGia = {
  tieuDe: 'So sánh 2 phương án quay chụp cưới', tenKhach: 'Anh Đức Minh', diaDiem: 'Mipec', hanUuDai: null, ghiChu: [],
  buoi: [BUOI_AN_HOI],
  phuongAn: [
    { ma: 'opt1', ten: 'Option 1', nhan: 'Vừa vặn', buoi: [cuoi('Gói Unique full ngày', 46900000)], tongGiaGoc: 67800000, tongSauUuDai: 67800000, tietKiem: 0, diemKhacBiet: 'Unique vừa vặn' },
    { ma: 'opt2', ten: 'Option 2', nhan: 'Trọn vẹn nhất', buoi: [cuoi('Gói Signature full ngày', 65900000)], tongGiaGoc: 86800000, tongSauUuDai: 86800000, tietKiem: 0, diemKhacBiet: 'Ekip 6 người + flycam' },
  ],
};
const suaN = (f: (b: any) => void) => { const b = JSON.parse(JSON.stringify(NHIEU)); f(b); return b as S.BaoGia; };
eq('2 phuong an mau: hop le', S.kiemTraBaoGia(NHIEU), []);
{
  const loi = S.kiemTraBaoGia(suaN((b) => { b.phuongAn[1].tongSauUuDai = 86000000; b.phuongAn[1].tietKiem = 800000; }));
  check('sai tong o Option 2: neu ten phuong an', loi.length === 1 && /^Option 2: Tổng sau ưu đãi/.test(loi[0]), JSON.stringify(loi));
}
check('1 phuong an -> loi', S.kiemTraBaoGia(suaN((b) => { b.phuongAn = [b.phuongAn[0]]; })).some((x) => /2–4 phương án/.test(x)));
check('ma trung -> loi', S.kiemTraBaoGia(suaN((b) => { b.phuongAn[1].ma = 'opt1'; })).some((x) => /trùng/.test(x)));
check('co tong o goc -> loi', S.kiemTraBaoGia(suaN((b) => { b.tongGiaGoc = 1; b.tongSauUuDai = 1; b.tietKiem = 0; })).some((x) => /không ghi tổng ở gốc/.test(x)));
check('khong phuong an + thieu tong -> loi', S.kiemTraBaoGia({ ...MAU, tongGiaGoc: undefined } as any).some((x) => /Thiếu tổng/.test(x)));
check('2 buoi cuoi trong 1 phuong an -> loi', S.kiemTraBaoGia(suaN((b) => { b.buoi[0].loai = 'cuoi'; })).some((x) => /Option 1: Chỉ được một buổi/.test(x)));
// Review Focus 1: buổi chung rỗng bị Firebase bỏ
{
  const khongChung = suaN((b) => { delete b.buoi; b.phuongAn.forEach((p: any) => { p.tongGiaGoc -= 20900000; p.tongSauUuDai -= 20900000; }); });
  eq('khong buoi chung (undefined): hop le', S.kiemTraBaoGia(khongChung), []);
  eq('cacPhuongAn chiu buoi undefined', S.cacPhuongAn(khongChung).map((p) => p.buoi.length), [1, 1]);
}
eq('cacPhuongAn: buoi chung + rieng', S.cacPhuongAn(NHIEU).map((p) => [p.ma, p.buoi.length, p.tongSauUuDai]), [['opt1', 2, 67800000], ['opt2', 2, 86800000]]);
eq('cacPhuongAn: bao gia 1 phuong an', S.cacPhuongAn(MAU).map((p) => [p.ma, p.buoi.length, p.tongSauUuDai]), [[null, 2, 41905000]]);
// Review Focus 2: tìm theo tên không phân biệt hoa / dấu
eq('tim theo ma', S.timPhuongAn(NHIEU, 'opt2')?.ma, 'opt2');
eq('tim theo ten thuong', S.timPhuongAn(NHIEU, 'option 2')?.ma, 'opt2');
eq('tim theo ten hoa', S.timPhuongAn(NHIEU, 'OPTION 1')?.ma, 'opt1');
eq('khong tim thay', S.timPhuongAn(NHIEU, 'Option 3'), null);
eq('bao gia 1 phuong an: khong tim', S.timPhuongAn(MAU, 'opt1'), null);
// Đề xuất
eq('nhieu PA: chi ngay cuoi (khong han -> khong viec)', S.deXuatTuBaoGia(NHIEU, '2026-10-15', 'L1').map((d) => d.type === 'field' ? d.field : 'todo'), ['weddingDate']);
eq('nhieu PA co han: ngay cuoi + viec', S.deXuatTuBaoGia(suaN((b) => { b.hanUuDai = '2026-10-30'; }), '2026-10-15', 'L1').map((d) => d.type === 'field' ? d.field : 'todo'), ['weddingDate', 'todo']);
check('Review Focus 4: ngay cuoi khac nhau -> khong de xuat ngay', !S.deXuatTuBaoGia(suaN((b) => { b.phuongAn[1].buoi[0].ngay = '2026-11-26'; }), '2026-10-15', 'L1').some((d) => d.type === 'field' && d.field === 'weddingDate'));
eq('deXuatTuPhuongAn opt2', S.deXuatTuPhuongAn(NHIEU, 'opt2').map((d: any) => [d.field, d.newValue]), [['revenueExpected', 86800000], ['package', 'Signature']]);
eq('deXuatTuPhuongAn opt1', S.deXuatTuPhuongAn(NHIEU, 'opt1').map((d: any) => [d.field, d.newValue]), [['revenueExpected', 67800000], ['package', 'Unique']]);
```

Đồng thời sửa 2 ca cũ theo ruling `khopGoi` (tiền tố trọn từ):
- `eq('ten co chu thua -> null', S.khopGoi('Gói Signature trọn ngày'), null);` → `eq('ten co hau to -> khop tien to', S.khopGoi('Gói Signature trọn ngày'), 'Signature');` và thêm `eq('khong khop tron tu', S.khopGoi('Gói Signatureplus'), null);`
- ca `'goi khong khop: khong de xuat goi'` đổi tên gói thành `'Gói Premium trọn ngày'`.

- [ ] **Step 2:** `npm run test:bao-gia` → FAIL (`S.cacPhuongAn is not a function`).

- [ ] **Step 3: Cài đặt** trong `api/mcp.ts`:

Kiểu (thay `export type BaoGia = {...}`):

```ts
export type PhuongAn = {
  ma: string; ten: string; nhan: string | null; buoi: BuoiBaoGia[];
  tongGiaGoc: number; tongSauUuDai: number; tietKiem: number; diemKhacBiet: string | null;
};
export type BaoGia = {
  taoLuc?: string; tieuDe: string; tenKhach: string; diaDiem: string | null;
  buoi: BuoiBaoGia[];                         // 1 phương án: mọi buổi; nhiều phương án: buổi dùng chung
  tongGiaGoc?: number; tongSauUuDai?: number; tietKiem?: number;   // chỉ khi không có phuongAn
  phuongAn?: PhuongAn[]; phuongAnDaChon?: string; chonLuc?: string;
  hanUuDai: string | null; ghiChu: string[];
};
```

Hàm (thay `kiemTraBaoGia`, `khopGoi`, `deXuatTuBaoGia`; thêm mới):

```ts
/** Chuẩn hoá: báo giá 1 phương án -> 1 phương án ẩn danh (ma null); nhiều phương án -> buổi chung + riêng. */
export function cacPhuongAn(bg: BaoGia) {
  const chung = bg.buoi || [];
  if (!bg.phuongAn || !bg.phuongAn.length) {
    return [{ ma: null as string | null, ten: null as string | null, buoi: chung, tongGiaGoc: bg.tongGiaGoc, tongSauUuDai: bg.tongSauUuDai, tietKiem: bg.tietKiem }];
  }
  return bg.phuongAn.map((p) => ({ ma: p.ma as string | null, ten: p.ten as string | null, buoi: [...chung, ...(p.buoi || [])], tongGiaGoc: p.tongGiaGoc, tongSauUuDai: p.tongSauUuDai, tietKiem: p.tietKiem }));
}

export function kiemTraBaoGia(bg: BaoGia): string[] {
  const loi: string[] = [];
  const coPA = !!(bg.phuongAn && bg.phuongAn.length);
  if (bg.phuongAn && (bg.phuongAn.length < 2 || bg.phuongAn.length > 4)) loi.push('Báo giá nhiều phương án phải có 2–4 phương án');
  if (coPA) {
    const ma = bg.phuongAn!.map((p) => p.ma);
    if (new Set(ma).size !== ma.length) loi.push(`Mã phương án bị trùng: ${ma.join(', ')}`);
    if (bg.tongGiaGoc != null || bg.tongSauUuDai != null || bg.tietKiem != null) loi.push('Báo giá nhiều phương án không ghi tổng ở gốc — ghi tổng trong từng phương án');
  } else {
    if (bg.tongGiaGoc == null || bg.tongSauUuDai == null || bg.tietKiem == null) loi.push('Thiếu tổng giá gốc / tổng sau ưu đãi / tiết kiệm');
    if (!(bg.buoi || []).length) loi.push('Báo giá cần ít nhất một buổi');
  }
  const kiemBuoi = (b: BuoiBaoGia, nhan: string) => {
    const dung = Math.round((b.giaGoc * (100 - b.uuDaiPhanTram)) / 100 / 1000) * 1000;
    if (Math.abs(dung - b.giaSauUuDai) > 1000) loi.push(`${nhan}: ${tienVN(b.giaGoc)} × ${100 - b.uuDaiPhanTram}% = ${tienVN(dung)}, không phải ${tienVN(b.giaSauUuDai)}`);
    if (b.ngay && kiemTraGiaTriO('weddingDate', b.ngay)) loi.push(`${nhan}: ngày ${b.ngay} không có thật`);
  };
  (bg.buoi || []).forEach((b, i) => kiemBuoi(b, `Buổi ${i + 1} (${b.ten})`));
  for (const p of bg.phuongAn || []) (p.buoi || []).forEach((b, i) => kiemBuoi(b, `${p.ten} · Buổi ${i + 1} (${b.ten})`));
  for (const pa of cacPhuongAn(bg)) {
    if (pa.tongGiaGoc == null || pa.tongSauUuDai == null || pa.tietKiem == null) continue;
    const t = pa.ten ? `${pa.ten}: ` : '';
    const tongGoc = pa.buoi.reduce((s, b) => s + b.giaGoc, 0);
    const tongSau = pa.buoi.reduce((s, b) => s + b.giaSauUuDai, 0);
    if (tongGoc !== pa.tongGiaGoc) loi.push(`${t}Tổng giá gốc phải là ${tienVN(tongGoc)} (cộng các buổi), không phải ${tienVN(pa.tongGiaGoc)}`);
    if (tongSau !== pa.tongSauUuDai) loi.push(`${t}Tổng sau ưu đãi phải là ${tienVN(tongSau)} (cộng các buổi), không phải ${tienVN(pa.tongSauUuDai)}`);
    if (pa.tietKiem !== pa.tongGiaGoc - pa.tongSauUuDai) loi.push(`${t}Tiết kiệm phải là ${tienVN(pa.tongGiaGoc - pa.tongSauUuDai)}, không phải ${tienVN(pa.tietKiem)}`);
    if (pa.buoi.filter((b) => b.loai === 'cuoi').length > 1) loi.push(`${t}Chỉ được một buổi loại "cuoi" (đám cưới)`);
  }
  if (bg.hanUuDai && kiemTraGiaTriO('weddingDate', bg.hanUuDai)) loi.push(`Hạn ưu đãi ${bg.hanUuDai} không có thật`);
  return loi;
}

/** Tên gói trong báo giá -> gói của app; khớp tiền tố trọn từ ("Gói Unique full ngày" -> Unique). */
export function khopGoi(ten: string): string | null {
  const chuan = (s: string) => boDauZalo(s).replace(/^goi\s+/, '').replace(/\s+/g, ' ').trim();
  const t = chuan(ten);
  return (PACKAGES as readonly string[]).find((p) => { const g = chuan(p); return t === g || t.startsWith(g + ' '); }) || null;
}

export function timPhuongAn(bg: BaoGia, tenHoacMa: string): PhuongAn | null {
  const q = boDauZalo(tenHoacMa).replace(/\s+/g, ' ');
  return (bg.phuongAn || []).find((p) => p.ma === tenHoacMa || boDauZalo(p.ten).replace(/\s+/g, ' ') === q) || null;
}

/** Đề xuất khi khách chọn một phương án: doanh thu = tổng của phương án, gói = gói buổi cưới (nếu khớp). */
export function deXuatTuPhuongAn(bg: BaoGia, ma: string): MucDeXuatBaoGia[] {
  const pa = cacPhuongAn(bg).find((p) => p.ma === ma);
  if (!pa || pa.tongSauUuDai == null) return [];
  const ds: MucDeXuatBaoGia[] = [{ type: 'field', field: 'revenueExpected', newValue: pa.tongSauUuDai }];
  const cuoi = pa.buoi.find((b) => b.loai === 'cuoi');
  const goi = cuoi ? khopGoi(cuoi.goi) : null;
  if (goi) ds.push({ type: 'field', field: 'package', newValue: goi });
  return ds;
}

/** Đề xuất khi lưu báo giá. Nhiều phương án: chỉ ngày cưới (nếu mọi phương án cùng ngày) + việc nhắc. */
export function deXuatTuBaoGia(bg: BaoGia, homNay: string, leadId: string): MucDeXuatBaoGia[] {
  const ds: MucDeXuatBaoGia[] = [];
  const pas = cacPhuongAn(bg);
  if (pas.length === 1 && pas[0].ma === null) {
    ds.push({ type: 'field', field: 'revenueExpected', newValue: pas[0].tongSauUuDai as number });
    const cuoi = pas[0].buoi.find((b) => b.loai === 'cuoi');
    if (cuoi?.ngay) ds.push({ type: 'field', field: 'weddingDate', newValue: cuoi.ngay });
    const goi = cuoi ? khopGoi(cuoi.goi) : null;
    if (goi) ds.push({ type: 'field', field: 'package', newValue: goi });
  } else {
    const ngays = pas.map((p) => p.buoi.find((b) => b.loai === 'cuoi')?.ngay || null);
    if (ngays.every((n) => n && n === ngays[0])) ds.push({ type: 'field', field: 'weddingDate', newValue: ngays[0] as string });
  }
  if (bg.hanUuDai && bg.hanUuDai >= homNay) {
    const truoc2 = congNgay(bg.hanUuDai, -2);
    ds.push({
      type: 'todo',
      // Kèm leadId: đề xuất của mọi lead nằm chung một nhánh proposals, hai lead cùng hạn không được trùng id
      huaId: 'bguu' + bg.hanUuDai.replace(/-/g, '') + '_' + leadId,
      todoText: `Nhắc khách ưu đãi hết hạn ${ddmm(bg.hanUuDai)}`,
      due: truoc2 < homNay ? homNay : truoc2,
    });
  }
  return ds;
}
```

- [ ] **Step 4:** `npm run test:bao-gia` → PASS; `npm run test:ho-so` → PASS.
- [ ] **Step 5: Commit** `Bao gia nhieu phuong an: ham thuan kiem tra tung phuong an, tim/chon phuong an, khop goi theo tien to`.

---

### Task 2: Schema + `save_quote` + tool `chon_phuong_an` + prompt

**Files:** Modify `api/mcp.ts`, `test/mcp-bao-gia.test.ts`.

**Interfaces (produces):** tool `chon_phuong_an({ lead, phuongAn, baoGiaId? })` → `{ baoGiaId, phuongAn, deXuatTao, deXuatBoQua }`.

- [ ] **Step 1: Test thất bại** — trong `test/mcp-bao-gia.test.ts`, ngay trước `console.log('\n>> get_lead / lead_context');` thêm khối dùng lead `L3` (seed thêm `L3: { id:'L3', name:'Đức Minh', stage:'baogia', package:'Unique', revenueExpected:0, ownerUid:'U', deadline:'2026-12-01', createdAt:'2026-10-01' }`):

```ts
  console.log('\n>> bao gia nhieu phuong an');
  const anHoi = { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-24', gio: null, soKhach: null, moTa: null, goi: 'Gói Standard 1 buổi', giaGoc: 20900000, uuDaiPhanTram: 0, giaSauUuDai: 20900000, ekip: [], sanPham: [], quaTang: [] };
  const cuoiPA = (goi: string, gia: number) => ({ loai: 'cuoi', ten: 'Rước dâu + tiệc', ngay: '2026-11-25', gio: null, soKhach: '75 mâm', moTa: null, goi, giaGoc: gia, uuDaiPhanTram: 0, giaSauUuDai: gia, ekip: [], sanPham: [], quaTang: [] });
  const NHIEU = { tieuDe: 'So sánh 2 phương án', tenKhach: 'Anh Đức Minh', diaDiem: 'Mipec', hanUuDai: null, ghiChu: [], buoi: [anHoi],
    phuongAn: [
      { ma: 'opt1', ten: 'Option 1', nhan: 'Vừa vặn', buoi: [cuoiPA('Gói Unique full ngày', 46900000)], tongGiaGoc: 67800000, tongSauUuDai: 67800000, tietKiem: 0, diemKhacBiet: null },
      { ma: 'opt2', ten: 'Option 2', nhan: 'Trọn vẹn nhất', buoi: [cuoiPA('Gói Signature full ngày', 65900000)], tongGiaGoc: 86800000, tongSauUuDai: 86800000, tietKiem: 0, diemKhacBiet: 'Ekip 6 người + flycam' },
    ] };
  const dsCua = async (leadId: string) => Object.entries((await doc('aiDataTest/proposals')) || {}).map(([id, p]: any) => ({ id, ...p })).filter((p: any) => p.leadId === leadId);
  const rN = await callTool('save_quote', { lead: 'L3', baoGia: NHIEU });
  check('luu bao gia 2 phuong an', !rN.isError, rN.text);
  const dN = await dsCua('L3');
  check('2 PA: chi de xuat ngay cuoi (khong doanh thu/goi)', dN.length === 1 && dN[0].field === 'weddingDate' && dN[0].newValue === '2026-11-25', JSON.stringify(dN.map((p) => p.field)));
  const loiChon1PA = await callTool('chon_phuong_an', { lead: 'L1', phuongAn: 'Option 1' });
  check('chon tren bao gia 1 phuong an -> loi', loiChon1PA.isError && /không có phương án/.test(loiChon1PA.text), loiChon1PA.text);
  const loiTen = await callTool('chon_phuong_an', { lead: 'L3', phuongAn: 'Option 9' });
  check('ten khong khop -> loi kem danh sach', loiTen.isError && /Option 1/.test(loiTen.text) && /Option 2/.test(loiTen.text), loiTen.text);
  const c2 = await callTool('chon_phuong_an', { lead: 'L3', phuongAn: 'option 2' });
  check('chon Option 2', !c2.isError && c2.json?.phuongAn === 'opt2', c2.text);
  const bgL3 = await doc(`crmDataTest/leads/L3/baoGia/${rN.json?.baoGiaId}`);
  check('ghi phuongAnDaChon + chonLuc', bgL3?.phuongAnDaChon === 'opt2' && typeof bgL3?.chonLuc === 'string');
  const leadL3 = await doc('crmDataTest/leads/L3');
  check('chon qua Claude: o lead khong doi', leadL3.revenueExpected === 0 && leadL3.package === 'Unique');
  const d2 = await dsCua('L3');
  check('de xuat doanh thu 86.8tr + goi Signature', d2.some((p) => p.field === 'revenueExpected' && p.newValue === 86800000 && p.status === 'cho' && /Khách chọn Option 2/.test(p.reason)) && d2.some((p) => p.field === 'package' && p.newValue === 'Signature'), JSON.stringify(d2.map((p) => [p.field, p.newValue, p.status])));
  // Review Focus 3: đổi ý -> thay, không chồng
  await callTool('chon_phuong_an', { lead: 'L3', phuongAn: 'opt1' });
  const d3 = (await dsCua('L3')).filter((p) => p.field === 'revenueExpected' && p.status === 'cho');
  check('doi y: chi 1 de xuat doanh thu dang cho = 67.8tr', d3.length === 1 && d3[0].newValue === 67800000, JSON.stringify(d3));
```

- [ ] **Step 2:** `npm run test:mcp-bao-gia` → FAIL.

- [ ] **Step 3: Schema** — thay `BaoGiaZ` bằng:

```ts
const PhuongAnZ = z.object({
  ma: z.string().regex(/^opt[1-9]$/).describe('opt1, opt2, …'),
  ten: z.string().min(1).max(60),
  nhan: z.string().max(60).nullable(),
  buoi: z.array(BuoiBaoGiaZ).min(1).max(6).describe('Buổi RIÊNG của phương án (buổi dùng chung để ở baoGia.buoi)'),
  tongGiaGoc: z.number().int().nonnegative(),
  tongSauUuDai: z.number().int().nonnegative(),
  tietKiem: z.number().int().nonnegative(),
  diemKhacBiet: z.string().max(600).nullable(),
}).strict();
const BaoGiaZ = z.object({
  tieuDe: z.string().min(1).max(200),
  tenKhach: z.string().min(1).max(100),
  diaDiem: z.string().max(100).nullable(),
  buoi: z.array(BuoiBaoGiaZ).max(6).describe('Một phương án: mọi buổi. Nhiều phương án: chỉ buổi DÙNG CHUNG (có thể rỗng)'),
  tongGiaGoc: z.number().int().nonnegative().optional().describe('Chỉ khi KHÔNG có phuongAn'),
  tongSauUuDai: z.number().int().nonnegative().optional(),
  tietKiem: z.number().int().nonnegative().optional(),
  phuongAn: z.array(PhuongAnZ).max(4).optional().describe('Báo giá so sánh nhiều phương án (2–4); tổng ghi trong từng phương án = buổi chung + buổi riêng'),
  hanUuDai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ghiChu: z.array(z.string().max(300)).max(10),
}).strict();
```

- [ ] **Step 4: `save_quote`** — dòng log đổi thành:

```ts
        const pas = cacPhuongAn(bg);
        await logActivity(l, pas.length > 1
          ? `Lưu báo giá ${pas.length} phương án: ${pas.map((p) => `${p.ten} ${formatMoney(p.tongSauUuDai)}`).join(' / ')}`
          : `Lưu báo giá: ${formatMoney(bg.tongSauUuDai)} (${bg.buoi.length} buổi)`);
```

và thêm vào mô tả tool: `Báo giá so sánh nhiều phương án: để buổi dùng chung ở buoi, mỗi phương án (phuongAn) ghi buổi riêng + tổng riêng; KHÔNG ghi tổng ở gốc. Khi khách chọn phương án, dùng chon_phuong_an.`

- [ ] **Step 5: Tool `chon_phuong_an`** — đăng ký ngay sau `save_quote`:

```ts
    server.registerTool(
      'chon_phuong_an',
      {
        title: 'Ghi nhận khách chọn phương án báo giá',
        description:
          'Ghi nhận khách đã chọn một phương án trong báo giá nhiều phương án (vd "Option 2"). CHỈ gọi khi Trân nói rõ khách chọn phương án nào. Đánh dấu phương án đã chọn và tạo đề xuất doanh thu dự kiến + gói vào hàng chờ để Trân duyệt — không sửa ô nào của lead. baoGiaId bỏ trống = báo giá mới nhất.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          phuongAn: z.string().min(1).describe('Mã (opt2) hoặc tên phương án (Option 2)'),
          baoGiaId: z.string().optional(),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const bg = args.baoGiaId
          ? (Object.hasOwn(l.baoGia || {}, args.baoGiaId) ? { ...(l.baoGia as Record<string, BaoGia>)[args.baoGiaId], id: args.baoGiaId } : null)
          : baoGiaMoiNhat(l);
        if (!bg) throw new Error(args.baoGiaId ? `Lead "${l.name}" không có báo giá ${args.baoGiaId}.` : `Lead "${l.name}" chưa có báo giá nào.`);
        if (!bg.phuongAn || !bg.phuongAn.length) throw new Error(`Báo giá này không có phương án để chọn (báo giá một phương án).`);
        const pa = timPhuongAn(bg, args.phuongAn);
        if (!pa) throw new Error(`Không thấy phương án "${args.phuongAn}". Có: ${bg.phuongAn.map((p) => `${p.ten} (${p.ma})`).join(', ')}.`);

        const chonLuc = new Date().toISOString();
        await patchPath(`${dataRoot()}/leads/${l.id}/baoGia/${bg.id}`, { phuongAnDaChon: pa.ma, chonLuc });
        await logActivity(l, `Khách chọn ${pa.ten} (${formatMoney(pa.tongSauUuDai)})`);
        await touch();

        const lo = moLoDeXuat((await napDeXuat()).filter((p) => p.leadId === l.id));
        const chung = {
          reason: `Khách chọn ${pa.ten} trong báo giá ngày ${ddmm(String(bg.taoLuc || chonLuc).slice(0, 10))}`,
          evidence: [], nguon: { loai: 'baoGia' as const, baoGiaId: bg.id, taoLuc: String(bg.taoLuc || chonLuc) },
        };
        for (const m of deXuatTuPhuongAn(bg, pa.ma)) {
          if (m.type !== 'field') continue;
          themDeXuat(lo, l, m, { type: 'field', field: m.field, newValue: m.newValue },
            { ...chung, type: 'field', field: m.field, oldValue: (l as any)[m.field] ?? null, newValue: m.newValue });
        }
        if (Object.keys(lo.patch).length) await patchPath(`${aiRoot()}/proposals`, lo.patch);
        return ok({
          baoGiaId: bg.id, phuongAn: pa.ma,
          deXuatTao: lo.taoMoi.map((p) => ({ id: p.id, field: p.field, newValue: p.newValue })),
          deXuatBoQua: lo.boQua.map((b) => ({ lyDo: b.lyDo })),
        });
      }
    );
```

- [ ] **Step 6: Prompt** — sau dòng quy tắc báo giá hiện có thêm:
`'- Báo giá có phuongAn mà chưa có phuongAnDaChon: ghi các phương án đã chào (tên + tổng) vào nhóm Ngân sách; không đề xuất doanh thu / gói. Chỉ gọi chon_phuong_an khi Trân nói rõ khách đã chọn.',`

- [ ] **Step 7:** `npm run test:mcp-bao-gia`, `npm run test:mcp-ho-so`, `npm run test:bao-gia` → PASS.
- [ ] **Step 8: Commit** `Bao gia nhieu phuong an: schema, save_quote, tool chon_phuong_an`.

---

### Task 3: Giao diện phương án + nút chọn trong app

**Files:** Modify `web/bao-gia.js`, `test/bao-gia.test.html`, `index.html`, `CLAUDE.md`.

**Interfaces (produces, `window.BaoGia`):** `veBaoGia(lead, homNay, { choPhepChon })`, `phuongAnCua(bg, ma) -> PA | null` (buổi chung + riêng, như `cacPhuongAn`), `goiCuoiCua(pa) -> string | null`, `khopGoi(ten)` (chép từ server, cùng quy tắc tiền tố trọn từ — ghi chú "chép 2 nơi").

- [ ] **Step 1: Test thất bại** — nối vào `test/bao-gia.test.html` trước `window.__ketQua = ket;`:

```js
/* 6. Nhiều phương án */
const cuoiPA = (goi, gia) => buoi({ ten: 'Rước dâu + tiệc', ngay: '2026-11-25', goi, giaGoc: gia, uuDaiPhanTram: 0, giaSauUuDai: gia });
const NHIEU = { taoLuc: '2026-10-15T03:00:00.000Z', tieuDe: 'So sánh 2 phương án', tenKhach: 'Anh Đức Minh', diaDiem: 'Mipec', hanUuDai: null, ghiChu: [],
  buoi: [buoi({ loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-24', goi: 'Gói Standard 1 buổi', giaGoc: 20900000, uuDaiPhanTram: 0, giaSauUuDai: 20900000 })],
  phuongAn: [
    { ma: 'opt1', ten: 'Option 1', nhan: 'Vừa vặn', buoi: [cuoiPA('Gói Unique full ngày', 46900000)], tongGiaGoc: 67800000, tongSauUuDai: 67800000, tietKiem: 0, diemKhacBiet: 'Unique vừa vặn' },
    { ma: 'opt2', ten: 'Option 2', nhan: 'Trọn vẹn nhất', buoi: [cuoiPA('Gói Signature full ngày', 65900000)], tongGiaGoc: 86800000, tongSauUuDai: 86800000, tietKiem: 0, diemKhacBiet: XSS },
  ] };
box.innerHTML = B.veBaoGia({ baoGia: { bg_n: NHIEU } }, '2026-10-15', { choPhepChon: true });
check('buoi chung mot lan', box.querySelectorAll('.bg-chung .bg-buoi').length === 1 && /Giống nhau ở mọi phương án/.test(box.innerText));
check('2 the phuong an', box.querySelectorAll('.bg-pa').length === 2);
check('tong tung phuong an', /67\.800\.000 đ/.test(box.querySelectorAll('.bg-pa')[0].innerText) && /86\.800\.000 đ/.test(box.querySelectorAll('.bg-pa')[1].innerText));
check('nut chon tren ca 2', box.querySelectorAll('.bg-pa [onclick*="chonPhuongAn(\'bg_n\',\'opt"]').length === 2);
check('diem khac biet escape', !box.querySelector('img') && box.innerText.includes('<img src=x'));
box.innerHTML = B.veBaoGia({ baoGia: { bg_n: NHIEU } }, '2026-10-15');
check('khong choPhepChon -> khong nut', !box.querySelector('[onclick*="chonPhuongAn"]'));
/* Review Focus 5: đã chọn */
box.innerHTML = B.veBaoGia({ baoGia: { bg_n: { ...NHIEU, phuongAnDaChon: 'opt2' } } }, '2026-10-15', { choPhepChon: true });
const pas = box.querySelectorAll('.bg-pa');
check('da chon: nhan + an nut o PA da chon', pas[1].classList.contains('da-chon') && /Khách đã chọn/.test(pas[1].innerText) && !pas[1].querySelector('[onclick]'));
check('da chon: PA kia mo nhung van chon duoc', pas[0].classList.contains('mo') && !!pas[0].querySelector('[onclick*="opt1"]'));
/* Review Focus 1: buổi chung rỗng (Firebase bỏ) */
box.innerHTML = B.veBaoGia({ baoGia: { bg_n: { ...NHIEU, buoi: undefined } } }, '2026-10-15', { choPhepChon: true });
check('khong buoi chung: khong vo, khong tieu de chung', box.querySelectorAll('.bg-pa').length === 2 && !box.querySelector('.bg-chung'));
/* Bản cũ nhiều phương án */
box.innerHTML = B.veBaoGia({ baoGia: { bg_n: NHIEU, bg_moi: { ...NHIEU, taoLuc: '2026-10-16T03:00:00.000Z' } } }, '2026-10-17');
check('ban cu nhieu PA: tu tong nho nhat', /2 phương án · từ 67\.800\.000 đ/.test(box.querySelector('.bg-ban-cu').textContent), box.querySelector('.bg-ban-cu').textContent);
/* Id / ma lạ không vào onclick */
box.innerHTML = B.veBaoGia({ baoGia: { "x');window.__bi=1;('": NHIEU } }, '2026-10-15', { choPhepChon: true });
check('id la: khong nut chon', !box.querySelector('[onclick*="chonPhuongAn"]'));
/* Hàm cho nút chọn */
check('phuongAnCua + goiCuoiCua', B.phuongAnCua(NHIEU, 'opt2').tongSauUuDai === 86800000 && B.goiCuoiCua(B.phuongAnCua(NHIEU, 'opt2')) === 'Signature' && B.phuongAnCua(NHIEU, 'opt9') === null);
check('khopGoi web giong server', B.khopGoi('Gói Unique full ngày') === 'Unique' && B.khopGoi('Combo 2 máy') === null && B.khopGoi('Gói lẻ') === 'Gói lẻ');
```

(Ca XSS cuối file `khong co ma nao chay` phải nằm sau khối này — đặt khối mới trước dòng `/* 5. Chống XSS */` nếu cần, hoặc ngay trước `window.__ketQua`.)

- [ ] **Step 2:** `npm run test:bao-gia-ui` → FAIL.

- [ ] **Step 3: Cài đặt `web/bao-gia.js`** — thêm hằng/hàm và sửa `veBaoGia`:

```js
// CHÉP Ở 2 NƠI: khopGoi + PACKAGES ở đây và api/mcp.ts (khopGoi). Sửa một chỗ thì sửa cả hai.
const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'];
const boDau = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
export function khopGoi(ten){
  const chuan = s => boDau(s).replace(/^goi\s+/, '').replace(/\s+/g, ' ').trim();
  const t = chuan(ten);
  return PACKAGES.find(p => { const g = chuan(p); return t === g || t.startsWith(g + ' '); }) || null;
}
const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

/** Phương án `ma` của báo giá, kèm buổi = buổi chung + buổi riêng. */
export function phuongAnCua(bg, ma){
  const p = mang(bg && bg.phuongAn).find(x => x && x.ma === ma);
  return p ? { ...p, buoi: [...mang(bg.buoi), ...mang(p.buoi)] } : null;
}
export function goiCuoiCua(pa){
  const cuoi = mang(pa && pa.buoi).find(b => b && b.loai === 'cuoi');
  return cuoi ? khopGoi(cuoi.goi) : null;
}
const tongCuaBan = b => {
  const pa = mang(b.phuongAn);
  if (!pa.length) return tien(b.tongSauUuDai);
  const chon = pa.find(p => p.ma === b.phuongAnDaChon);
  return chon ? `${chon.ten} · ${tien(chon.tongSauUuDai)}` : `${pa.length} phương án · từ ${tien(Math.min(...pa.map(p => Number(p.tongSauUuDai) || 0)))}`;
};

function veTong(tongGiaGoc, tongSauUuDai, tietKiem){
  return `<div class="bg-tong"><span class="bg-nhan">Tổng</span>${tietKiem ? `<s>${esc(tien(tongGiaGoc))}</s>` : ''}<b>${esc(tien(tongSauUuDai))}</b>${tietKiem ? `<span class="bg-tiet-kiem">Tiết kiệm ${esc(tien(tietKiem))}</span>` : ''}</div>`;
}

function vePhuongAn(bg, p, choPhepChon){
  const daChon = bg.phuongAnDaChon === p.ma;
  const coChon = !!bg.phuongAnDaChon;
  const nut = choPhepChon && !daChon && ID_OK.test(String(bg.id)) && ID_OK.test(String(p.ma))
    ? `<button type="button" class="btn btn-secondary btn-sm bg-chon" onclick="chonPhuongAn('${bg.id}','${p.ma}')">Khách chọn phương án này</button>` : '';
  return `
    <div class="bg-pa${daChon ? ' da-chon' : ''}${coChon && !daChon ? ' mo' : ''}">
      <div class="bg-pa-dau"><b>${esc(p.ten)}</b>${p.nhan ? ` <span class="bg-pa-nhan">${esc(p.nhan)}</span>` : ''}${daChon ? ' <span class="bg-da-chon">Khách đã chọn</span>' : ''}</div>
      ${mang(p.buoi).map(veBuoi).join('')}
      ${p.diemKhacBiet ? `<div class="bg-pa-khac">${esc(p.diemKhacBiet)}</div>` : ''}
      ${veTong(p.tongGiaGoc, p.tongSauUuDai, p.tietKiem)}
      ${nut}
    </div>`;
}
```

Trong `veBaoGia(lead, homNay, opts = {})`:
- Phần thân: nếu `mang(bg.phuongAn).length` → `${mang(bg.buoi).length ? `<div class="bg-chung"><div class="bg-nhan">Giống nhau ở mọi phương án</div>${mang(bg.buoi).map(veBuoi).join('')}</div>` : ''}<div class="bg-luoi-pa">${mang(bg.phuongAn).map(p => vePhuongAn(bg, p, !!opts.choPhepChon)).join('')}</div>`; ngược lại giữ `${mang(bg.buoi).map(veBuoi).join('')}` + `veTong(bg.tongGiaGoc, bg.tongSauUuDai, bg.tietKiem)`.
- Dòng bản cũ dùng `esc(tongCuaBan(b))` thay `esc(tien(b.tongSauUuDai))`.

- [ ] **Step 4: `index.html`**
  - Khối Báo giá: `BaoGia.veBaoGia(lead, todayISO(), { choPhepChon: true })`.
  - Hàm mới (đặt ngay trước `function initZalo(){`):

```js
/* ----- Báo giá nhiều phương án: khách chọn phương án (Trân bấm -> cập nhật thẳng lead) ----- */
function chonPhuongAn(baoGiaId, ma){
  const lead = leads.find(l => l.id === currentLeadId);
  if (!lead || !window.BaoGia) return;
  const bg = lead.baoGia && lead.baoGia[baoGiaId];
  const pa = bg && BaoGia.phuongAnCua(bg, ma);
  if (!pa) return;
  const goi = BaoGia.goiCuoiCua(pa);
  const dong = [`Doanh thu dự kiến → ${BaoGia.tien(pa.tongSauUuDai)}`];
  if (goi) dong.push(`Gói dịch vụ → ${goi}`);
  if (!confirm(`Khách chọn ${pa.ten}?\n\n${dong.join('\n')}`)) return;
  bg.phuongAnDaChon = ma;
  bg.chonLuc = new Date().toISOString();
  logActivity(lead, `Khách chọn ${pa.ten} (${BaoGia.tien(pa.tongSauUuDai)})`);
  if (goi) lead.package = goi;
  onFieldChange(lead.id, 'revenueExpected', Number(pa.tongSauUuDai) || 0);   // vẽ lại + scheduleSave
  openLead(lead.id);
}
```

  - CSS (cạnh CSS `.bg-*`):

```css
  .bg-chung{margin-top:10px; padding-top:6px; border-top:1px solid var(--border);}
  .bg-chung .bg-buoi:first-of-type{border-top:none; margin-top:0;}
  .bg-luoi-pa{display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-top:12px;}
  .bg-pa{border:1px solid var(--border); border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:4px;}
  .bg-pa.da-chon{border:2px solid var(--green-700);}
  .bg-pa.mo{opacity:.55;}
  .bg-pa-dau{font-size:14px;}
  .bg-pa-nhan{font-size:12px; color:var(--ink-faint);}
  .bg-da-chon{font-size:12px; font-weight:600; color:var(--green-700); background:var(--green-50); border-radius:6px; padding:1px 6px;}
  .bg-pa-khac{font-size:13px; color:var(--ink-faint); margin-top:4px;}
  .bg-pa .bg-tong{margin-top:auto;}
  .bg-chon{margin-top:8px; align-self:flex-start;}
```

- [ ] **Step 5: `CLAUDE.md`** — trong gạch đầu dòng `web/bao-gia.js` thêm: "Báo giá có thể nhiều phương án (`phuongAn[]`, buổi chung ở `buoi`); khách chọn trong app (nút → cập nhật thẳng doanh thu + gói) hoặc qua tool `chon_phuong_an` (đề xuất). `khopGoi` **chép 2 nơi**: đây và `api/mcp.ts`."
- [ ] **Step 6:** kiểm tra cú pháp script cổ điển index.html; `npm run test:bao-gia-ui`, `test:crm-chat`, `test:dongbo`, `test:ho-so-ui` → PASS.
- [ ] **Step 7: Commit** `Bao gia nhieu phuong an: hien phuong an canh nhau, nut khach chon trong app`.
