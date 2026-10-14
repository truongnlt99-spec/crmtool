# View "Danh sách" (bảng lead kiểu Excel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm view "Danh sách" vào app CRM: bảng lead kiểu Excel có lọc/sắp xếp theo cột, ẩn/hiện + kéo độ rộng cột, sửa trong ô, dòng tổng và xuất `.xlsx`.

**Architecture:** Logic thuần (định nghĩa cột, lọc, sắp xếp, tổng, dòng xuất, đọc cài đặt) nằm ở ES module `web/bang-lead.js`, test bằng Node không chạm Firebase. Giao diện (vẽ bảng, menu lọc, sửa ô, kéo cột, xuất file) nằm trong `index.html`, gọi lại các hàm ghi dữ liệu sẵn có (`onFieldChange`, `moveLeadToStage`) nên lưu Firebase / hộp Won-Lost / nhật ký giữ nguyên. SheetJS chỉ được nạp khi bấm "Xuất Excel".

**Tech Stack:** JS thuần (không framework), Node ≥20 chạy thẳng `.ts` để test, SheetJS 0.20.3 từ `cdn.sheetjs.com` (nạp động).

**Spec:** `docs/superpowers/specs/2026-10-14-bang-danh-sach-lead-design.md`

## Global Constraints

- Không thêm trường dữ liệu lead mới; không đổi `api/mcp.ts`, `xem.html`, Firebase rules.
- File logic thuần ở `web/bang-lead.js` (KHÔNG đặt trong `lib/`), nạp bằng `<script type="module">` giống `zalo-map.js`, gán `window.BangLead`.
- Mọi chữ lấy từ dữ liệu khi chèn vào HTML phải qua `esc()`.
- Màu chỉ dùng token CSS sẵn có (`--surface`, `--well`, `--border`, `--text`, `--text-2`, `--text-3`, `--primary`, `--primary-soft`, `--sh-md`, `--r-md`…) để tự hợp dark mode.
- Cài đặt bảng lưu `localStorage` khoá `bangLeadCaiDat`, mọi đọc/ghi bọc `try/catch`.
- SheetJS: `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`, tên file `Danh-sach-lead-YYYY-MM-DD.xlsx`.
- Báo lỗi cho người dùng bằng `alert()` (app hiện không có toast — spec ghi "toast", dùng `alert` cho đồng bộ với phần còn lại của app).
- Điện thoại (≤760px): mục "Danh sách" KHÔNG nằm trên thanh tab dưới đáy mà trong tấm "Khác".
- Commit message tiếng Việt KHÔNG dấu, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Làm trên nhánh `bang-danh-sach-lead` (đã tạo, đã có commit spec).

## Review Focus

1. Lead cũ thiếu trường (không có `leadType`, `todos`, `notesList`, `revenueActual`, `deadline`…) → bảng vẫn vẽ, ô hiện "—", lọc/sắp xếp không văng lỗi. (Test ở Task 1.)
2. Đổi Giai đoạn sang Won/Lost trong ô rồi bấm Huỷ ở hộp xác nhận → ô trở về giai đoạn cũ, không ghi gì. (Kiểm tra tay ở Task 5.)
3. Dữ liệu đổi từ máy khác/Claude trong lúc đang gõ dở một ô → không mất chữ đang gõ (hoãn vẽ lại). (Task 5 — cờ `bangDangSua`; `uiIsBusy()` sẵn có đã hoãn áp dữ liệu từ xa khi đang focus ô nhập.)
4. `localStorage` chứa cài đặt hỏng / từ phiên bản khác (khoá cột không tồn tại, kiểu sai) → bảng dùng mặc định, không trắng trang. (Test ở Task 2.)
5. Xuất Excel khi đang lọc/sắp xếp/ẩn cột → file đúng các dòng, thứ tự và cột đang hiện; tiền là số, ngày là ngày. (Test `dongXuat` ở Task 2 + kiểm tra tay ở Task 6.)

---

## File Structure

- **Create** `web/bang-lead.js` — logic thuần: `COT`, `TRANG_THAI`, `boDau`, `layGiaTri`, `locLead`, `sapXep`, `tinhTong`, `giaTriDuyNhat`, `soCotDangLoc`, `dongXuat`, `macDinhCaiDat`, `docCaiDat`.
- **Create** `test/bang-lead.test.ts` — test Node cho module trên.
- **Modify** `package.json` — thêm script `test:bang`.
- **Modify** `index.html` — nạp module, CSS bảng, nav + section + mục "Khác", `VIEWS.list`, khối JS `RENDER: DANH SÁCH`, móc vào `renderAll`, `onSearch`, `onFieldChange`.

---

### Task 1: Module logic thuần — cột, lọc, sắp xếp, tổng

**Files:**
- Create: `web/bang-lead.js`
- Create: `test/bang-lead.test.ts`
- Modify: `package.json` (thêm `"test:bang": "node test/bang-lead.test.ts"` ngay sau dòng `"test:zalo-tinh"`)

**Interfaces:**
- Produces (dùng ở Task 2–6):
  - `ctx` = `{ leadStatus(lead)→{type,label}, leadTypeOf(lead)→string, stageName(id)→string, coZalo(lead)→bool }`
  - `COT: Array<{ khoa, tieuDe, kieu:'chu'|'chon'|'ngay'|'thang'|'so', rong:number, sua?:'chu'|'ngay'|'thang'|'so'|'chon'|'giaidoan', truong?:string, suaKhi?(lead)→bool, lay(lead, ctx)→string|number|null }>`
  - `TRANG_THAI: string[]` = `['Trễ hẹn','Hôm nay','Còn hạn','Chưa hẹn','Won','Lost']`
  - `boDau(s)→string`, `layGiaTri(khoa, lead, ctx)`, `locLead(leads, boLoc, tim, ctx)→lead[]`, `sapXep(leads, {khoa, chieu:'tang'|'giam'}, ctx)→lead[]`, `tinhTong(leads)→{soLead, duKien, thucTe}`, `giaTriDuyNhat(leads, khoa, ctx)→string[]`, `soCotDangLoc(boLoc)→number`
  - `boLoc` = `{ [khoa]: {chua:string} | {chon:string[]} | {tu?:string|number, den?:string|number} }`

- [ ] **Step 1: Viết test thất bại** — tạo `test/bang-lead.test.ts`:

