# Lưu báo giá vào lead — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool MCP `save_quote` lưu báo giá có cấu trúc vào lead (kiểm tra phép tính), tự sinh đề xuất vào hàng chờ, và app hiện khối "Báo giá" trong chi tiết lead.

**Architecture:** Báo giá nằm trong lead `crmData/leads/<id>/baoGia/<baoGiaId>` (qua `dataRoot()`). Hàm thuần trong `api/mcp.ts` kiểm tra phép tính và dựng danh sách đề xuất; logic chống trùng + ghi đề xuất của `propose_changes` được tách ra hàm dùng chung `themDeXuat` để `save_quote` dùng lại. App có module thuần mới `web/bao-gia.js` (vẽ HTML có escape) nạp vào `index.html`.

**Tech Stack:** TypeScript chạy thẳng bằng Node ≥ 20, zod 4, `mcp-handler`, Firebase RTDB (REST phía server, SDK phía app), JS thuần, test Chrome ngầm qua `test/zalo-dom.test.ts`.

**Spec:** `docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md`

## Global Constraints

- `api/mcp.ts` là MỘT file, không import file ngoài `api/`; ghi Firebase chỉ bằng `patchPath`; đường dẫn qua `dataRoot()` / `aiRoot()`.
- `save_quote` **không** sửa ô nào của lead ngoài `baoGia` và `activityLog`; mọi thay đổi ô lead đi qua hàng chờ đề xuất.
- Kiểm tra phép tính: làm tròn đến nghìn đồng, lệch ≤ 1.000 đ cho giá sau ưu đãi từng buổi; tổng và tiết kiệm phải **chính xác**.
- `baoGiaId` = `bg_<base36 thời gian><4 ký tự>`; bản hiệu lực = `taoLuc` lớn nhất.
- Đề xuất từ báo giá: `evidence: []`, `nguon: { loai: 'baoGia', baoGiaId, taoLuc }`, `reason: "Theo báo giá ngày dd/mm"`.
- Mọi chuỗi từ báo giá đưa vào HTML phải escape.
- Commit tiếng Việt KHÔNG dấu + dòng `Co-Authored-By:` ghi model thực hiện.
- Test chạm Firebase dùng sandbox `crmDataTest` + `aiDataTest`, luôn dọn sạch cuối bài.

**Làm rõ so với spec** (Task 1 sửa vào spec): việc nhắc hạn ưu đãi dùng id tất định theo **ngày hạn** — `huaId = "bguu" + hanUuDai bỏ dấu gạch` (id đề xuất `todo_bguu20261020`) — thay vì theo `baoGiaId`, để lưu bản báo giá mới cùng hạn ưu đãi không sinh thêm việc nhắc trùng.

## Review Focus

1. **% ưu đãi lẻ** (vd 33%, giá gốc không chia hết) → sai số làm tròn không bị coi là lỗi (≤ 1.000 đ). → test Task 1.
2. **Báo giá không có buổi cưới** (chỉ ăn hỏi) → vẫn lưu, chỉ đề xuất doanh thu (không đề xuất ngày cưới / gói). → test Task 1.
3. **Tên gói biến thể** ("gói standard", "STANDARD", "Gói Signature trọn ngày") → chỉ khớp khi trùng sau chuẩn hoá; tên có chữ thừa thì KHÔNG đề xuất gói (thà thiếu còn hơn sai). → test Task 1.
4. **Hạn ưu đãi hôm nay / ngày mai / đã qua** → hạn việc không bao giờ ở quá khứ; hạn đã qua thì không tạo việc. → test Task 1.
5. **Lưu cùng một báo giá hai lần** → không sinh đề xuất trùng. → test Task 2.

Giới hạn đã biết (không xử lý ở plan này, giống mọi tool MCP ghi vào lead hiện có): nếu Trân đang sửa dở **chính lead đó** trong app đúng lúc Claude lưu báo giá, lần lưu của app có thể ghi đè cả lead và làm mất bản báo giá vừa lưu.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `api/mcp.ts` (sửa) | Kiểu `BaoGia`, hàm thuần `kiemTraBaoGia` / `khopGoi` / `deXuatTuBaoGia` / `baoGiaMoiNhat`; tách `themDeXuat` dùng chung; tool `save_quote`; `get_lead` + `lead_context` trả `baoGiaMoiNhat`; quy tắc báo giá trong prompt |
| `web/bao-gia.js` (mới) | Logic thuần phía app: báo giá mới nhất, trạng thái hạn ưu đãi, vẽ khối Báo giá (escape) |
| `index.html` (sửa) | Nạp module, khối "Báo giá" trong tab Thông tin, CSS |
| `test/bao-gia.test.ts` (mới) | Hàm thuần server, không Firebase |
| `test/mcp-bao-gia.test.ts` (mới) | Tool trên sandbox |
| `test/bao-gia.test.html` (mới) | Vẽ khối Báo giá trong Chrome, chống XSS |
| `test/ho-so-ai.test.html` (sửa) | Ca thẻ đề xuất nguồn báo giá |
| `package.json`, `CLAUDE.md` (sửa) | Lệnh test, ghi chú |

---

### Task 1: Hàm thuần báo giá phía server

**Files:**
- Modify: `api/mcp.ts` — kiểu `BaoGia` + hàm thuần chèn **ngay sau** dòng `const taoIdHua = ...` (khoảng dòng 753); thêm `baoGia?` vào `interface Lead` (sau dòng `activityLog?: Activity[];`, khoảng dòng 294)
- Create: `test/bao-gia.test.ts`
- Modify: `package.json`, `docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md`

**Interfaces:**
- Produces (export từ `api/mcp.ts`):
  - `type BuoiBaoGia`, `type BaoGia` (đúng mô hình spec; `taoLuc?` tuỳ chọn)
  - `kiemTraBaoGia(bg: BaoGia): string[]`
  - `khopGoi(ten: string): string | null` — trả tên trong `PACKAGES` hoặc null
  - `type MucDeXuatBaoGia = { type: 'field'; field: 'revenueExpected' | 'weddingDate' | 'package'; newValue: string | number } | { type: 'todo'; huaId: string; todoText: string; due: string }`
  - `deXuatTuBaoGia(bg: BaoGia, homNay: string): MucDeXuatBaoGia[]`
  - `baoGiaMoiNhat(l: { baoGia?: Record<string, BaoGia> }): (BaoGia & { id: string }) | null`
  - `ddmm(iso: string): string` — `"2026-10-20"` → `"20/10"`

- [ ] **Step 1: Thêm lệnh test vào `package.json`** (sau dòng `"test:ho-so-ui": ...`)

```json
    "test:bao-gia": "node test/bao-gia.test.ts",
    "test:mcp-bao-gia": "node test/mcp-bao-gia.test.ts",
    "test:bao-gia-ui": "node test/zalo-dom.test.ts test/bao-gia.test.html",
```

- [ ] **Step 2: Viết test thất bại `test/bao-gia.test.ts`**