```ts
/**
 * Test hàm thuần của bảng Danh sách lead (web/bang-lead.js). Không chạm mạng/database.
 */
import * as B from '../web/bang-lead.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};
const ids = (ls: any[]) => ls.map(l => l.id).join(',');

const ctx = {
  leadStatus: (l: any) => {
    if (l.stage === 'won') return { type: 'won', label: 'Đã chốt ✓' };
    if (l.stage === 'lost') return { type: 'lost', label: 'Đã đóng' };
    if (!l.deadline) return { type: 'gray', label: 'Chưa hẹn' };
    if (l.deadline < '2026-10-14') return { type: 'red', label: 'Trễ' };
    if (l.deadline === '2026-10-14') return { type: 'green', label: 'Hôm nay' };
    return { type: 'gray', label: 'Còn' };
  },
  leadTypeOf: (l: any) => l.leadType || 'Lead công ty',
  stageName: (id: string) => ({ leadin: 'Lead in', baogia: 'Báo giá', won: 'Won', lost: 'Lost' } as any)[id] || id || '',
  coZalo: (l: any) => l.id === 'A',
};

const LEADS = [
  { id: 'A', name: 'Nguyễn Thị Hằng', phone: '0901', package: 'Unique', stage: 'leadin', deadline: '2026-10-10',
    weddingDate: '2026-12-01', revenueExpected: 30000000, createdAt: '2026-09-01', tags: ['VIP'],
    todos: [{ done: true }, { done: false }], notesList: [{ text: 'cũ' }, { text: 'mới nhất' }] },
  { id: 'B', name: 'Trần Minh', package: 'Standard', stage: 'won', revenueExpected: 20000000, revenueActual: 25000000,
    weddingDate: '2026-11-15', createdAt: '2026-09-05', wonAt: '2026-10-01' },
  { id: 'C', name: 'Lê Hà', package: 'Unique', stage: 'baogia', deadline: '2026-10-14', createdAt: '2026-08-20',
    expectedCloseMonth: '2026-11', leadType: 'Lead salehunt' },
  // lead cũ thiếu gần hết trường
  { id: 'D', name: 'Cũ', stage: 'lost', lostReason: 'Giá cao', createdAt: '2026-07-01' },
];

console.log('\n>> boDau');
check('bo dau + chu thuong', B.boDau('Nguyễn Đức HẰNG') === 'nguyen duc hang');
check('null -> rong', B.boDau(null) === '' && B.boDau(undefined) === '');

console.log('\n>> COT');
check('cot dau la name', B.COT[0].khoa === 'name');
check('khoa khong trung', new Set(B.COT.map((c: any) => c.khoa)).size === B.COT.length);
check('du 20 cot', B.COT.length === 20, String(B.COT.length));

console.log('\n>> layGiaTri');
check('status tre', B.layGiaTri('status', LEADS[0], ctx) === 'Trễ hẹn');
check('status hom nay', B.layGiaTri('status', LEADS[2], ctx) === 'Hôm nay');
check('status won/lost', B.layGiaTri('status', LEADS[1], ctx) === 'Won' && B.layGiaTri('status', LEADS[3], ctx) === 'Lost');
check('status chua hen', B.layGiaTri('status', { stage: 'leadin' }, ctx) === 'Chưa hẹn');
check('status con han', B.layGiaTri('status', { stage: 'leadin', deadline: '2026-12-01' }, ctx) === 'Còn hạn');
check('todos = so viec chua xong', B.layGiaTri('todos', LEADS[0], ctx) === 1);
check('todos thieu -> null', B.layGiaTri('todos', LEADS[3], ctx) === null);
check('lastNote = phan tu cuoi', B.layGiaTri('lastNote', LEADS[0], ctx) === 'mới nhất');
check('tags noi bang dau phay', B.layGiaTri('tags', LEADS[0], ctx) === 'VIP');
check('tien thieu -> null', B.layGiaTri('revenueActual', LEADS[0], ctx) === null);
check('tien 0 van la 0', B.layGiaTri('revenueExpected', { revenueExpected: 0 }, ctx) === 0);
check('leadType mac dinh', B.layGiaTri('leadType', LEADS[0], ctx) === 'Lead công ty');
check('stage -> ten', B.layGiaTri('stage', LEADS[2], ctx) === 'Báo giá');
check('zalo co/khong', B.layGiaTri('zalo', LEADS[0], ctx) === 'Có' && B.layGiaTri('zalo', LEADS[1], ctx) === 'Không');
check('ngay thieu -> rong', B.layGiaTri('weddingDate', LEADS[3], ctx) === '');

console.log('\n>> locLead');
check('khong loc -> giu het', ids(B.locLead(LEADS, {}, '', ctx)) === 'A,B,C,D');
check('tim ten khong dau', ids(B.locLead(LEADS, {}, 'hang', ctx)) === 'A');
check('loc chu chua', ids(B.locLead(LEADS, { phone: { chua: '090' } }, '', ctx)) === 'A');
check('loc chu rong -> bo qua', ids(B.locLead(LEADS, { phone: { chua: '  ' } }, '', ctx)) === 'A,B,C,D');
check('loc chon', ids(B.locLead(LEADS, { package: { chon: ['Unique'] } }, '', ctx)) === 'A,C');
check('loc chon gia tri rong', ids(B.locLead(LEADS, { package: { chon: [''] } }, '', ctx)) === 'D');
check('loc chon mang rong -> 0 dong', B.locLead(LEADS, { package: { chon: [] } }, '', ctx).length === 0);
check('loc khoang ngay 2 dau', ids(B.locLead(LEADS, { weddingDate: { tu: '2026-11-01', den: '2026-11-30' } }, '', ctx)) === 'B');
check('loc khoang ngay 1 dau, bo dong rong', ids(B.locLead(LEADS, { weddingDate: { tu: '2026-11-20' } }, '', ctx)) === 'A');
check('loc khoang so', ids(B.locLead(LEADS, { revenueExpected: { tu: 25000000 } }, '', ctx)) === 'A');
check('loc khoang thang', ids(B.locLead(LEADS, { expectedCloseMonth: { den: '2026-11' } }, '', ctx)) === 'C');
check('khoang trong ca 2 dau -> bo qua', ids(B.locLead(LEADS, { weddingDate: { tu: '', den: '' } }, '', ctx)) === 'A,B,C,D');
check('khoa la -> bo qua', ids(B.locLead(LEADS, { khongCo: { chua: 'x' } }, '', ctx)) === 'A,B,C,D');
check('ket hop tim + loc', ids(B.locLead(LEADS, { package: { chon: ['Unique'] } }, 'le', ctx)) === 'C');

console.log('\n>> sapXep');
check('ngay tang', ids(B.sapXep(LEADS, { khoa: 'createdAt', chieu: 'tang' }, ctx)) === 'D,C,A,B');
check('ngay giam', ids(B.sapXep(LEADS, { khoa: 'createdAt', chieu: 'giam' }, ctx)) === 'B,A,C,D');
check('rong xuong cuoi khi tang', ids(B.sapXep(LEADS, { khoa: 'weddingDate', chieu: 'tang' }, ctx)) === 'B,A,C,D');
check('rong xuong cuoi khi giam', ids(B.sapXep(LEADS, { khoa: 'revenueExpected', chieu: 'giam' }, ctx)) === 'A,B,C,D');
check('chu theo tieng Viet', ids(B.sapXep(LEADS, { khoa: 'name', chieu: 'tang' }, ctx)) === 'D,C,A,B');
check('trang thai theo thu tu muc do', ids(B.sapXep(LEADS, { khoa: 'status', chieu: 'tang' }, ctx)) === 'A,C,B,D');
check('on dinh khi bang nhau', ids(B.sapXep(LEADS, { khoa: 'package', chieu: 'tang' }, ctx)) === 'B,A,C,D');
check('khong doi mang goc', ids(LEADS) === 'A,B,C,D');
check('khoa la -> giu nguyen', ids(B.sapXep(LEADS, { khoa: 'xyz', chieu: 'tang' }, ctx)) === 'A,B,C,D');

console.log('\n>> tinhTong / giaTriDuyNhat / soCotDangLoc');
const t = B.tinhTong(LEADS);
check('tong', t.soLead === 4 && t.duKien === 50000000 && t.thucTe === 25000000, JSON.stringify(t));
check('tong rong', JSON.stringify(B.tinhTong([])) === JSON.stringify({ soLead: 0, duKien: 0, thucTe: 0 }));
check('gia tri duy nhat (co rong, sap xep)', JSON.stringify(B.giaTriDuyNhat(LEADS, 'package', ctx)) === JSON.stringify(['', 'Standard', 'Unique']));
check('gia tri duy nhat status theo thu tu', JSON.stringify(B.giaTriDuyNhat(LEADS, 'status', ctx)) === JSON.stringify(['Trễ hẹn', 'Hôm nay', 'Won', 'Lost']));
check('dem cot dang loc', B.soCotDangLoc({ a: { chua: 'x' }, b: { chua: ' ' }, c: { chon: [] }, d: { tu: '', den: '' }, e: { den: 5 } }) === 3);

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
```

Lưu ý dòng `'rong xuong cuoi khi tang'`: weddingDate tăng → B (2026-11-15), A (2026-12-01), rồi C, D rỗng giữ thứ tự gốc → `B,A,C,D`.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `node test/bang-lead.test.ts`
Expected: lỗi `ERR_MODULE_NOT_FOUND` cho `web/bang-lead.js`.

- [ ] **Step 3: Viết `web/bang-lead.js`** (phần cột/lọc/sắp xếp/tổng):