```ts
/** Test hàm thuần báo giá (api/mcp.ts). Không chạm Firebase. */
import * as S from '../api/mcp.ts';

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// Báo giá mẫu thật (Huyền Nguyễn) — phép tính đúng
const MAU: S.BaoGia = {
  tieuDe: 'Phương án quay chụp ăn hỏi & cưới', tenKhach: 'Cô dâu Huyền Nguyễn', diaDiem: 'Hà Nội',
  buoi: [
    { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-16', gio: '3h - 5h chiều', soKhach: '40-50', moTa: 'Chỉ lễ, không bao gồm tiệc',
      goi: 'Combo 2 máy chụp', giaGoc: 18000000, uuDaiPhanTram: 25, giaSauUuDai: 13500000,
      ekip: ['1 Nhiếp ảnh phóng sự', '1 Nhiếp ảnh truyền thống'], sanPham: ['Bộ hình phóng sự 200-300 tấm'], quaTang: [] },
    { loai: 'cuoi', ten: 'Đám cưới', ngay: '2026-12-24', gio: null, soKhach: '750', moTa: 'Đón dâu sáng + tiệc tại The One',
      goi: 'Gói Standard', giaGoc: 29900000, uuDaiPhanTram: 5, giaSauUuDai: 28405000,
      ekip: ['1 Nhiếp ảnh phóng sự', '1 Nhiếp ảnh nghi thức', '1 Quay phim phóng sự'], sanPham: ['Phim phóng sự ngắn 4-6 phút'], quaTang: ['Hình Sneak peek'] },
  ],
  tongGiaGoc: 47900000, tongSauUuDai: 41905000, tietKiem: 5995000,
  hanUuDai: '2026-10-20', ghiChu: ['Phụ phí chụp tiệc sau lễ ăn hỏi: 3.000.000 đ/máy'],
};
const sua = (f: (b: S.BaoGia) => void) => { const b = JSON.parse(JSON.stringify(MAU)); f(b); return b as S.BaoGia; };

console.log('\n>> kiemTraBaoGia');
eq('mau that: hop le', S.kiemTraBaoGia(MAU), []);
{
  const loi = S.kiemTraBaoGia(sua((b) => { b.buoi[0].giaSauUuDai = 13600000; b.tongSauUuDai = 42005000; b.tietKiem = 5895000; }));
  check('gia sau uu dai sai: neu ro dong', loi.length === 1 && /Buổi 1 \(Lễ ăn hỏi\)/.test(loi[0]) && /13\.500\.000/.test(loi[0]) && /13\.600\.000/.test(loi[0]), JSON.stringify(loi));
}
check('tong gia goc sai', S.kiemTraBaoGia(sua((b) => { b.tongGiaGoc = 48000000; b.tietKiem = 6095000; })).some((x) => /Tổng giá gốc/.test(x)));
check('tong sau uu dai sai', S.kiemTraBaoGia(sua((b) => { b.tongSauUuDai = 41000000; b.tietKiem = 6900000; })).some((x) => /Tổng sau ưu đãi/.test(x)));
check('tiet kiem sai', S.kiemTraBaoGia(sua((b) => { b.tietKiem = 5000000; })).some((x) => /Tiết kiệm/.test(x)));
check('ngay buoi khong co that', S.kiemTraBaoGia(sua((b) => { b.buoi[1].ngay = '2026-02-30'; })).some((x) => /2026-02-30/.test(x)));
check('han uu dai khong co that', S.kiemTraBaoGia(sua((b) => { b.hanUuDai = '2026-13-01'; })).some((x) => /Hạn ưu đãi/.test(x)));
check('hai buoi cuoi', S.kiemTraBaoGia(sua((b) => { b.buoi[0].loai = 'cuoi'; })).some((x) => /một buổi/.test(x)));
// Review Focus 1: % lẻ, sai số làm tròn ≤ 1.000 đ không phải lỗi
eq('uu dai le 33%: lam tron nghin dong', S.kiemTraBaoGia(sua((b) => {
  b.buoi[0].uuDaiPhanTram = 33; b.buoi[0].giaSauUuDai = 12060000;   // 18tr × 67% = 12.060.000
  b.tongSauUuDai = 12060000 + 28405000; b.tietKiem = 47900000 - b.tongSauUuDai;
})), []);
check('sai qua 1.000 d van la loi', S.kiemTraBaoGia(sua((b) => {
  b.buoi[0].giaSauUuDai = 13502000; b.tongSauUuDai = 13502000 + 28405000; b.tietKiem = 47900000 - b.tongSauUuDai;
})).length === 1);

console.log('\n>> khopGoi (Review Focus 3)');
eq('Gói Standard', S.khopGoi('Gói Standard'), 'Standard');
eq('gói standard', S.khopGoi('gói standard'), 'Standard');
eq('STANDARD', S.khopGoi('STANDARD'), 'Standard');
eq('HayDay Package', S.khopGoi('Gói HayDay Package'), 'HayDay Package');
eq('Gói lẻ', S.khopGoi('Gói lẻ'), 'Gói lẻ');
eq('ten co chu thua -> null', S.khopGoi('Gói Signature trọn ngày'), null);
eq('Combo 2 may chup -> null', S.khopGoi('Combo 2 máy chụp'), null);

console.log('\n>> deXuatTuBaoGia');
{
  const ds = S.deXuatTuBaoGia(MAU, '2026-10-15');
  eq('du 4 de xuat', ds.map((d) => d.type === 'field' ? d.field : 'todo'), ['revenueExpected', 'weddingDate', 'package', 'todo']);
  eq('doanh thu = tong sau uu dai', (ds[0] as any).newValue, 41905000);
  eq('ngay cuoi = buoi cuoi', (ds[1] as any).newValue, '2026-12-24');
  eq('goi khop', (ds[2] as any).newValue, 'Standard');
  eq('viec nhac: id theo ngay han + han truoc 2 ngay', [(ds[3] as any).huaId, (ds[3] as any).due], ['bguu20261020', '2026-10-18']);
  check('viec nhac: noi dung co ngay han', /20\/10/.test((ds[3] as any).todoText), (ds[3] as any).todoText);
}
// Review Focus 2: chỉ ăn hỏi
{
  const chiAnHoi = sua((b) => { b.buoi = [b.buoi[0]]; b.tongGiaGoc = 18000000; b.tongSauUuDai = 13500000; b.tietKiem = 4500000; });
  eq('chi an hoi: hop le', S.kiemTraBaoGia(chiAnHoi), []);
  eq('chi an hoi: chi de xuat doanh thu + viec', S.deXuatTuBaoGia(chiAnHoi, '2026-10-15').map((d) => d.type === 'field' ? d.field : 'todo'), ['revenueExpected', 'todo']);
}
// Review Focus 4: hạn ưu đãi sát / đã qua
eq('han ngay mai: due la hom nay', (S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-16'; }), '2026-10-15').at(-1) as any).due, '2026-10-15');
eq('han hom nay: due la hom nay', (S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-15'; }), '2026-10-15').at(-1) as any).due, '2026-10-15');
check('han da qua: khong tao viec', !S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-14'; }), '2026-10-15').some((d) => d.type === 'todo'));
check('khong co han: khong tao viec', !S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = null; }), '2026-10-15').some((d) => d.type === 'todo'));
check('goi khong khop: khong de xuat goi', !S.deXuatTuBaoGia(sua((b) => { b.buoi[1].goi = 'Gói Standard trọn ngày'; }), '2026-10-15').some((d) => d.type === 'field' && d.field === 'package'));

console.log('\n>> baoGiaMoiNhat + ddmm');
eq('chua co bao gia', S.baoGiaMoiNhat({}), null);
{
  const l = { baoGia: {
    bg_a: { ...MAU, taoLuc: '2026-10-10T03:00:00.000Z', tongSauUuDai: 1 },
    bg_b: { ...MAU, taoLuc: '2026-10-14T03:00:00.000Z', tongSauUuDai: 2 },
  } } as any;
  eq('lay ban moi nhat', [S.baoGiaMoiNhat(l)?.id, S.baoGiaMoiNhat(l)?.tongSauUuDai], ['bg_b', 2]);
}
eq('ddmm', S.ddmm('2026-10-20'), '20/10');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npm run test:bao-gia`
Expected: lỗi `S.kiemTraBaoGia is not a function`.

- [ ] **Step 4: Cài đặt**

Trong `interface Lead`, sau dòng `activityLog?: Activity[];`:

```ts
  /** Báo giá Trân làm trên claude.ai, lưu qua tool save_quote. Khoá = baoGiaId; bản mới nhất = taoLuc lớn nhất. */
  baoGia?: Record<string, BaoGia>;
```

Ngay sau dòng `const taoIdHua = ...`:

```ts
/* ===================== Báo giá trong lead: hàm thuần (export để test) ===================== */
// Spec: docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md

export type BuoiBaoGia = {
  loai: 'anHoi' | 'cuoi' | 'khac'; ten: string; ngay: string | null; gio: string | null;
  soKhach: string | null; moTa: string | null; goi: string;
  giaGoc: number; uuDaiPhanTram: number; giaSauUuDai: number;
  ekip: string[]; sanPham: string[]; quaTang: string[];
};
export type BaoGia = {
  taoLuc?: string; tieuDe: string; tenKhach: string; diaDiem: string | null;
  buoi: BuoiBaoGia[]; tongGiaGoc: number; tongSauUuDai: number; tietKiem: number;
  hanUuDai: string | null; ghiChu: string[];
};

const tienVN = (n: number) => Number(n).toLocaleString('vi-VN');
export const ddmm = (iso: string) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

/** Lỗi phép tính / ngày của một báo giá; mảng rỗng = hợp lệ. */
export function kiemTraBaoGia(bg: BaoGia): string[] {
  const loi: string[] = [];
  bg.buoi.forEach((b, i) => {
    const nhan = `Buổi ${i + 1} (${b.ten})`;
    const dung = Math.round((b.giaGoc * (100 - b.uuDaiPhanTram)) / 100 / 1000) * 1000;
    if (Math.abs(dung - b.giaSauUuDai) > 1000) {
      loi.push(`${nhan}: ${tienVN(b.giaGoc)} × ${100 - b.uuDaiPhanTram}% = ${tienVN(dung)}, không phải ${tienVN(b.giaSauUuDai)}`);
    }
    if (b.ngay && kiemTraGiaTriO('weddingDate', b.ngay)) loi.push(`${nhan}: ngày ${b.ngay} không có thật`);
  });
  const tongGoc = bg.buoi.reduce((s, b) => s + b.giaGoc, 0);
  const tongSau = bg.buoi.reduce((s, b) => s + b.giaSauUuDai, 0);
  if (tongGoc !== bg.tongGiaGoc) loi.push(`Tổng giá gốc phải là ${tienVN(tongGoc)} (cộng các buổi), không phải ${tienVN(bg.tongGiaGoc)}`);
  if (tongSau !== bg.tongSauUuDai) loi.push(`Tổng sau ưu đãi phải là ${tienVN(tongSau)} (cộng các buổi), không phải ${tienVN(bg.tongSauUuDai)}`);
  if (bg.tietKiem !== bg.tongGiaGoc - bg.tongSauUuDai) loi.push(`Tiết kiệm phải là ${tienVN(bg.tongGiaGoc - bg.tongSauUuDai)}, không phải ${tienVN(bg.tietKiem)}`);
  if (bg.hanUuDai && kiemTraGiaTriO('weddingDate', bg.hanUuDai)) loi.push(`Hạn ưu đãi ${bg.hanUuDai} không có thật`);
  if (bg.buoi.filter((b) => b.loai === 'cuoi').length > 1) loi.push('Chỉ được một buổi loại "cuoi" (đám cưới)');
  return loi;
}

/** Tên gói trong báo giá -> gói của app (PACKAGES), hoặc null nếu không khớp hẳn. */
export function khopGoi(ten: string): string | null {
  const chuan = (s: string) => boDauZalo(s).replace(/^goi\s+/, '').replace(/\s+/g, ' ').trim();
  const t = chuan(ten);
  return (PACKAGES as readonly string[]).find((p) => chuan(p) === t) || null;
}

export type MucDeXuatBaoGia =
  | { type: 'field'; field: 'revenueExpected' | 'weddingDate' | 'package'; newValue: string | number }
  | { type: 'todo'; huaId: string; todoText: string; due: string };

/** Đề xuất sinh từ một báo giá: doanh thu, ngày cưới, gói, việc nhắc trước hạn ưu đãi 2 ngày. */
export function deXuatTuBaoGia(bg: BaoGia, homNay: string): MucDeXuatBaoGia[] {
  const ds: MucDeXuatBaoGia[] = [{ type: 'field', field: 'revenueExpected', newValue: bg.tongSauUuDai }];
  const cuoi = bg.buoi.find((b) => b.loai === 'cuoi');
  if (cuoi?.ngay) ds.push({ type: 'field', field: 'weddingDate', newValue: cuoi.ngay });
  const goi = cuoi ? khopGoi(cuoi.goi) : null;
  if (goi) ds.push({ type: 'field', field: 'package', newValue: goi });
  if (bg.hanUuDai && bg.hanUuDai >= homNay) {
    const truoc2 = congNgay(bg.hanUuDai, -2);
    ds.push({
      type: 'todo',
      huaId: 'bguu' + bg.hanUuDai.replace(/-/g, ''),
      todoText: `Nhắc khách ưu đãi hết hạn ${ddmm(bg.hanUuDai)}`,
      due: truoc2 < homNay ? homNay : truoc2,
    });
  }
  return ds;
}

export function baoGiaMoiNhat(l: { baoGia?: Record<string, BaoGia> }): (BaoGia & { id: string }) | null {
  const ds = Object.entries(l.baoGia || {}).map(([id, b]) => ({ ...b, id }));
  ds.sort((a, b) => String(b.taoLuc || '').localeCompare(String(a.taoLuc || '')));
  return ds[0] || null;
}
```

Lưu ý: `PACKAGES`, `kiemTraGiaTriO` đã khai báo phía trên; `boDauZalo` và `congNgay` là `function` khai báo phía dưới trong file (được hoisting) — dùng được.

- [ ] **Step 5: Chạy test**

Run: `npm run test:bao-gia` → `PASS`. Run thêm: `npm run test:ho-so` → `PASS` (không ảnh hưởng).

- [ ] **Step 6: Sửa spec theo điểm làm rõ** — trong `docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md`, mục `save_quote` bước 3 gạch đầu dòng "việc", thay `Id tất định \`todo_bg_<baoGiaId>\`.` bằng `Id tất định theo ngày hạn: \`todo_bguu<YYYYMMDD>\` (bản báo giá mới cùng hạn không sinh việc trùng).`

- [ ] **Step 7: Commit**

```bash
git add api/mcp.ts test/bao-gia.test.ts package.json docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md
git commit -m "Bao gia: ham thuan kiem tra phep tinh, khop goi, sinh de xuat

Co-Authored-By: <model thuc hien>"
```

---

### Task 2: Tool `save_quote` + đọc báo giá trong `get_lead` / `lead_context` / prompt

**Files:**
- Modify: `api/mcp.ts` — kiểu `DeXuat` (thêm `nguon?`); hàm `moLoDeXuat` / `themDeXuat` ở cấp module, ngay sau hàm `napTinLead`; viết lại thân `propose_changes` dùng helper; schema `BaoGiaZ` ngay sau khối hàm thuần của Task 1; tool `save_quote` đăng ký ngay sau `propose_changes`; `get_lead`; `lead_context`; prompt `cap-nhat-ho-so`
- Create: `test/mcp-bao-gia.test.ts`

**Interfaces:**
- Consumes (Task 1): `BaoGia`, `kiemTraBaoGia`, `deXuatTuBaoGia`, `baoGiaMoiNhat`, `ddmm`; sẵn có: `xetDeXuat`, `napDeXuat`, `aiRoot`, `dataRoot`, `findLead`, `loadCrm`, `logActivity`, `touch`, `todayISO`, `formatMoney`, `NGAY`, `ok`.
- Produces:
  - `type LoDeXuat = { patch: Record<string, unknown>; taoMoi: DeXuat[]; boQua: Array<{ item: unknown; lyDo: string }>; cuaLead: DeXuat[]; now: string }`
  - `moLoDeXuat(cuaLead: DeXuat[]): LoDeXuat`
  - `themDeXuat(lo: LoDeXuat, l: Lead, item: unknown, khoa: { type: 'field'; field: string; newValue: unknown } | { type: 'todo'; huaId: string }, than: Omit<DeXuat, 'id' | 'leadId' | 'status' | 'createdAt'>): void`
  - Tool `save_quote({ lead, baoGia })` → JSON `{ baoGiaId, deXuatTao: [{ id, type, field?, newValue?, todoText?, due? }], deXuatBoQua: [{ lyDo }] }`
  - `get_lead` thêm `baoGiaMoiNhat`, `soBanBaoGia` và **không** trả `baoGia` thô; `lead_context` thêm `baoGiaMoiNhat`
  - `DeXuat.nguon?: { loai: 'baoGia'; baoGiaId: string; taoLuc: string }`

- [ ] **Step 1: Viết test thất bại `test/mcp-bao-gia.test.ts`**