```js
// Logic thuần cho view "Danh sách" (bảng lead kiểu Excel) trong index.html.
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/bang-lead.test.ts).
// Những gì phụ thuộc app (trạng thái hẹn, tên giai đoạn, Zalo...) truyền vào qua `ctx`:
//   { leadStatus(lead), leadTypeOf(lead), stageName(id), coZalo(lead) }

export const TRANG_THAI = ['Trễ hẹn', 'Hôm nay', 'Còn hạn', 'Chưa hẹn', 'Won', 'Lost'];

const ngay = v => (v ? String(v).slice(0, 10) : '');
const so = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const chuaXongWon = l => l.stage !== 'won' && l.stage !== 'lost';

export function boDau(s){
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

function nhomTrangThai(lead, ctx){
  const s = ctx.leadStatus(lead) || {};
  if (s.type === 'won') return 'Won';
  if (s.type === 'lost') return 'Lost';
  if (s.type === 'red') return 'Trễ hẹn';
  if (s.type === 'green') return 'Hôm nay';
  return lead.deadline ? 'Còn hạn' : 'Chưa hẹn';
}

// `truong` = tên trường lưu trong lead khi sửa trong ô (mặc định = khoa).
export const COT = [
  { khoa:'name',               tieuDe:'Tên',               kieu:'chu',   rong:200, sua:'chu',      lay: l => l.name || '' },
  { khoa:'phone',              tieuDe:'SĐT',               kieu:'chu',   rong:120, sua:'chu',      lay: l => l.phone || '' },
  { khoa:'facebook',           tieuDe:'Facebook',          kieu:'chu',   rong:170, sua:'chu',      lay: l => l.facebook || '' },
  { khoa:'weddingDate',        tieuDe:'Ngày cưới',         kieu:'ngay',  rong:110, sua:'ngay',     lay: l => ngay(l.weddingDate) },
  { khoa:'package',            tieuDe:'Gói',               kieu:'chon',  rong:130, sua:'chon',     lay: l => l.package || '' },
  { khoa:'leadType',           tieuDe:'Loại lead',         kieu:'chon',  rong:130, sua:'chon',     lay: (l, c) => c.leadTypeOf(l) },
  { khoa:'stage',              tieuDe:'Giai đoạn',         kieu:'chon',  rong:140, sua:'giaidoan', lay: (l, c) => c.stageName(l.stage) },
  { khoa:'status',             tieuDe:'Trạng thái hẹn',    kieu:'chon',  rong:130,                 lay: (l, c) => nhomTrangThai(l, c) },
  { khoa:'deadline',           tieuDe:'Deadline',          kieu:'ngay',  rong:110, sua:'ngay', suaKhi: chuaXongWon, lay: l => ngay(l.deadline) },
  { khoa:'revenueExpected',    tieuDe:'DT dự kiến',        kieu:'so',    rong:130, sua:'so',       lay: l => so(l.revenueExpected) },
  { khoa:'revenueActual',      tieuDe:'DT thực tế',        kieu:'so',    rong:130, sua:'so', suaKhi: l => l.stage === 'won', lay: l => so(l.revenueActual) },
  { khoa:'expectedCloseMonth', tieuDe:'Tháng dự kiến chốt', kieu:'thang', rong:120, sua:'thang',   lay: l => (l.expectedCloseMonth ? String(l.expectedCloseMonth).slice(0, 7) : '') },
  { khoa:'createdAt',          tieuDe:'Ngày tạo',          kieu:'ngay',  rong:110,                 lay: l => ngay(l.createdAt) },
  { khoa:'wonAt',              tieuDe:'Ngày Won',          kieu:'ngay',  rong:110,                 lay: l => ngay(l.wonAt) },
  { khoa:'lostAt',             tieuDe:'Ngày Lost',         kieu:'ngay',  rong:110,                 lay: l => ngay(l.lostAt) },
  { khoa:'lostReason',         tieuDe:'Lý do Lost',        kieu:'chon',  rong:150,                 lay: l => l.lostReason || '' },
  { khoa:'tags',               tieuDe:'Tag',               kieu:'chu',   rong:130,                 lay: l => (l.tags || []).join(', ') },
  { khoa:'todos',              tieuDe:'Việc chưa xong',    kieu:'so',    rong:110,                 lay: l => (l.todos && l.todos.length ? l.todos.filter(t => !t.done).length : null) },
  { khoa:'lastNote',           tieuDe:'Ghi chú gần nhất',  kieu:'chu',   rong:220,                 lay: l => { const n = l.notesList || []; return n.length ? String(n[n.length - 1].text || '') : ''; } },
  { khoa:'zalo',               tieuDe:'Zalo',              kieu:'chon',  rong:80,                  lay: (l, c) => (c.coZalo(l) ? 'Có' : 'Không') },
];
const COT_MAP = Object.fromEntries(COT.map(c => [c.khoa, c]));

export function layGiaTri(khoa, lead, ctx){
  const c = COT_MAP[khoa];
  return c ? c.lay(lead, ctx) : null;
}

const rong = v => v === null || v === undefined || v === '';
const coGiaTri = v => !rong(v) && !(typeof v === 'string' && !v.trim());

function khopMotCot(cot, dk, lead, ctx){
  const v = cot.lay(lead, ctx);
  if ('chua' in dk) return !coGiaTri(dk.chua) || boDau(v).includes(boDau(dk.chua));
  if ('chon' in dk) return Array.isArray(dk.chon) && dk.chon.includes(rong(v) ? '' : String(v));
  const coTu = coGiaTri(dk.tu), coDen = coGiaTri(dk.den);
  if (!coTu && !coDen) return true;
  if (rong(v)) return false;
  const ss = cot.kieu === 'so' ? Number : String;
  if (coTu && ss(v) < ss(dk.tu)) return false;
  if (coDen && ss(v) > ss(dk.den)) return false;
  return true;
}

export function locLead(leads, boLoc, tim, ctx){
  const q = boDau(tim);
  const dieuKien = Object.entries(boLoc || {}).filter(([k, dk]) => COT_MAP[k] && dk && typeof dk === 'object');
  return leads.filter(l => {
    if (q && !boDau(l.name).includes(q)) return false;
    return dieuKien.every(([k, dk]) => khopMotCot(COT_MAP[k], dk, l, ctx));
  });
}

function giaTriSapXep(cot, lead, ctx){
  const v = cot.lay(lead, ctx);
  if (cot.khoa === 'status') return TRANG_THAI.indexOf(v);
  return v;
}

export function sapXep(leads, sx, ctx){
  const cot = sx && COT_MAP[sx.khoa];
  if (!cot) return leads.slice();
  const dau = sx.chieu === 'giam' ? -1 : 1;
  return leads
    .map((l, i) => ({ l, i, v: giaTriSapXep(cot, l, ctx) }))
    .sort((a, b) => {
      const ra = rong(a.v), rb = rong(b.v);
      if (ra || rb) return ra === rb ? a.i - b.i : (ra ? 1 : -1);   // rỗng luôn xuống cuối
      const d = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), 'vi', { sensitivity: 'base' });
      return d ? d * dau : a.i - b.i;
    })
    .map(x => x.l);
}

export function tinhTong(leads){
  return leads.reduce((t, l) => ({
    soLead: t.soLead + 1,
    duKien: t.duKien + (Number(l.revenueExpected) || 0),
    thucTe: t.thucTe + (Number(l.revenueActual) || 0),
  }), { soLead: 0, duKien: 0, thucTe: 0 });
}

// Danh sách giá trị cho bộ lọc tick chọn. '' = "(Trống)". Trạng thái theo thứ tự mức độ.
export function giaTriDuyNhat(leads, khoa, ctx){
  const cot = COT_MAP[khoa];
  if (!cot) return [];
  const set = new Set(leads.map(l => { const v = cot.lay(l, ctx); return rong(v) ? '' : String(v); }));
  const ds = [...set];
  if (khoa === 'status') return TRANG_THAI.filter(t => set.has(t));
  return ds.sort((a, b) => a.localeCompare(b, 'vi'));
}

export function soCotDangLoc(boLoc){
  return Object.values(boLoc || {}).filter(dk => {
    if (!dk || typeof dk !== 'object') return false;
    if ('chua' in dk) return coGiaTri(dk.chua);
    if ('chon' in dk) return Array.isArray(dk.chon);
    return coGiaTri(dk.tu) || coGiaTri(dk.den);
  }).length;
}
```

- [ ] **Step 4: Thêm script vào `package.json`** — sau dòng `"test:zalo-tinh": "node test/zalo-ext-static.test.ts",` thêm:

```json
    "test:bang": "node test/bang-lead.test.ts",
```

- [ ] **Step 5: Chạy test, xác nhận qua**

Run: `npm run test:bang`
Expected: dòng cuối `N OK, 0 FAIL`, exit code 0. Nếu một kỳ vọng thứ tự sai, đọc lại dữ liệu `LEADS` và sửa **code** nếu code sai quy tắc spec (rỗng xuống cuối, ổn định), chỉ sửa test nếu chính kỳ vọng tính sai.

- [ ] **Step 6: Commit**

```bash
git add web/bang-lead.js test/bang-lead.test.ts package.json
git commit -m "Them logic thuan cho bang Danh sach lead (loc, sap xep, tong)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Module logic thuần — dòng xuất Excel và cài đặt bảng

**Files:**
- Modify: `web/bang-lead.js` (thêm vào cuối file)
- Modify: `test/bang-lead.test.ts` (thêm trước dòng `console.log(\`\n${pass} OK`)

**Interfaces:**
- Consumes: `COT`, `COT_MAP`, `layGiaTri` từ Task 1.
- Produces:
  - `dongXuat(leads, khoaHien:string[], ctx) → { tieuDe:string[], kieu:string[], dong:any[][] }` — `kieu[i]` ∈ `'chu'|'so'|'ngay'|'thang'`; ô ngày/tháng là `Date` (giờ địa phương, 00:00), tiền là `number`, rỗng là `null`; cột `todos` xuất chữ `"x/y"` với kieu `'chu'`.
  - `MAC_DINH_AN = ['createdAt','wonAt','lostAt','lostReason']`
  - `macDinhCaiDat() → { an:string[], rong:{[khoa]:number}, sapXep:{khoa,chieu}, loc:{} }`
  - `docCaiDat(chuoi:string|null) → caiDat` (luôn hợp lệ)

- [ ] **Step 1: Viết test thất bại** — thêm vào `test/bang-lead.test.ts` trước dòng tổng kết:

```ts
console.log('\n>> dongXuat');
const x = B.dongXuat([LEADS[0], LEADS[3]], ['name', 'weddingDate', 'expectedCloseMonth', 'revenueExpected', 'stage', 'todos', 'status'], ctx);
check('tieu de theo cot', JSON.stringify(x.tieuDe) === JSON.stringify(['Tên', 'Ngày cưới', 'Tháng dự kiến chốt', 'DT dự kiến', 'Giai đoạn', 'Việc chưa xong', 'Trạng thái hẹn']));
check('kieu theo cot, todos la chu', JSON.stringify(x.kieu) === JSON.stringify(['chu', 'ngay', 'thang', 'so', 'chu', 'chu', 'chu']), JSON.stringify(x.kieu));
const d0 = x.dong[0];
check('ngay la Date dia phuong', d0[1] instanceof Date && d0[1].getFullYear() === 2026 && d0[1].getMonth() === 11 && d0[1].getDate() === 1 && d0[1].getHours() === 0);
check('thang rong -> null', x.dong[0][2] === null);
check('tien la so', d0[3] === 30000000);
check('giai doan la ten', d0[4] === 'Lead in');
check('todos x/y', d0[5] === '1/2');
check('trang thai la chu', d0[6] === 'Trễ hẹn');
const d1 = x.dong[1];
check('rong -> null', d1[1] === null && d1[3] === null && d1[5] === null);
const xc = B.dongXuat([LEADS[2]], ['expectedCloseMonth'], ctx);
check('thang 2026-11 -> 1/11/2026', xc.dong[0][0] instanceof Date && xc.dong[0][0].getMonth() === 10 && xc.dong[0][0].getDate() === 1);
check('khoa la bi bo qua', B.dongXuat([LEADS[0]], ['name', 'khongCo'], ctx).tieuDe.length === 1);
check('giu thu tu dong', B.dongXuat([LEADS[1], LEADS[0]], ['name'], ctx).dong.map((r: any) => r[0]).join('|') === 'Trần Minh|Nguyễn Thị Hằng');

console.log('\n>> cai dat');
const md = B.macDinhCaiDat();
check('mac dinh an 4 cot', JSON.stringify(md.an) === JSON.stringify(['createdAt', 'wonAt', 'lostAt', 'lostReason']));
check('mac dinh sap xep ngay tao moi nhat', md.sapXep.khoa === 'createdAt' && md.sapXep.chieu === 'giam');
check('mac dinh la ban sao moi', B.macDinhCaiDat().an !== md.an);
check('null -> mac dinh', JSON.stringify(B.docCaiDat(null)) === JSON.stringify(md));
check('json hong -> mac dinh', JSON.stringify(B.docCaiDat('{hong')) === JSON.stringify(md));
check('khong phai object -> mac dinh', JSON.stringify(B.docCaiDat('[1,2]')) === JSON.stringify(md));
const cd = B.docCaiDat(JSON.stringify({
  an: ['phone', 'name', 'khongCo', 5],
  rong: { phone: 150, name: 20, khongCo: 99, facebook: 'x' },
  sapXep: { khoa: 'xyz', chieu: 'giam' },
  loc: { package: { chon: ['Unique', 3] }, khongCo: { chua: 'x' }, phone: { chua: '09' }, weddingDate: { tu: '2026-01-01' }, facebook: 'sai' },
}));
check('an: bo name + khoa la', JSON.stringify(cd.an) === JSON.stringify(['phone']), JSON.stringify(cd.an));
check('rong: toi thieu 60, bo khoa la/kieu sai', JSON.stringify(cd.rong) === JSON.stringify({ phone: 150, name: 60 }), JSON.stringify(cd.rong));
check('sapXep khoa la -> mac dinh', cd.sapXep.khoa === 'createdAt' && cd.sapXep.chieu === 'giam');
check('loc: giu dung dang, loc chu trong chon', JSON.stringify(cd.loc) === JSON.stringify({ package: { chon: ['Unique'] }, phone: { chua: '09' }, weddingDate: { tu: '2026-01-01' } }), JSON.stringify(cd.loc));
const cd2 = B.docCaiDat(JSON.stringify({ sapXep: { khoa: 'name', chieu: 'tang' } }));
check('sapXep hop le giu nguyen, thieu an -> mac dinh', cd2.sapXep.khoa === 'name' && cd2.sapXep.chieu === 'tang' && cd2.an.length === 4);
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm run test:bang`
Expected: lỗi `B.dongXuat is not a function` (TypeError).

- [ ] **Step 3: Thêm vào cuối `web/bang-lead.js`:**

```js
// Một dòng xuất Excel: giá trị kiểu thật để SheetJS ghi số/ngày đúng (không phải chữ).
function ngayThat(s){
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1) : null;
}
export function dongXuat(leads, khoaHien, ctx){
  const cot = khoaHien.map(k => COT_MAP[k]).filter(Boolean);
  const kieuXuat = c => (c.khoa === 'todos' || c.kieu === 'chon' ? 'chu' : c.kieu);
  return {
    tieuDe: cot.map(c => c.tieuDe),
    kieu: cot.map(kieuXuat),
    dong: leads.map(l => cot.map(c => {
      if (c.khoa === 'todos'){
        const t = l.todos || [];
        return t.length ? `${t.filter(x => x.done).length}/${t.length}` : null;
      }
      const v = c.lay(l, ctx);
      if (rong(v)) return null;
      if (c.kieu === 'ngay' || c.kieu === 'thang') return ngayThat(v);
      return v;
    })),
  };
}

export const MAC_DINH_AN = ['createdAt', 'wonAt', 'lostAt', 'lostReason'];
export function macDinhCaiDat(){
  return { an: MAC_DINH_AN.slice(), rong: {}, sapXep: { khoa: 'createdAt', chieu: 'giam' }, loc: {} };
}

const laObject = v => v && typeof v === 'object' && !Array.isArray(v);
function locHopLe(dk){
  if (!laObject(dk)) return null;
  if (typeof dk.chua === 'string') return { chua: dk.chua };
  if (Array.isArray(dk.chon)) return { chon: dk.chon.filter(x => typeof x === 'string') };
  const r = {};
  if (typeof dk.tu === 'string' || typeof dk.tu === 'number') r.tu = dk.tu;
  if (typeof dk.den === 'string' || typeof dk.den === 'number') r.den = dk.den;
  return Object.keys(r).length ? r : null;
}

// Cài đặt bảng đọc từ localStorage: hỏng / khác phiên bản / khoá cột lạ → bỏ phần sai, phần thiếu lấy mặc định.
export function docCaiDat(chuoi){
  const md = macDinhCaiDat();
  let o;
  try { o = JSON.parse(chuoi); } catch (e) { return md; }
  if (!laObject(o)) return md;
  const an = Array.isArray(o.an) ? o.an.filter(k => typeof k === 'string' && COT_MAP[k] && k !== 'name') : md.an;
  const rongCot = {};
  if (laObject(o.rong)) for (const [k, v] of Object.entries(o.rong)){
    if (COT_MAP[k] && typeof v === 'number' && isFinite(v)) rongCot[k] = Math.max(60, Math.round(v));
  }
  const sx = laObject(o.sapXep) && COT_MAP[o.sapXep.khoa] && (o.sapXep.chieu === 'tang' || o.sapXep.chieu === 'giam')
    ? { khoa: o.sapXep.khoa, chieu: o.sapXep.chieu } : md.sapXep;
  const loc = {};
  if (laObject(o.loc)) for (const [k, dk] of Object.entries(o.loc)){
    const h = COT_MAP[k] && locHopLe(dk);
    if (h) loc[k] = h;
  }
  return { an, rong: rongCot, sapXep: sx, loc };
}
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `npm run test:bang`
Expected: `N OK, 0 FAIL`.

- [ ] **Step 5: Commit**

```bash
git add web/bang-lead.js test/bang-lead.test.ts
git commit -m "Them dong xuat Excel va doc cai dat cho bang Danh sach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: View "Danh sách" — khung, bảng chỉ xem, dòng tổng, trạng thái trống

**Files:**
- Modify: `index.html` — script module (sau dòng 138 `window.ZaloMap = ZaloMap;`), CSS (sau khối dòng 794–797), nav (sau nút `navPipeline` ~dòng 1914), `menuKhacOverlay` (~dòng 2284), section mới (sau `</section>` của `viewPipeline` ~dòng 2041), `VIEWS` (~dòng 3188), `renderAll` (~dòng 5103), `onSearch` (~dòng 4448).

**Interfaces:**
- Consumes: `window.BangLead` (Task 1–2).
- Produces (Task 4–6 dùng):
  - biến toàn cục `bangCaiDat` (null tới khi `caiDatBang()` gọi lần đầu), `bangDangSua` (`null | {id, khoa}`)
  - `caiDatBang() → caiDat`, `luuCaiDatBang()`, `ctxBang() → ctx`, `cotDangHien() → COT[]`, `dongDangHien() → lead[]`, `renderBangLead()`, `xoaLocBang()`
  - DOM: `#viewList`, `#bangToolbar`, `#bangScroll`, `table.bang` với `<col data-khoa>`, `th[data-khoa]`, `td[data-khoa]`, `tr[data-id]`

- [ ] **Step 1: Nạp module** — trong `<script type="module">` ở `index.html:135-139`, sau `window.ZaloMap = ZaloMap;` thêm:

```js
  // Logic thuần của view "Danh sách" (lọc/sắp xếp/xuất) — test bằng Node ở test/bang-lead.test.ts
  import * as BangLead from './web/bang-lead.js';
  window.BangLead = BangLead;
  if (document.body && document.body.dataset.view === 'list' && window.renderBangLead) window.renderBangLead();
```

(`import` phải ở đầu module: đặt dòng `import * as BangLead ...` ngay dưới dòng `import * as ZaloMap ...`, các dòng còn lại đặt dưới `window.ZaloMap = ZaloMap;`.)

- [ ] **Step 2: Nút nav + mục "Khác" + section**

Sau `</button>` của `navPipeline` (index.html ~dòng 1914) thêm:

```html
      <button class="nav-item" id="navList" onclick="setView('list')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>
        <span>Danh sách</span>
      </button>
```

Trong `menuKhacOverlay`, ngay trước nút "Nhắc nhở" thêm:

```html
      <button type="button" class="menu-khac-item" onclick="dongMenuKhac(); setView('list')"><span>Danh sách lead (bảng)</span><span class="menu-khac-meta">›</span></button>
```

Sau `</section>` đóng `viewPipeline` thêm:

```html
    <!-- ============ DANH SÁCH VIEW (bảng lead kiểu Excel) ============ -->
    <section class="view" id="viewList">
      <div class="bang-wrap">
        <div class="bang-toolbar" id="bangToolbar"></div>
        <div class="bang-scroll" id="bangScroll"></div>
      </div>
      <div class="bang-menu" id="bangMenu" hidden></div>
    </section>
```

- [ ] **Step 3: `VIEWS`, `renderAll`, `onSearch`**

Trong `const VIEWS = {` (~dòng 3188) thêm sau dòng `pipeline`:

```js
  list:          { el:'viewList',          nav:'navList',          title:'Danh sách', sub:'Tất cả lead dạng bảng' },
```

`renderAll()` (~dòng 5103) thêm dòng `renderBangLead();` sau `renderPipeline();`.

`onSearch` (~dòng 4448) đổi thành:

```js
function onSearch(v){ searchQuery = v; renderPipeline(); renderBangLead(); }
```

- [ ] **Step 4: CSS** — sau khối `body[data-view="conversations"] #filterStatus{display:none;}` (~dòng 797) thêm:

```css
  /* ---------- View Danh sách (bảng lead kiểu Excel) ---------- */
  /* Bảng có lọc theo cột riêng -> ẩn lọc gói/trạng thái của Pipeline; ô tìm vẫn dùng chung */
  body[data-view="list"] #filterPackage,
  body[data-view="list"] #filterStatus{display:none;}
  .bang-wrap{display:flex; flex-direction:column; min-height:0; flex:1; padding:14px 22px 18px; gap:10px;}
  .bang-toolbar{display:flex; align-items:center; gap:8px; flex-wrap:wrap;}
  .bang-loc-chip{display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-2); background:var(--primary-soft); border-radius:999px; padding:4px 10px;}
  .bang-loc-chip button{background:none; border:0; color:var(--primary); font-weight:600; cursor:pointer; padding:0;}
  .bang-scroll{flex:1; min-height:0; overflow:auto; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface);}
  table.bang{border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:13px; color:var(--text);}
  .bang th, .bang td{border-bottom:1px solid var(--border); border-right:1px solid var(--border); padding:7px 9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left; background:var(--surface);}
  .bang thead th{position:sticky; top:0; z-index:2; background:var(--well); font-weight:600; font-size:12.5px; color:var(--text-2); user-select:none;}
  .bang tfoot td{position:sticky; bottom:0; z-index:2; background:var(--well); font-weight:600;}
  .bang th:first-child, .bang td:first-child{position:sticky; left:0; z-index:1;}
  .bang thead th:first-child, .bang tfoot td:first-child{z-index:3;}
  .bang tbody tr:hover td{background:var(--well);}
  .bang .so{text-align:right; font-variant-numeric:tabular-nums;}
  .bang td.sua-duoc{cursor:cell;}
  .bang-th{display:flex; align-items:center; gap:4px; position:relative;}
  .bang-th-ten{flex:1; overflow:hidden; text-overflow:ellipsis; cursor:pointer;}
  .bang-th-loc{background:none; border:0; color:var(--text-3); cursor:pointer; padding:0 2px; font-size:12px; line-height:1;}
  .bang-th-loc.on{color:var(--primary);}
  .bang-resize{position:absolute; right:-9px; top:-7px; bottom:-7px; width:8px; cursor:col-resize; touch-action:none;}
  .bang-ten{background:none; border:0; padding:0; font:inherit; font-weight:600; color:var(--text); cursor:pointer; text-align:left; max-width:100%; overflow:hidden; text-overflow:ellipsis;}
  .bang-ten:hover{color:var(--primary); text-decoration:underline;}
  .bang-trong{padding:40px 16px; text-align:center; color:var(--text-2); display:flex; flex-direction:column; align-items:center; gap:12px;}
  .bang-menu{position:fixed; z-index:80; min-width:220px; max-width:300px; max-height:60vh; overflow:auto; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); box-shadow:var(--sh-md); padding:8px; font-size:13px; color:var(--text);}
  .bang-menu button.bang-menu-muc{display:block; width:100%; text-align:left; background:none; border:0; padding:7px 8px; border-radius:6px; cursor:pointer; color:var(--text); font:inherit;}
  .bang-menu button.bang-menu-muc:hover{background:var(--well);}
  .bang-menu label{display:flex; align-items:center; gap:8px; padding:5px 8px; cursor:pointer;}
  .bang-menu hr{border:0; border-top:1px solid var(--border); margin:6px 0;}
  .bang-menu .field-input{width:100%; min-height:34px; padding:6px 9px; margin:3px 0;}
  .bang .bang-input{width:100%; min-height:0; padding:3px 5px; font:inherit; color:var(--text); background:var(--surface); border:1px solid var(--primary); border-radius:4px;}
  @media (max-width:760px){
    #navList{display:none;}            /* điện thoại: vào bảng qua tấm "Khác" */
    .bang-wrap{padding:10px 10px 12px;}
  }
```

- [ ] **Step 5: Khối JS render** — thêm ngay trước dòng `/* ======================= RENDER: PIPELINE ======================= */` (~dòng 3205):

```js
/* ======================= RENDER: DANH SÁCH ======================= */
// Bảng lead kiểu Excel. Logic thuần (lọc/sắp xếp/tổng/xuất) ở web/bang-lead.js (window.BangLead).
const BANG_CAI_DAT_KEY = 'bangLeadCaiDat';
let bangCaiDat = null;      // { an, rong, sapXep, loc } — nạp lười vì module nạp sau script này
let bangDangSua = null;     // { id, khoa } khi đang sửa một ô -> hoãn vẽ lại để không mất chữ đang gõ
let bangCanVeLai = false;

function caiDatBang(){
  if (!bangCaiDat){
    let s = null;
    try { s = localStorage.getItem(BANG_CAI_DAT_KEY); } catch(e){}
    bangCaiDat = window.BangLead.docCaiDat(s);
  }
  return bangCaiDat;
}
function luuCaiDatBang(){
  try { localStorage.setItem(BANG_CAI_DAT_KEY, JSON.stringify(bangCaiDat)); } catch(e){}
}
function ctxBang(){
  return {
    leadStatus, leadTypeOf,
    stageName: id => (STAGE_MAP[id] || {}).name || id || '',
    coZalo: l => zaloConvsOf(l.id).length > 0,
  };
}
function cotDangHien(){
  const an = caiDatBang().an;
  return window.BangLead.COT.filter(c => c.khoa === 'name' || !an.includes(c.khoa));
}
function dongDangHien(){
  const B = window.BangLead, cd = caiDatBang(), ctx = ctxBang();
  return B.sapXep(B.locLead(leads, cd.loc, searchQuery, ctx), cd.sapXep, ctx);
}
function rongCot(c){ return caiDatBang().rong[c.khoa] || c.rong; }

function oBangHtml(c, lead, ctx){
  const v = window.BangLead.layGiaTri(c.khoa, lead, ctx);
  switch (c.khoa){
    case 'name': return `<button type="button" class="bang-ten" onclick="openLead('${lead.id}')" title="${esc(v)}">${esc(v)}</button>`;
    case 'package': {
      if (!v) return '—';
      const p = PACKAGE_STYLE[v] || PACKAGE_STYLE['Standard'];
      return `<span class="badge-pkg" style="background:${p.bg}; color:${p.fg}">${esc(v)}</span>`;
    }
    case 'leadType': {
      const t = LEAD_TYPE_STYLE[v] || LEAD_TYPE_STYLE['Lead công ty'];
      return `<span class="badge-pkg badge-leadtype" style="background:${t.bg}; color:${t.fg}">${esc(v)}</span>`;
    }
    case 'status': { const s = leadStatus(lead); return `<span class="status-text ${s.type}">${esc(s.label)}</span>`; }
    case 'todos': { const t = lead.todos || []; return t.length ? `${t.filter(x => x.done).length}/${t.length}` : '—'; }
    case 'lastNote': {
      if (!v) return '—';
      const ngan = v.length > 80 ? v.slice(0, 80) + '…' : v;
      return `<span title="${esc(v)}">${esc(ngan)}</span>`;
    }
    case 'zalo': return v === 'Có' ? 'Có' : '—';
  }
  if (v === null || v === '') return '—';
  if (c.kieu === 'ngay') return esc(formatDate(v));
  if (c.kieu === 'thang') return esc(formatMonthYear(v));
  if (c.kieu === 'so') return esc(formatMoney(v));
  return esc(v);
}
function oSuaDuoc(c, lead){ return !!c.sua && (!c.suaKhi || c.suaKhi(lead)); }

function renderBangLead(){
  const scroll = document.getElementById('bangScroll');
  if (!scroll || !window.BangLead) return;
  if (!document.getElementById('viewList').classList.contains('active')) return;
  if (bangDangSua){ bangCanVeLai = true; return; }
  bangCanVeLai = false;
  const B = window.BangLead, cd = caiDatBang(), ctx = ctxBang();
  const cot = cotDangHien();
  const dong = dongDangHien();
  const soLoc = B.soCotDangLoc(cd.loc);

  document.getElementById('bangToolbar').innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="moMenuCot(this)">Cột ▾</button>
    <button type="button" class="btn btn-secondary" onclick="xuatExcelBang()">Xuất Excel</button>
    ${soLoc ? `<span class="bang-loc-chip">Đang lọc ${soLoc} cột · <button type="button" onclick="xoaLocBang()">Xoá lọc</button></span>` : ''}
  `;

  if (!leads.length){
    scroll.innerHTML = `<div class="bang-trong">Chưa có lead nào.<button type="button" class="btn btn-primary" onclick="openAddLead()">+ Thêm lead</button></div>`;
    return;
  }
  if (!dong.length){
    scroll.innerHTML = `<div class="bang-trong">Không có lead khớp bộ lọc.<button type="button" class="btn btn-ghost" onclick="xoaLocBang()">Xoá lọc</button></div>`;
    return;
  }

  const tong = B.tinhTong(dong);
  const tongRong = cot.reduce((s, c) => s + rongCot(c), 0);
  const thHtml = c => {
    const sx = cd.sapXep.khoa === c.khoa ? (cd.sapXep.chieu === 'tang' ? ' ▲' : ' ▼') : '';
    const dangLoc = cd.loc[c.khoa] && B.soCotDangLoc({ x: cd.loc[c.khoa] });
    return `<th data-khoa="${c.khoa}"><div class="bang-th">
      <span class="bang-th-ten" onclick="doiSapXepBang('${c.khoa}')" title="${esc(c.tieuDe)}">${esc(c.tieuDe)}${sx}</span>
      <button type="button" class="bang-th-loc${dangLoc ? ' on' : ''}" aria-label="Lọc cột ${esc(c.tieuDe)}" onclick="moMenuLoc('${c.khoa}', this)">▾</button>
      <span class="bang-resize" onpointerdown="batDauKeoCot(event,'${c.khoa}')"></span>
    </div></th>`;
  };
  const tfootO = c => {
    if (c.khoa === 'name') return `<td>${tong.soLead} lead</td>`;
    if (c.khoa === 'revenueExpected') return `<td class="so">${esc(formatMoney(tong.duKien))}</td>`;
    if (c.khoa === 'revenueActual') return `<td class="so">${esc(formatMoney(tong.thucTe))}</td>`;
    return '<td></td>';
  };
  scroll.innerHTML = `
    <table class="bang" style="width:${tongRong}px">
      <colgroup>${cot.map(c => `<col data-khoa="${c.khoa}" style="width:${rongCot(c)}px">`).join('')}</colgroup>
      <thead><tr>${cot.map(thHtml).join('')}</tr></thead>
      <tbody>${dong.map(l => `<tr data-id="${l.id}">${cot.map(c =>
        `<td data-khoa="${c.khoa}" class="${c.kieu === 'so' ? 'so' : ''}${oSuaDuoc(c, l) ? ' sua-duoc' : ''}" ondblclick="suaOBang('${l.id}','${c.khoa}',this)">${oBangHtml(c, l, ctx)}</td>`
      ).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${cot.map(tfootO).join('')}</tr></tfoot>
    </table>`;
}

function doiSapXepBang(khoa){
  const cd = caiDatBang();
  cd.sapXep = { khoa, chieu: cd.sapXep.khoa === khoa && cd.sapXep.chieu === 'tang' ? 'giam' : 'tang' };
  luuCaiDatBang();
  renderBangLead();
}
function xoaLocBang(){
  caiDatBang().loc = {};
  luuCaiDatBang();
  searchQuery = '';
  const s = document.getElementById('searchInput'); if (s) s.value = '';
  dongMenuBang();
  renderPipeline();
  renderBangLead();
}

// Stub — Task 4/5/6 thay bằng bản thật
function moMenuLoc(){}  function moMenuCot(){}  function dongMenuBang(){}
function batDauKeoCot(){}  function suaOBang(){}  function xuatExcelBang(){}
```

- [ ] **Step 6: Chạy app và kiểm tra tay**

Mở `index.html` qua server tĩnh local (vd. `npx --yes serve -l 5173 .` rồi mở `http://localhost:5173`), đăng nhập bằng tài khoản thật của người dùng (người dùng tự đăng nhập — agent KHÔNG nhập mật khẩu).
Kiểm tra:
- Menu bên có "Danh sách" giữa Pipeline và Dashboard; bấm vào → tiêu đề "Danh sách", thấy bảng tất cả lead (kể cả Won/Lost), sắp theo ngày tạo mới nhất; 4 cột Ngày tạo/Won/Lost/Lý do mặc định ẩn.
- Ô lọc Gói/Trạng thái ở topbar ẩn; gõ tên vào ô tìm → bảng lọc, chuyển về Pipeline vẫn giữ chữ tìm.
- Cuộn ngang: cột Tên đứng yên; cuộn dọc: tiêu đề + dòng tổng đứng yên; dòng tổng đúng.
- Bấm tên → mở chi tiết lead. Bấm tiêu đề cột → đổi ▲/▼.
- Dark mode: chữ/nền đọc được. Khung 375px: không có tab "Danh sách" ở thanh dưới, vào được qua "Khác".
- Console không có lỗi.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Them view Danh sach: bang lead chi xem, dong tong, sap xep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Menu lọc theo cột, menu ẩn/hiện cột, kéo độ rộng

**Files:**
- Modify: `index.html` — thay 4 stub `moMenuLoc`, `moMenuCot`, `dongMenuBang`, `batDauKeoCot` trong khối `RENDER: DANH SÁCH`.

**Interfaces:**
- Consumes: `caiDatBang`, `luuCaiDatBang`, `ctxBang`, `renderBangLead`, `rongCot`, `window.BangLead.{COT, giaTriDuyNhat, MAC_DINH_AN}`.
- Produces: `moMenuLoc(khoa, nut)`, `moMenuCot(nut)`, `dongMenuBang()`, `batDauKeoCot(ev, khoa)`.

- [ ] **Step 1: Thay dòng stub** `function moMenuLoc(){}  function moMenuCot(){}  function dongMenuBang(){}` và `function batDauKeoCot(){}` bằng (giữ lại stub `suaOBang`, `xuatExcelBang` cho Task 5/6):

```js
function dongMenuBang(){
  const m = document.getElementById('bangMenu');
  if (m){ m.hidden = true; m.innerHTML = ''; m.dataset.khoa = ''; }
}
function datViTriMenu(m, nut){
  const r = nut.getBoundingClientRect();
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
}
// Đóng menu khi bấm ra ngoài / Esc
document.addEventListener('pointerdown', e => {
  const m = document.getElementById('bangMenu');
  if (m && !m.hidden && !m.contains(e.target) && !e.target.closest('.bang-th-loc, .bang-toolbar')) dongMenuBang();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') dongMenuBang(); });

function capNhatLocBang(khoa, dk){
  const cd = caiDatBang();
  if (dk) cd.loc[khoa] = dk; else delete cd.loc[khoa];
  luuCaiDatBang();
  renderBangLead();   // chỉ vẽ lại bảng, không vẽ lại menu -> ô nhập trong menu giữ focus
}

function moMenuLoc(khoa, nut){
  const m = document.getElementById('bangMenu');
  if (!m.hidden && m.dataset.khoa === khoa){ dongMenuBang(); return; }
  const B = window.BangLead, cd = caiDatBang();
  const c = B.COT.find(x => x.khoa === khoa);
  const dk = cd.loc[khoa] || {};
  let loc = '';
  if (c.kieu === 'chu'){
    loc = `<input class="field-input" placeholder="Chứa…" value="${esc(dk.chua || '')}"
      oninput="capNhatLocBang('${khoa}', this.value.trim() ? {chua:this.value} : null)">`;
  } else if (c.kieu === 'chon'){
    const ds = B.giaTriDuyNhat(leads, khoa, ctxBang());
    const chon = Array.isArray(dk.chon) ? dk.chon : ds;
    loc = `<label><input type="checkbox" ${chon.length === ds.length ? 'checked' : ''} onchange="chonTatCaLocBang('${khoa}', this.checked)"> <b>Chọn tất cả</b></label>
      ${ds.map((v, i) => `<label><input type="checkbox" data-gt="${esc(v)}" ${chon.includes(v) ? 'checked' : ''} onchange="tickLocBang('${khoa}')"> ${v ? esc(v) : '<i>(Trống)</i>'}</label>`).join('')}`;
  } else {
    const loai = c.kieu === 'ngay' ? 'date' : c.kieu === 'thang' ? 'month' : 'text';
    const doc = c.kieu === 'so' ? `inputmode="numeric" oninput="formatMoneyInput(this)"` : '';
    const gt = v => (v === undefined || v === '' ? '' : c.kieu === 'so' ? moneyDisplay(v) : esc(v));
    loc = `<div>Từ</div><input class="field-input" type="${loai}" data-dau="tu" ${doc} value="${gt(dk.tu)}" onchange="khoangLocBang('${khoa}')">
      <div>Đến</div><input class="field-input" type="${loai}" data-dau="den" ${doc} value="${gt(dk.den)}" onchange="khoangLocBang('${khoa}')">`;
  }
  m.dataset.khoa = khoa;
  m.innerHTML = `
    <button type="button" class="bang-menu-muc" onclick="datSapXepBang('${khoa}','tang')">Sắp xếp A → Z</button>
    <button type="button" class="bang-menu-muc" onclick="datSapXepBang('${khoa}','giam')">Sắp xếp Z → A</button>
    <hr>${loc}<hr>
    <button type="button" class="bang-menu-muc" onclick="capNhatLocBang('${khoa}', null); dongMenuBang()">Xoá lọc cột này</button>`;
  datViTriMenu(m, nut);
}
function datSapXepBang(khoa, chieu){
  caiDatBang().sapXep = { khoa, chieu };
  luuCaiDatBang(); dongMenuBang(); renderBangLead();
}
function tickLocBang(khoa){
  const m = document.getElementById('bangMenu');
  const hop = [...m.querySelectorAll('input[data-gt]')];
  const chon = hop.filter(h => h.checked).map(h => h.dataset.gt);
  const tatCa = m.querySelector('input:not([data-gt])');
  if (tatCa) tatCa.checked = chon.length === hop.length;
  capNhatLocBang(khoa, chon.length === hop.length ? null : { chon });
}
function chonTatCaLocBang(khoa, bat){
  document.querySelectorAll('#bangMenu input[data-gt]').forEach(h => { h.checked = bat; });
  capNhatLocBang(khoa, bat ? null : { chon: [] });
}
function khoangLocBang(khoa){
  const c = window.BangLead.COT.find(x => x.khoa === khoa);
  const doc = dau => {
    const el = document.querySelector(`#bangMenu input[data-dau="${dau}"]`);
    if (!el || !el.value) return undefined;
    return c.kieu === 'so' ? moneyInputValue(el) : el.value;
  };
  const tu = doc('tu'), den = doc('den');
  capNhatLocBang(khoa, tu === undefined && den === undefined ? null : { ...(tu !== undefined && { tu }), ...(den !== undefined && { den }) });
}