```ts
/**
 * Test tool save_quote + get_lead/lead_context trả báo giá. Sandbox crmDataTest + zaloTest + aiDataTest.
 * Luôn dọn sạch cuối bài.
 */
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';

{
  const fs = await import('node:fs');
  const path = new URL('../.env.local', import.meta.url);
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(path)) {
    process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(path, 'utf8').trim();
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local (service account)'); process.exit(1); }
}

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const mod = (await import('../api/mcp.ts')) as any;
const handler = mod.default;

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
  }));
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const body = JSON.parse(line ? line.slice(5).trim() : text);
  const out = body?.result?.content?.[0]?.text ?? JSON.stringify(body?.error ?? '');
  let json: any = null;
  try { json = JSON.parse(out); } catch { json = null; }
  return { text: out, json, isError: !!body?.result?.isError || !!body?.error };
}

async function adminToken(): Promise<string> {
  const { createSign } = await import('node:crypto');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
  const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', exp: iat + 3600, iat,
  }));
  const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
  });
  return ((await res.json()) as any).access_token;
}
const TOKEN = await adminToken();
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${DB}/${path}.json`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` } });
const doc = async (path: string) => (await db(path)).json() as Promise<any>;

// Ngày tương đối để test không phụ thuộc lịch
const homNay = mod.congNgay(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), 0);
const HAN = mod.congNgay(homNay, 10);
const MAU = {
  tieuDe: 'Phương án quay chụp ăn hỏi & cưới', tenKhach: 'Cô dâu Huyền Nguyễn', diaDiem: 'Hà Nội',
  buoi: [
    { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-16', gio: '3h - 5h chiều', soKhach: '40-50', moTa: null,
      goi: 'Combo 2 máy chụp', giaGoc: 18000000, uuDaiPhanTram: 25, giaSauUuDai: 13500000, ekip: ['1 Nhiếp ảnh phóng sự'], sanPham: [], quaTang: [] },
    { loai: 'cuoi', ten: 'Đám cưới', ngay: '2026-12-24', gio: null, soKhach: '750', moTa: 'Tiệc tại The One',
      goi: 'Gói Standard', giaGoc: 29900000, uuDaiPhanTram: 5, giaSauUuDai: 28405000, ekip: [], sanPham: ['Phim 4-6 phút'], quaTang: ['Hình Sneak peek'] },
  ],
  tongGiaGoc: 47900000, tongSauUuDai: 41905000, tietKiem: 5995000, hanUuDai: HAN, ghiChu: [],
};

try {
  console.log('\n>> Dung sandbox');
  await db('aiDataTest', { method: 'DELETE' });
  await db('crmDataTest', { method: 'PUT', body: JSON.stringify({
    leads: { L1: { id: 'L1', name: 'Huyền Nguyễn', stage: 'baogia', package: 'Unique', revenueExpected: 0, ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-10-01' } },
    planRevenue: 1, planLeads: 1,
  }) });

  console.log('\n>> save_quote');
  const sai = await callTool('save_quote', { lead: 'L1', baoGia: { ...MAU, tongSauUuDai: 42000000, tietKiem: 5900000 } });
  check('tu choi phep tinh sai', sai.isError && /Tổng sau ưu đãi/.test(sai.text), sai.text);
  check('phep tinh sai: khong ghi gi', !(await doc('crmDataTest/leads/L1/baoGia')));

  const r1 = await callTool('save_quote', { lead: 'Huyền Nguyễn', baoGia: MAU });
  check('luu hop le', !r1.isError && /^bg_[a-z0-9]+$/.test(r1.json?.baoGiaId), r1.text);
  const luu = await doc(`crmDataTest/leads/L1/baoGia/${r1.json?.baoGiaId}`);
  check('bao gia luu trong lead + taoLuc', luu?.tongSauUuDai === 41905000 && typeof luu?.taoLuc === 'string', JSON.stringify(luu).slice(0, 200));
  const lead = await doc('crmDataTest/leads/L1');
  check('o cua lead khong doi', lead.revenueExpected === 0 && lead.package === 'Unique' && !lead.weddingDate, JSON.stringify(lead).slice(0, 200));
  check('co log hoat dong', Object.values(lead.activityLog || {}).some((a: any) => /Lưu báo giá/.test(a.text)));

  const p1 = (await doc('aiDataTest/proposals')) || {};
  const ds1 = Object.entries(p1).map(([id, p]: any) => ({ id, ...p }));
  check('4 de xuat', ds1.length === 4, JSON.stringify(ds1.map((p) => p.field || p.id)));
  const dt = ds1.find((p) => p.field === 'revenueExpected');
  check('de xuat doanh thu + nguon bao gia', dt?.newValue === 41905000 && dt?.nguon?.loai === 'baoGia' && dt?.nguon?.baoGiaId === r1.json?.baoGiaId && /Theo báo giá ngày/.test(dt?.reason), JSON.stringify(dt));
  check('de xuat ngay cuoi', ds1.some((p) => p.field === 'weddingDate' && p.newValue === '2026-12-24'));
  check('de xuat goi Standard', ds1.some((p) => p.field === 'package' && p.newValue === 'Standard'));
  const viec = ds1.find((p) => p.type === 'todo');
  check('viec nhac han uu dai', viec?.id === `todo_bguu${HAN.replace(/-/g, '')}` && viec?.due === mod.congNgay(HAN, -2), JSON.stringify(viec));

  // Review Focus 5: lưu lại y nguyên -> không đề xuất trùng
  const r2 = await callTool('save_quote', { lead: 'L1', baoGia: MAU });
  const ds2 = Object.values((await doc('aiDataTest/proposals')) || {});
  check('luu lai: khong de xuat trung', !r2.isError && ds2.length === 4 && ds2.filter((p: any) => p.status === 'cho').length === 4, `${ds2.length} ${r2.text.slice(0, 300)}`);
  check('luu lai: bao bo qua', (r2.json?.deXuatBoQua || []).length === 4, r2.text.slice(0, 300));

  // Bản mới: ăn hỏi giảm 30% -> tổng đổi -> đề xuất doanh thu được THAY, việc nhắc không thêm
  const moi = JSON.parse(JSON.stringify(MAU));
  moi.buoi[0].uuDaiPhanTram = 30; moi.buoi[0].giaSauUuDai = 12600000;
  moi.tongSauUuDai = 12600000 + 28405000; moi.tietKiem = 47900000 - moi.tongSauUuDai;
  const r3 = await callTool('save_quote', { lead: 'L1', baoGia: moi });
  const ds3 = Object.values((await doc('aiDataTest/proposals')) || {}) as any[];
  const dtCho = ds3.filter((p) => p.field === 'revenueExpected' && p.status === 'cho');
  check('ban moi: 1 de xuat doanh thu dang cho voi tong moi', dtCho.length === 1 && dtCho[0].newValue === moi.tongSauUuDai, JSON.stringify(dtCho));
  check('ban moi: viec nhac khong trung', ds3.filter((p) => p.type === 'todo').length === 1);

  console.log('\n>> get_lead / lead_context');
  const g = await callTool('get_lead', { lead: 'L1' });
  check('get_lead: baoGiaMoiNhat la ban moi', g.json?.baoGiaMoiNhat?.id === r3.json?.baoGiaId && g.json?.soBanBaoGia === 3, g.text.slice(0, 300));
  check('get_lead: khong tra baoGia tho', g.json && !('baoGia' in g.json));
  const c = await callTool('lead_context', { lead: 'L1' });
  check('lead_context: co baoGiaMoiNhat', c.json?.baoGiaMoiNhat?.tongSauUuDai === moi.tongSauUuDai, c.text.slice(0, 300));
} finally {
  console.log('\n>> Don sandbox');
  await db('crmDataTest', { method: 'DELETE' });
  await db('zaloTest', { method: 'DELETE' });
  await db('aiDataTest', { method: 'DELETE' });
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm run test:mcp-bao-gia` → FAIL (tool `save_quote` không tồn tại).

- [ ] **Step 3: Thêm `nguon?` vào `DeXuat`** — trong `export type DeXuat = { ... }`, sau dòng `giaTriDuyet?: unknown; boLyDo?: string;`:

```ts
  /** Đề xuất do server sinh từ báo giá (không có trích dẫn tin Zalo). */
  nguon?: { loai: 'baoGia'; baoGiaId: string; taoLuc: string };
```