function moMenuCot(nut){
  const m = document.getElementById('bangMenu');
  if (!m.hidden && m.dataset.khoa === '__cot'){ dongMenuBang(); return; }
  const an = caiDatBang().an;
  m.dataset.khoa = '__cot';
  m.innerHTML = window.BangLead.COT.map(c => `<label><input type="checkbox" ${c.khoa === 'name' ? 'checked disabled' : (an.includes(c.khoa) ? '' : 'checked')}
      onchange="anHienCotBang('${c.khoa}', this.checked)"> ${esc(c.tieuDe)}</label>`).join('')
    + `<hr><button type="button" class="bang-menu-muc" onclick="khoiPhucCotBang()">Khôi phục mặc định</button>`;
  datViTriMenu(m, nut);
}
function anHienCotBang(khoa, hien){
  const cd = caiDatBang();
  cd.an = cd.an.filter(k => k !== khoa);
  if (!hien) cd.an.push(khoa);
  luuCaiDatBang(); renderBangLead();
}
function khoiPhucCotBang(){
  const cd = caiDatBang();
  cd.an = window.BangLead.MAC_DINH_AN.slice();
  cd.rong = {};
  luuCaiDatBang(); dongMenuBang(); renderBangLead();
}

// Kéo mép phải tiêu đề để đổi độ rộng cột (chuột + cảm ứng qua pointer events)
function batDauKeoCot(ev, khoa){
  ev.preventDefault(); ev.stopPropagation();
  const col = document.querySelector(`#bangScroll col[data-khoa="${khoa}"]`);
  const table = document.querySelector('#bangScroll table.bang');
  if (!col || !table) return;
  const x0 = ev.clientX, w0 = col.getBoundingClientRect().width || parseInt(col.style.width, 10);
  const t0 = table.getBoundingClientRect().width;
  let w = w0;
  const di = e => {
    w = Math.max(60, Math.round(w0 + e.clientX - x0));
    col.style.width = w + 'px';
    table.style.width = (t0 + w - w0) + 'px';
  };
  const tha = () => {
    window.removeEventListener('pointermove', di);
    window.removeEventListener('pointerup', tha);
    caiDatBang().rong[khoa] = w;
    luuCaiDatBang();
  };
  window.addEventListener('pointermove', di);
  window.addEventListener('pointerup', tha);
}
```

- [ ] **Step 2: Kiểm tra tay trên app local** (đăng nhập do người dùng tự làm):
- Cột chữ (SĐT): gõ "09" → lọc ngay, con trỏ vẫn trong ô; icon ▾ đổi màu; chip "Đang lọc 1 cột · Xoá lọc".
- Cột chọn (Gói, Giai đoạn, Trạng thái hẹn): bỏ tick một giá trị → mất dòng; "Chọn tất cả" bật/tắt đúng; có mục "(Trống)" nếu có lead thiếu giá trị.
- Cột ngày (Ngày cưới) và tiền (DT dự kiến): nhập Từ/Đến → lọc đúng; để trống một đầu vẫn chạy.
- Sắp xếp A→Z / Z→A từ menu. "Xoá lọc cột này" và chip "Xoá lọc" hoạt động; lọc ra 0 dòng → hiện "Không có lead khớp bộ lọc" + nút xoá lọc.
- "Cột ▾": tắt/bật cột; Tên không tắt được; "Khôi phục mặc định".
- Kéo mép tiêu đề đổi độ rộng; F5 lại trang → độ rộng, cột ẩn, sắp xếp, bộ lọc còn nguyên.
- Bấm ra ngoài / Esc đóng menu. DevTools: đặt `localStorage.bangLeadCaiDat = '{hong'` rồi F5 → bảng hiện mặc định, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Bang Danh sach: loc theo cot kieu Excel, an hien va keo do rong cot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sửa trong ô

**Files:**
- Modify: `index.html` — thay stub `suaOBang` trong khối `RENDER: DANH SÁCH`; sửa `onFieldChange` (~dòng 3776).

**Interfaces:**
- Consumes: `bangDangSua`, `bangCanVeLai`, `renderBangLead`, `oSuaDuoc`, `onFieldChange(id, field, value)`, `moveLeadToStage(id, newStage)`, `PACKAGES`, `LEAD_TYPES`, `STAGES`, `moneyDisplay`, `formatMoneyInput`, `moneyInputValue`.
- Produces: `suaOBang(id, khoa, td)`, `luuOBang()`, `huyOBang()`.

- [ ] **Step 1: `onFieldChange` vẽ lại bảng** — trong `onFieldChange` (~dòng 3784), sau dòng `renderPipeline();` thêm:

```js
  renderBangLead();