- [ ] **Step 4: Tách helper ghi đề xuất** — ở cấp module, ngay sau hàm `napTinLead`:

```ts
/** Một lô đề xuất sắp ghi vào aiRoot()/proposals trong MỘT lệnh PATCH. */
type LoDeXuat = { patch: Record<string, unknown>; taoMoi: DeXuat[]; boQua: Array<{ item: unknown; lyDo: string }>; cuaLead: DeXuat[]; now: string };

function moLoDeXuat(cuaLead: DeXuat[]): LoDeXuat {
  return { patch: {}, taoMoi: [], boQua: [], cuaLead, now: new Date().toISOString() };
}

/**
 * Áp 4 quy tắc chống trùng (xetDeXuat) rồi thêm một đề xuất vào lô. Dùng chung cho propose_changes
 * (Claude đề xuất từ hội thoại) và save_quote (server đề xuất từ báo giá).
 */
function themDeXuat(
  lo: LoDeXuat, l: Lead, item: unknown,
  khoa: { type: 'field'; field: string; newValue: unknown } | { type: 'todo'; huaId: string },
  than: Omit<DeXuat, 'id' | 'leadId' | 'status' | 'createdAt'>
): void {
  const xet = xetDeXuat(khoa, l as any, lo.cuaLead);
  if (xet.hanhDong === 'boQua') { lo.boQua.push({ item, lyDo: xet.lyDo }); return; }
  const id = khoa.type === 'todo' ? `todo_${khoa.huaId}` : `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const p: DeXuat = { ...than, id, leadId: l.id, status: 'cho', createdAt: lo.now };
  if (xet.hanhDong === 'thay' && Object.hasOwn(lo.patch, xet.idCu)) {
    // bản cũ vừa tạo trong CHÍNH lô này: bỏ hẳn, không ghi đường con (tránh PATCH chồng đường dẫn)
    delete lo.patch[xet.idCu];
    const i = lo.taoMoi.findIndex((x) => x.id === xet.idCu);
    if (i >= 0) lo.taoMoi.splice(i, 1);
    const j = lo.cuaLead.findIndex((x) => x.id === xet.idCu);
    if (j >= 0) lo.cuaLead.splice(j, 1);
  } else if (xet.hanhDong === 'thay') {
    lo.patch[`${xet.idCu}/status`] = 'bo';
    lo.patch[`${xet.idCu}/boLyDo`] = 'Thay bằng đề xuất mới';
    lo.patch[`${xet.idCu}/decidedAt`] = lo.now;
    const cu = lo.cuaLead.find((x) => x.id === xet.idCu);
    if (cu) cu.status = 'bo';
  }
  const { id: _id, ...luu } = p;
  lo.patch[id] = luu;
  lo.cuaLead.push(p);
  lo.taoMoi.push(p);
}
```

- [ ] **Step 5: Viết lại thân `propose_changes` dùng helper** — thay toàn bộ thân `async (args) => { ... }` của tool `propose_changes` bằng:

```ts
      async (args) => {
        const [crm, z] = await Promise.all([loadCrm(), loadZalo()]);
        const l = findLead(crm, args.lead);
        const [deXuat, brief, { theoConv }] = await Promise.all([napDeXuat(), napBrief(l.id), napTinLead(z, l.id)]);
        const lo = moLoDeXuat(deXuat.filter((p) => p.leadId === l.id));

        for (const item of args.items) {
          const loi = kiemTraBangChung(item.evidence, theoConv, 'evidence');
          if (item.type === 'field') {
            const sai = kiemTraGiaTriO(item.field, item.newValue);
            if (sai) { lo.boQua.push({ item, lyDo: sai }); continue; }
          } else {
            if (!/^h_[a-z0-9]{8}$/.test(item.huaId) || !Object.hasOwn(brief?.loiHua || {}, item.huaId)) {
              lo.boQua.push({ item, lyDo: `Không có lời hứa ${item.huaId} trong hồ sơ — lưu hồ sơ trước` }); continue;
            }
            const saiHan = kiemTraGiaTriO('weddingDate', item.due);
            if (saiHan) { lo.boQua.push({ item, lyDo: `Hạn việc không hợp lệ: ${saiHan}` }); continue; }
          }
          if (loi.length) { lo.boQua.push({ item, lyDo: loi.join('; ') }); continue; }

          if (item.type === 'field') {
            themDeXuat(lo, l, item, { type: 'field', field: item.field, newValue: item.newValue },
              { type: 'field', field: item.field, oldValue: (l as any)[item.field] ?? null, newValue: item.newValue, reason: item.reason, evidence: item.evidence });
          } else {
            themDeXuat(lo, l, item, { type: 'todo', huaId: item.huaId },
              { type: 'todo', todoText: item.todoText, due: item.due, huaId: item.huaId, reason: item.reason, evidence: item.evidence });
          }
        }

        if (Object.keys(lo.patch).length) await patchPath(`${aiRoot()}/proposals`, lo.patch);
        return ok({ taoMoi: lo.taoMoi, boQua: lo.boQua });
      }
```

Chạy ngay hồi quy: `npm run test:mcp-ho-so` → phải vẫn `PASS` (hành vi không đổi).

- [ ] **Step 6: Schema báo giá** — ngay sau khối hàm thuần Task 1 (sau `baoGiaMoiNhat`):

```ts
const DsChuoiZ = z.array(z.string().max(200)).max(10);
const BuoiBaoGiaZ = z.object({
  loai: z.enum(['anHoi', 'cuoi', 'khac']).describe('anHoi = lễ ăn hỏi, cuoi = đám cưới (tối đa 1), khac = buổi khác'),
  ten: z.string().min(1).max(100),
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  gio: z.string().max(60).nullable(),
  soKhach: z.string().max(30).nullable(),
  moTa: z.string().max(300).nullable(),
  goi: z.string().min(1).max(100),
  giaGoc: z.number().int().nonnegative(),
  uuDaiPhanTram: z.number().min(0).max(100),
  giaSauUuDai: z.number().int().nonnegative(),
  ekip: DsChuoiZ, sanPham: DsChuoiZ, quaTang: DsChuoiZ,
}).strict();
const BaoGiaZ = z.object({
  tieuDe: z.string().min(1).max(200),
  tenKhach: z.string().min(1).max(100),
  diaDiem: z.string().max(100).nullable(),
  buoi: z.array(BuoiBaoGiaZ).min(1).max(6),
  tongGiaGoc: z.number().int().nonnegative(),
  tongSauUuDai: z.number().int().nonnegative(),
  tietKiem: z.number().int().nonnegative(),
  hanUuDai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ghiChu: z.array(z.string().max(300)).max(10),
}).strict();
```

- [ ] **Step 7: Đăng ký tool `save_quote`** — ngay sau tool `propose_changes`:

```ts
    server.registerTool(
      'save_quote',
      {
        title: 'Lưu báo giá vào lead',
        description:
          'Lưu báo giá Trân vừa làm trên claude.ai vào lead (mỗi lần lưu là một phiên bản mới; bản mới nhất là bản hiệu lực). Dùng SAU KHI làm xong báo giá; nếu chưa rõ lead nào thì HỎI Trân "lưu vào lead nào?" trước khi gọi. Mọi số tiền là số nguyên VND. Server kiểm tra phép tính (giá sau ưu đãi = giá gốc × (100 − %), tổng = cộng các buổi, tiết kiệm = tổng gốc − tổng sau ưu đãi) — sai thì từ chối và chỉ rõ dòng sai. Lưu xong server tự tạo đề xuất (doanh thu dự kiến, ngày cưới, gói, việc nhắc trước hạn ưu đãi) vào hàng chờ để Trân duyệt trong app — tool này KHÔNG sửa ô nào của lead.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          baoGia: BaoGiaZ,
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const bg = args.baoGia as BaoGia;
        const loi = kiemTraBaoGia(bg);
        if (loi.length) throw new Error(`Chưa lưu báo giá cho "${l.name}". Sửa ${loi.length} lỗi:\n- ${loi.join('\n- ')}`);

        const baoGiaId = `bg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const taoLuc = new Date().toISOString();
        await patchPath(`${dataRoot()}/leads/${l.id}/baoGia`, { [baoGiaId]: { ...bg, taoLuc } });
        await logActivity(l, `Lưu báo giá: ${formatMoney(bg.tongSauUuDai)} (${bg.buoi.length} buổi)`);
        await touch();

        const lo = moLoDeXuat((await napDeXuat()).filter((p) => p.leadId === l.id));
        const homNay = todayISO();
        const chung = { reason: `Theo báo giá ngày ${ddmm(homNay)}`, evidence: [], nguon: { loai: 'baoGia' as const, baoGiaId, taoLuc } };
        for (const m of deXuatTuBaoGia(bg, homNay)) {
          if (m.type === 'field') {
            themDeXuat(lo, l, m, { type: 'field', field: m.field, newValue: m.newValue },
              { ...chung, type: 'field', field: m.field, oldValue: (l as any)[m.field] ?? null, newValue: m.newValue });
          } else {
            themDeXuat(lo, l, m, { type: 'todo', huaId: m.huaId },
              { ...chung, type: 'todo', todoText: m.todoText, due: m.due, huaId: m.huaId });
          }
        }
        if (Object.keys(lo.patch).length) await patchPath(`${aiRoot()}/proposals`, lo.patch);

        return ok({
          baoGiaId,
          deXuatTao: lo.taoMoi.map((p) => ({ id: p.id, type: p.type, field: p.field, newValue: p.newValue, todoText: p.todoText, due: p.due })),
          deXuatBoQua: lo.boQua.map((b) => ({ lyDo: b.lyDo })),
        });
      }
    );
```

Lưu ý: `todayISO()` có sẵn trong file (giờ VN). `logActivity` ghi `activityLog` theo index — đúng như các tool ghi khác.

- [ ] **Step 8: `get_lead` trả báo giá mới nhất** — trong `ok({ ...l, ... })` của tool `get_lead`, thêm ngay sau `...l,`:

```ts
          baoGia: undefined,
          baoGiaMoiNhat: baoGiaMoiNhat(l),
          soBanBaoGia: Object.keys(l.baoGia || {}).length,
```

(`baoGia: undefined` bị JSON bỏ đi → không trả các bản cũ thô.)

- [ ] **Step 9: `lead_context` trả báo giá** — trong `ok({ ... })` của `lead_context`, thêm sau dòng `viecChuaXong: ...`:

```ts
          baoGiaMoiNhat: baoGiaMoiNhat(l),
```

- [ ] **Step 10: Quy tắc báo giá trong prompt `cap-nhat-ho-so`** — ngay sau dòng `'- Không đề xuất chuyển giai đoạn, Won hay Lost. Không đề xuất lại giá trị nằm trong daBo.',` thêm:

```ts
              '- Nếu lead có baoGiaMoiNhat: coi đó là giá đã chào chính thức — ghi vào nhóm Ngân sách (tổng sau ưu đãi, gói từng buổi, hạn ưu đãi). Không đề xuất doanh thu / ngày cưới / gói trùng với báo giá (server đã tự đề xuất).',
```

- [ ] **Step 11: Chạy test**

Run: `npm run test:mcp-bao-gia` → `PASS`. Run: `npm run test:mcp-ho-so` → `PASS`. Run: `npm run test:bao-gia` → `PASS`. (Flaky mạng → chạy lại.)

- [ ] **Step 12: Commit**

```bash
git add api/mcp.ts test/mcp-bao-gia.test.ts
git commit -m "Bao gia: tool save_quote, tach themDeXuat dung chung, get_lead/lead_context tra bao gia moi nhat

Co-Authored-By: <model thuc hien>"
```

---

### Task 3: Module app `web/bao-gia.js` + test HTML

**Files:**
- Create: `web/bao-gia.js`, `test/bao-gia.test.html`
- Modify: `test/ho-so-ai.test.html` (ca đề xuất nguồn báo giá)

**Interfaces:**
- Produces (export, gắn `window.BaoGia` ở Task 4):
  - `esc(s)`, `tien(n) -> "41.905.000 đ"`, `ddmm(iso)`
  - `dsBaoGia(lead) -> Array<BaoGia & {id}>` (mới nhất trước)
  - `baoGiaMoiNhat(lead) -> (BaoGia & {id}) | null`
  - `trangThaiHan(han, homNay) -> 'het' | 'sap' | 'con' | null` (`sap` = còn 0..3 ngày)
  - `veBaoGia(lead, homNay) -> string` (HTML; `''` khi chưa có báo giá)

- [ ] **Step 1: Viết test thất bại `test/bao-gia.test.html`**

```html
<!doctype html>
<meta charset="utf-8">
<title>Test khoi Bao gia</title>
<!-- Chay bang: npm run test:bao-gia-ui -->
<body>
<div id="box"></div>
<script type="module">
import * as B from '../web/bao-gia.js';

const ket = [];
const check = (ten, dk, ct = '') => ket.push({ ten, ok: !!dk, chiTiet: String(ct) });
const box = document.getElementById('box');
const XSS = '<img src=x onerror="window.__bi=1">';
const buoi = (o) => ({ loai: 'cuoi', ten: 'Đám cưới', ngay: '2026-12-24', gio: null, soKhach: '750', moTa: null, goi: 'Gói Standard',
  giaGoc: 29900000, uuDaiPhanTram: 5, giaSauUuDai: 28405000, ekip: ['1 Quay phim'], sanPham: ['Phim 4-6 phút'], quaTang: [], ...o });
const bg = (o) => ({ tieuDe: 'Phương án quay chụp', tenKhach: 'Cô dâu Huyền', diaDiem: 'Hà Nội',
  buoi: [buoi({ loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-16', goi: 'Combo 2 máy', giaGoc: 18000000, uuDaiPhanTram: 25, giaSauUuDai: 13500000 }), buoi({})],
  tongGiaGoc: 47900000, tongSauUuDai: 41905000, tietKiem: 5995000, hanUuDai: '2026-10-20', ghiChu: ['Phụ phí 3.000.000 đ/máy'], ...o });

/* 1. Chưa có báo giá */
check('chua co: rong', B.veBaoGia({}, '2026-10-15') === '');
check('chua co: moi nhat null', B.baoGiaMoiNhat({ baoGia: {} }) === null);

/* 2. Bản mới nhất + các bản cũ */
const lead = { baoGia: {
  bg_a: bg({ taoLuc: '2026-10-10T03:00:00.000Z', tongSauUuDai: 45000000 }),
  bg_b: bg({ taoLuc: '2026-10-14T03:00:00.000Z' }),
} };
check('moi nhat la bg_b', B.baoGiaMoiNhat(lead).id === 'bg_b');
box.innerHTML = B.veBaoGia(lead, '2026-10-15');
check('2 buoi', box.querySelectorAll('.bg-buoi').length === 2);
check('gia goc gach + gia sau uu dai', !!box.querySelector('.bg-buoi s') && /28\.405\.000 đ/.test(box.innerText), box.innerText.slice(0, 300));
check('phan tram uu dai', /−25%/.test(box.innerText) && /−5%/.test(box.innerText));
check('tong sau uu dai', /41\.905\.000 đ/.test(box.querySelector('.bg-tong').innerText));
check('tiet kiem', /Tiết kiệm 5\.995\.000 đ/.test(box.innerText));
check('ban cu thu gon', /1 bản báo giá trước/.test(box.querySelector('.bg-ban-cu summary').innerText) && /45\.000\.000 đ/.test(box.querySelector('.bg-ban-cu').textContent));
check('chi tiet ekip trong details', !!box.querySelector('.bg-buoi details') && /1 Quay phim/.test(box.querySelector('.bg-buoi details').textContent));
check('ghi chu', /Phụ phí 3\.000\.000 đ\/máy/.test(box.innerText));

/* 3. Hạn ưu đãi */
check('han con', B.trangThaiHan('2026-10-20', '2026-10-15') === 'con');
check('han sap (3 ngay)', B.trangThaiHan('2026-10-18', '2026-10-15') === 'sap');
check('han hom nay la sap', B.trangThaiHan('2026-10-15', '2026-10-15') === 'sap');
check('han het', B.trangThaiHan('2026-10-14', '2026-10-15') === 'het');
check('khong han', B.trangThaiHan(null, '2026-10-15') === null);
box.innerHTML = B.veBaoGia({ baoGia: { x: bg({ taoLuc: 't', hanUuDai: '2026-10-17' }) } }, '2026-10-15');
check('han sap: class + con n ngay', !!box.querySelector('.bg-han.sap') && /còn 2 ngày/.test(box.innerText), box.innerText);
box.innerHTML = B.veBaoGia({ baoGia: { x: bg({ taoLuc: 't', hanUuDai: '2026-10-10' }) } }, '2026-10-15');
check('han het: da het han', !!box.querySelector('.bg-han.het') && /đã hết hạn/.test(box.innerText));

/* 4. Dữ liệu Firebase thiếu mảng rỗng / null không làm vỡ */
box.innerHTML = B.veBaoGia({ baoGia: { x: { tieuDe: 'T', tenKhach: 'K', buoi: [{ loai: 'cuoi', ten: 'Cưới', goi: 'G', giaGoc: 1000, uuDaiPhanTram: 0, giaSauUuDai: 1000 }], tongGiaGoc: 1000, tongSauUuDai: 1000, tietKiem: 0, taoLuc: 't' } } }, '2026-10-15');
check('thieu truong khong vo', box.querySelectorAll('.bg-buoi').length === 1 && !/undefined|NaN/.test(box.innerText), box.innerText);

/* 5. Chống XSS */
box.innerHTML = B.veBaoGia({ baoGia: { x: bg({ taoLuc: 't', tieuDe: XSS, ghiChu: [XSS], buoi: [buoi({ goi: XSS, ekip: [XSS] })] }) } }, '2026-10-15');
check('khong tao the img', !box.querySelector('img'), box.innerHTML.slice(0, 300));
check('van hien nguyen van', box.innerText.includes('<img src=x'));
check('khong co ma nao chay', window.__bi === undefined);

window.__ketQua = ket;
</script>
</body>
```

- [ ] **Step 2: Thêm ca đề xuất nguồn báo giá vào `test/ho-so-ai.test.html`** — ngay trước dòng `check('khong co ma nao chay', window.__bi === undefined);`:

```js
/* 12. Đề xuất do server sinh từ báo giá: không trích dẫn, lý do "Theo báo giá ngày ..." */
box.innerHTML = W.veTheDeXuat({ id: 'f_bg1', leadId: 'L1', type: 'field', field: 'revenueExpected', oldValue: 0, newValue: 41905000,
  reason: 'Theo báo giá ngày 15/10', evidence: [], nguon: { loai: 'baoGia', baoGiaId: 'bg_x', taoLuc: 't' }, status: 'cho', createdAt: '' }, { id: 'L1', revenueExpected: 0 });
check('de xuat tu bao gia: tieu de', /Doanh thu dự kiến/.test(box.querySelector('.dx-tom').innerText) && /41\.905\.000 đ/.test(box.querySelector('.dx-tom').innerText), box.innerText);
check('de xuat tu bao gia: ly do', /Theo báo giá ngày 15\/10/.test(box.querySelector('.dx-ly-do').textContent));
check('de xuat tu bao gia: khong chip nguon', !box.querySelector('.dx-ly-do .hs-nguon'));
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npm run test:bao-gia-ui` → trang lỗi import / không có `__ketQua`.
Run: `npm run test:ho-so-ui` → PASS sẵn (ca 12 dựa trên code đã có — xác nhận không cần sửa `web/ho-so-ai.js`; nếu FAIL thì sửa `veTheDeXuat` để `chipNguon([])` trả chuỗi rỗng).

- [ ] **Step 4: Cài đặt `web/bao-gia.js`**

```js
// Logic thuần cho khối "Báo giá" trong chi tiết lead (index.html). KHÔNG chạm DOM / Firebase.
// Test: test/bao-gia.test.html. Spec: docs/superpowers/specs/2026-10-15-bao-gia-trong-lead-design.md
// Dữ liệu từ Firebase có thể thiếu mảng rỗng / giá trị null (Firebase bỏ chúng) — luôn đọc qua mang().

export function esc(s){
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const mang = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
export const tien = n => Number(n || 0).toLocaleString('vi-VN').replace(/,/g, '.') + ' đ';
export const ddmm = iso => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;
const ddmmyyyy = iso => `${ddmm(iso)}/${String(iso).slice(0, 4)}`;

export function dsBaoGia(lead){
  return Object.entries((lead && lead.baoGia) || {})
    .map(([id, b]) => ({ ...b, id }))
    .sort((a, b) => String(b.taoLuc || '').localeCompare(String(a.taoLuc || '')));
}
export function baoGiaMoiNhat(lead){ return dsBaoGia(lead)[0] || null; }

const soNgay = (tu, den) => Math.round((Date.parse(den + 'T00:00:00Z') - Date.parse(tu + 'T00:00:00Z')) / 86400000);

/** 'het' đã qua | 'sap' còn 0..3 ngày | 'con' | null không có hạn */
export function trangThaiHan(han, homNay){
  if (!han) return null;
  const n = soNgay(homNay, han);
  if (n < 0) return 'het';
  return n <= 3 ? 'sap' : 'con';
}

function dsChu(tieuDe, ds){
  const items = mang(ds).filter(Boolean);
  return items.length ? `<div class="bg-nhom-nho"><div class="bg-nhan">${esc(tieuDe)}</div><ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
}

function veBuoi(b){
  const uu = Number(b.uuDaiPhanTram) || 0;
  const phu = [b.goi, b.gio, b.soKhach ? `${b.soKhach} khách` : '', b.moTa].filter(Boolean).map(esc).join(' · ');
  const chiTiet = dsChu('Ekip', b.ekip) + dsChu('Sản phẩm', b.sanPham) + dsChu('Quà tặng', b.quaTang);
  return `
    <div class="bg-buoi">
      <div class="bg-buoi-dong">
        <span class="bg-buoi-ten">${esc(b.ten)}${b.ngay ? ` · ${esc(ddmm(b.ngay))}` : ''}</span>
        <span class="bg-gia">${uu ? `<s>${esc(tien(b.giaGoc))}</s> ` : ''}<b>${esc(tien(b.giaSauUuDai))}</b>${uu ? ` <span class="bg-uu">−${esc(uu)}%</span>` : ''}</span>
      </div>
      ${phu ? `<div class="bg-goi">${phu}</div>` : ''}
      ${chiTiet ? `<details class="bg-chi-tiet"><summary>Chi tiết</summary>${chiTiet}</details>` : ''}
    </div>`;
}

export function veBaoGia(lead, homNay){
  const ds = dsBaoGia(lead);
  if (!ds.length) return '';
  const [bg, ...cu] = ds;
  const tt = trangThaiHan(bg.hanUuDai, homNay);
  const han = !tt ? '' : tt === 'het'
    ? `<div class="bg-han het">Ưu đãi đã hết hạn ${esc(ddmmyyyy(bg.hanUuDai))}</div>`
    : `<div class="bg-han ${tt}">Ưu đãi đến ${esc(ddmmyyyy(bg.hanUuDai))}${tt === 'sap' ? ` · còn ${soNgay(homNay, bg.hanUuDai)} ngày` : ''}</div>`;
  const meta = [bg.tenKhach, bg.diaDiem, bg.taoLuc && /^\d{4}-/.test(bg.taoLuc) ? `lưu ${ddmm(bg.taoLuc.slice(0, 10))}` : ''].filter(Boolean).map(esc).join(' · ');
  const ghiChu = mang(bg.ghiChu).filter(Boolean);
  return `
  <div class="bg-the">
    <div class="bg-dau"><div class="bg-tieu-de">${esc(bg.tieuDe)}</div>${meta ? `<div class="bg-meta">${meta}</div>` : ''}</div>
    ${mang(bg.buoi).map(veBuoi).join('')}
    <div class="bg-tong">
      <span class="bg-nhan">Tổng</span>
      ${bg.tietKiem ? `<s>${esc(tien(bg.tongGiaGoc))}</s>` : ''}
      <b>${esc(tien(bg.tongSauUuDai))}</b>
      ${bg.tietKiem ? `<span class="bg-tiet-kiem">Tiết kiệm ${esc(tien(bg.tietKiem))}</span>` : ''}
    </div>
    ${han}
    ${ghiChu.length ? `<ul class="bg-ghi-chu">${ghiChu.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>
  ${cu.length ? `<details class="bg-ban-cu"><summary>${cu.length} bản báo giá trước</summary>${cu.map((b, i) =>
    `<div class="bg-cu-dong">Lần ${cu.length - i} · ${b.taoLuc && /^\d{4}-/.test(b.taoLuc) ? esc(ddmm(b.taoLuc.slice(0, 10))) : '—'} · ${esc(tien(b.tongSauUuDai))}</div>`).join('')}</details>` : ''}`;
}
```

- [ ] **Step 5: Chạy test**

Run: `npm run test:bao-gia-ui` → `PASS`. Run: `npm run test:ho-so-ui` → `PASS`.

- [ ] **Step 6: Commit**

```bash
git add web/bao-gia.js test/bao-gia.test.html test/ho-so-ai.test.html
git commit -m "Bao gia: module ve khoi bao gia (escape, han uu dai, ban cu) va test

Co-Authored-By: <model thuc hien>"
```

---

### Task 4: Nối khối "Báo giá" vào app + tài liệu

**Files:**
- Modify: `index.html` — module script (sau khối nạp `HoSoAI`, khoảng dòng 158), khối trong `openLead` (ngay **trước** `<div class="detail-block block-package" data-tab-of="thongtin">`, khoảng dòng 4159), CSS (cuối khối CSS hồ sơ AI, ngay trước dòng `.zalo-row.zalo-flash ...`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `window.BaoGia` (Task 3): `veBaoGia(lead, homNay)`, `baoGiaMoiNhat(lead)`; sẵn có: `toggleKhoiChiTiet`, `todayISO`.

- [ ] **Step 1: Nạp module** — ngay sau khối `<script type="module">` nạp `HoSoAI`:

```html
<script type="module">
  // Khối "Báo giá" trong chi tiết lead — test ở test/bao-gia.test.html. Nạp lỗi thì chỉ mất khối này.
  import * as BaoGia from './web/bao-gia.js';
  window.BaoGia = BaoGia;
</script>
```

- [ ] **Step 2: Khối trong `openLead`** — ngay trước dòng `<div class="detail-block block-package" data-tab-of="thongtin">`:

```html
        <div class="detail-block block-bao-gia" data-tab-of="thongtin" ${window.BaoGia && BaoGia.baoGiaMoiNhat(lead) ? '' : 'style="display:none"'}>
          <div class="block-head">
            <h3 class="block-title">Báo giá</h3>
            <button type="button" class="block-collapse" aria-expanded="true" onclick="toggleKhoiChiTiet(this)">Thu gọn ▴</button>
          </div>
          <div class="block-content">${window.BaoGia ? BaoGia.veBaoGia(lead, todayISO()) : ''}</div>
        </div>
```

- [ ] **Step 3: CSS** — ngay trước dòng `.zalo-row.zalo-flash .zalo-bubble{...}`:

```css
  /* Báo giá trong lead */
  .bg-the{border:1px solid var(--border); border-radius:12px; padding:12px 14px; background:var(--surface-2);}
  .bg-tieu-de{font-size:15px; font-weight:600;}
  .bg-meta{font-size:12.5px; color:var(--ink-faint); margin-top:2px;}
  .bg-buoi{padding:10px 0; border-top:1px solid var(--border); margin-top:10px;}
  .bg-buoi-dong{display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;}
  .bg-buoi-ten{font-weight:600; font-size:14px;}
  .bg-gia{font-size:14px; white-space:nowrap;}
  .bg-gia s, .bg-tong s{color:var(--ink-faint); font-size:12.5px;}
  .bg-gia b{font-weight:700;}
  .bg-uu{font-size:12px; color:var(--green-700); background:var(--green-50); border-radius:6px; padding:1px 6px;}
  .bg-goi{font-size:13px; color:var(--ink-faint); margin-top:3px;}
  .bg-chi-tiet{margin-top:6px; font-size:13px;}
  .bg-chi-tiet summary, .bg-ban-cu summary{cursor:pointer; color:var(--ink-faint); font-size:12.5px;}
  .bg-nhom-nho{margin-top:6px;}
  .bg-nhom-nho ul, .bg-ghi-chu{margin:2px 0 0 18px; padding:0;}
  .bg-nhan{font-size:12px; color:var(--ink-faint);}
  .bg-tong{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-top:10px; padding:10px 12px; border-radius:10px; background:var(--green-50);}
  .bg-tong b{font-size:17px; font-weight:700; color:var(--green-700);}
  .bg-tiet-kiem{margin-left:auto; font-size:12.5px; color:var(--green-700);}
  .bg-han{margin-top:8px; font-size:13px; color:var(--ink-faint);}
  .bg-han.sap{color:var(--blush); font-weight:600;}
  .bg-han.het{text-decoration:line-through;}
  .bg-ghi-chu{margin-top:8px; font-size:13px; color:var(--ink-faint);}
  .bg-ban-cu{margin-top:10px;}
  .bg-cu-dong{font-size:13px; padding:4px 0; color:var(--ink-faint);}
```

- [ ] **Step 4: Kiểm tra cú pháp + test liên quan**

Run (kiểm tra cú pháp các `<script>` cổ điển trong index.html):

```bash
node -e 'const s=require("fs").readFileSync("index.html","utf8");const re=/<script(?![^>]*type="module")(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;const fs=require("fs"),cp=require("child_process"),os=require("os"),p=require("path");while((m=re.exec(s))){const f=p.join(os.tmpdir(),"chk"+(i++)+".js");fs.writeFileSync(f,m[1]);cp.execFileSync(process.execPath,["--check",f]);}console.log("ok",i)'
```

Expected: `ok 2`. Run: `npm run test:dongbo`, `npm run test:crm-chat`, `npm run test:bao-gia-ui` → `PASS`.

- [ ] **Step 5: `CLAUDE.md`** — trong mục "Cấu trúc lớn", sau gạch đầu dòng `web/ho-so-ai.js`, thêm:

```markdown
- **`web/bao-gia.js`** — logic thuần khối "Báo giá" trong chi tiết lead. Báo giá Trân làm trên claude.ai được lưu qua tool MCP `save_quote` vào **chính lead** (`leads/<id>/baoGia/<baoGiaId>`, bản mới nhất = `taoLuc` lớn nhất). Server kiểm tra phép tính và tự sinh đề xuất (doanh thu, ngày cưới, gói, việc nhắc hạn ưu đãi) vào hàng chờ — `save_quote` không sửa ô nào của lead.
```

Trong khối lệnh test, thêm:

```bash
npm run test:bao-gia     # test/bao-gia.test.ts — hàm thuần báo giá (phép tính, khớp gói, đề xuất), KHÔNG chạm Firebase
npm run test:mcp-bao-gia # test/mcp-bao-gia.test.ts — tool save_quote (sandbox crmDataTest + aiDataTest)
npm run test:bao-gia-ui  # test/bao-gia.test.html — vẽ khối Báo giá, chống XSS (Chrome ngầm)
```

- [ ] **Step 6: Chạy toàn bộ test liên quan**

```bash
npm run test:bao-gia
npm run test:mcp-bao-gia
npm run test:bao-gia-ui
npm run test:ho-so
npm run test:mcp-ho-so
npm run test:ho-so-ui
npm test
npm run test:dongbo
```

Expected: tất cả `PASS` (flaky mạng → chạy lại).

- [ ] **Step 7: Commit**

```bash
git add index.html CLAUDE.md
git commit -m "Bao gia: khoi Bao gia trong chi tiet lead, cap nhat CLAUDE.md

Co-Authored-By: <model thuc hien>"
```

- [ ] **Step 8: Kiểm tra tay (controller / Trường)** — trên bản demo dữ liệu giả hoặc tài khoản test: lưu báo giá qua claude.ai (connector đã kết nối lại để thấy tool `save_quote`), mở lead → tab Thông tin thấy khối Báo giá; mở "Claude đề xuất" thấy 4 đề xuất "Theo báo giá ngày …"; duyệt doanh thu → ô Doanh thu dự kiến đổi.