```

(`renderBangLead` tự bỏ qua khi view Danh sách không mở hoặc đang sửa ô.)

- [ ] **Step 2: Thay stub `function suaOBang(){}`** bằng:

```js
function suaOBang(id, khoa, td){
  const lead = leads.find(l => l.id === id);
  const c = window.BangLead.COT.find(x => x.khoa === khoa);
  if (!lead || !c || !oSuaDuoc(c, lead) || bangDangSua) return;
  bangDangSua = { id, khoa };
  const truong = khoa;   // khoá cột trùng tên trường lead với mọi cột sửa được
  const v = lead[truong];
  const opt = (ds, chon) => ds.map(o => `<option value="${esc(o.v)}" ${o.v === chon ? 'selected' : ''}>${esc(o.t)}</option>`).join('');
  let html;
  switch (c.sua){
    case 'chu':   html = `<input class="bang-input" type="text" value="${esc(v || '')}">`; break;
    case 'ngay':  html = `<input class="bang-input" type="date" value="${esc(v || '')}">`; break;
    case 'thang': html = `<input class="bang-input" type="month" value="${esc(v || '')}">`; break;
    case 'so':    html = `<input class="bang-input" type="text" inputmode="numeric" value="${moneyDisplay(v)}" oninput="formatMoneyInput(this)">`; break;
    case 'chon': {
      const ds = (khoa === 'package' ? PACKAGES : LEAD_TYPES).map(p => ({ v: p, t: p }));
      html = `<select class="bang-input">${opt(ds, khoa === 'leadType' ? leadTypeOf(lead) : v)}</select>`; break;
    }
    case 'giaidoan': html = `<select class="bang-input">${opt(STAGES.map(s => ({ v: s.id, t: s.name })), lead.stage)}</select>`; break;
  }
  td.innerHTML = html;
  const el = td.firstElementChild;
  el.focus();
  if (el.select && el.type === 'text') el.select();
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); luuOBang(el); }
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); huyOBang(); }
  });
  if (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'month') el.addEventListener('change', () => luuOBang(el));
  el.addEventListener('blur', () => luuOBang(el));
}
function ketThucSuaBang(){
  bangDangSua = null;
}
function huyOBang(){
  if (!bangDangSua) return;
  ketThucSuaBang();
  renderBangLead();
}
function luuOBang(el){
  if (!bangDangSua) return;           // Enter rồi blur: chỉ lưu một lần
  const { id, khoa } = bangDangSua;
  const lead = leads.find(l => l.id === id);
  const c = window.BangLead.COT.find(x => x.khoa === khoa);
  ketThucSuaBang();
  if (!lead || !c){ renderBangLead(); return; }
  if (c.sua === 'giaidoan'){
    renderBangLead();                  // ô về giá trị hiện tại; Won/Lost chỉ đổi khi bấm xác nhận
    if (el.value !== lead.stage) moveLeadToStage(id, el.value);
    return;
  }
  let moi;
  if (c.sua === 'so') moi = moneyInputValue(el);
  else if (c.sua === 'chu') moi = el.value.trim();
  else moi = el.value || null;
  const cu = khoa === 'leadType' ? leadTypeOf(lead) : (lead[khoa] ?? (c.sua === 'so' ? 0 : c.sua === 'chu' ? '' : null));
  if ((khoa === 'name' && !moi) || moi === cu){ renderBangLead(); return; }
  onFieldChange(id, khoa, moi);       // ghi + vẽ lại Pipeline/bảng + scheduleSave() như sửa ở chi tiết lead
}
```

- [ ] **Step 3: Kiểm tra tay trên app local:**
- Bấm đúp Tên → sửa → Enter: tên đổi ở bảng và Pipeline; F5 vẫn còn (đã lưu Firebase). Xoá trắng tên + Enter → giữ tên cũ.
- Esc khi đang sửa → về giá trị cũ, không lưu.
- SĐT, Facebook (chữ), Ngày cưới (ngày), Tháng dự kiến chốt (tháng), DT dự kiến (tiền có dấu phân cách khi gõ) — lưu đúng; rời ô (bấm chỗ khác) cũng lưu.
- Gói, Loại lead (dropdown) đổi là lưu ngay.
- Giai đoạn: đổi Lead in → Báo giá: nhật ký hoạt động của lead có dòng "Chuyển từ…". Đổi sang Won → hiện hộp nhập doanh thu; **Huỷ → ô vẫn là giai đoạn cũ**; làm lại và xác nhận → Won, DT thực tế + Ngày Won được điền. Tương tự Lost với lý do.
- Deadline của lead Won/Lost và DT thực tế của lead chưa Won: bấm đúp không làm gì (con trỏ thường).
- Mở một tab thứ hai, sửa lead đó trong tab hai trong lúc tab một đang gõ dở một ô → chữ đang gõ không mất; sau khi Enter, bảng cập nhật thay đổi từ tab hai.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Bang Danh sach: sua truc tiep trong o (giu luong Won/Lost)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Xuất Excel

**Files:**
- Modify: `index.html` — thay stub `xuatExcelBang` trong khối `RENDER: DANH SÁCH`.

**Interfaces:**
- Consumes: `window.BangLead.dongXuat`, `cotDangHien`, `dongDangHien`, `ctxBang`, `rongCot`, `todayISO`.
- Produces: `napSheetJs() → Promise<XLSX>`, `xuatExcelBang()`.

- [ ] **Step 1: Thay stub `function xuatExcelBang(){}`** bằng:

```js
// SheetJS chỉ nạp khi bấm "Xuất Excel" để không làm nặng lần mở app
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let sheetJsDangNap = null;
function napSheetJs(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetJsDangNap){
    sheetJsDangNap = new Promise((ok, loi) => {
      const s = document.createElement('script');
      s.src = SHEETJS_URL;
      s.onload = () => (window.XLSX ? ok(window.XLSX) : loi(new Error('XLSX trống')));
      s.onerror = () => { sheetJsDangNap = null; s.remove(); loi(new Error('Không tải được SheetJS')); };
      document.head.appendChild(s);
    });
  }
  return sheetJsDangNap;
}
async function xuatExcelBang(){
  let XLSX;
  try { XLSX = await napSheetJs(); }
  catch(e){ alert('Không tải được công cụ xuất Excel, kiểm tra mạng rồi thử lại.'); return; }
  const cot = cotDangHien();
  const { tieuDe, kieu, dong } = window.BangLead.dongXuat(dongDangHien(), cot.map(c => c.khoa), ctxBang());
  const ws = XLSX.utils.aoa_to_sheet([tieuDe, ...dong], { cellDates: true });
  const dinhDang = { so: '#,##0', ngay: 'dd/mm/yyyy', thang: 'mm/yyyy' };
  dong.forEach((r, i) => r.forEach((v, j) => {
    const o = ws[XLSX.utils.encode_cell({ r: i + 1, c: j })];
    if (o && v !== null && dinhDang[kieu[j]]) o.z = dinhDang[kieu[j]];
  }));
  ws['!cols'] = cot.map(c => ({ wch: Math.max(8, Math.round(rongCot(c) / 7)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách lead');
  XLSX.writeFile(wb, `Danh-sach-lead-${todayISO()}.xlsx`);
}
```

- [ ] **Step 2: Kiểm tra tay trên app local:**
- Lọc Gói = Unique, sắp DT dự kiến giảm, ẩn cột Facebook → "Xuất Excel" → file `Danh-sach-lead-2026-10-14.xlsx` tải về thư mục Downloads của trình duyệt (đây là tải file do người dùng bấm trong app, không phải agent ghi file).
- Mở bằng Excel: đúng số dòng/thứ tự/cột đang hiện, không có cột Facebook; tiêu đề tiếng Việt có dấu; DT là số (cộng được bằng SUM), định dạng `30.000.000`/`30,000,000` theo máy; Ngày cưới là ngày thật `dd/mm/yyyy` (lọc ngày trong Excel được), không lệch 1 ngày.
- DevTools → Network → chặn `cdn.sheetjs.com` (Request blocking) → bấm Xuất → hiện alert "Không tải được công cụ xuất Excel…", bỏ chặn bấm lại → xuất được.
- Mở app lần đầu (chưa bấm Xuất): tab Network không có request tới `cdn.sheetjs.com`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Bang Danh sach: xuat Excel .xlsx dung dong va cot dang hien

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kiểm tra tổng và mở PR

**Files:**
- Modify: `CLAUDE.md` — thêm 1 dòng vào khối `Test` và 1 gạch đầu dòng ở "Cấu trúc lớn".

- [ ] **Step 1: Cập nhật `CLAUDE.md`**

Trong khối lệnh test, sau dòng `npm run test:zalo-tinh ...` thêm:

```
npm run test:bang        # test/bang-lead.test.ts — logic thuần bảng Danh sách (lọc/sắp xếp/xuất), KHÔNG chạm Firebase
```

Trong "Cấu trúc lớn", sau gạch đầu dòng `extension/lib/zalo-map.js` thêm:

```markdown
- **`web/bang-lead.js`** — logic thuần của view "Danh sách" (bảng lead kiểu Excel): định nghĩa cột, lọc,
  sắp xếp, dòng tổng, dòng xuất Excel, đọc cài đặt. `index.html` nạp bằng `<script type="module">`
  (`window.BangLead`); phần giao diện nằm ở khối `RENDER: DANH SÁCH` trong `index.html`. Thêm cột mới:
  thêm vào `COT` ở đây, rồi (nếu cần hiển thị đặc biệt) vào `oBangHtml()`.
```

- [ ] **Step 2: Chạy test không chạm Firebase**

Run: `npm run test:bang && npm run test:scope && npm run test:zalo && npm run test:zalo-tinh`
Expected: tất cả `0 FAIL` / exit 0.

- [ ] **Step 3: Chạy test hàm vẽ bong bóng (đảm bảo không làm vỡ `index.html`)**

Run: `npm run test:crm-chat`
Expected: qua (test này trích hàm từ `index.html`; nếu lỗi mạng/Chrome thì chạy lại trước khi kết luận).

- [ ] **Step 4: Kiểm tra hồi quy tay** — Pipeline: kéo thả thẻ, lọc gói/trạng thái, chip lọc nhanh; Dashboard và Hội thoại mở bình thường; console không lỗi.

- [ ] **Step 5: Commit + push + PR**

```bash
git add CLAUDE.md
git commit -m "Ghi chu CLAUDE.md ve view Danh sach va test:bang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin bang-danh-sach-lead
gh pr create --title "Them view Danh sach (bang lead kieu Excel)" --body "$(cat <<'EOF'
## Tóm tắt
- Mục mới **Danh sách** ở menu bên (điện thoại: trong tấm "Khác"): bảng tất cả lead kiểu Excel.
- Lọc + sắp xếp theo từng cột, ẩn/hiện + kéo độ rộng cột (nhớ trong trình duyệt), dòng tổng.
- Sửa trực tiếp trong ô (bấm đúp); đổi giai đoạn sang Won/Lost vẫn qua hộp xác nhận.
- Xuất `.xlsx` đúng dòng/cột đang hiện (SheetJS nạp khi bấm).
- Logic thuần ở `web/bang-lead.js`, test `npm run test:bang`.

Spec: `docs/superpowers/specs/2026-10-14-bang-danh-sach-lead-design.md`

## Kiểm thử
- [x] `npm run test:bang`, `test:scope`, `test:zalo`, `test:zalo-tinh`, `test:crm-chat`
- [x] Kiểm tra tay trên app local: xem, lọc, sửa ô, Won/Lost, xuất Excel, dark mode, khung điện thoại

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge PR = deploy production (Trường merge).
