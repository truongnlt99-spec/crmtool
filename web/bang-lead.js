// Logic thuần cho view "Danh sách" (bảng lead kiểu Excel) trong index.html.
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/bang-lead.test.ts).
// Những gì phụ thuộc app (trạng thái hẹn, tên giai đoạn, Zalo...) truyền vào qua `ctx`:
//   { leadStatus(lead), leadTypeOf(lead), stageName(id), coZalo(lead), tenVenue(lead) }

export const TRANG_THAI = ['Trễ hẹn', 'Hôm nay', 'Còn hạn', 'Chưa hẹn', 'Won', 'Lost'];

const ngay = v => (v ? String(v).slice(0, 10) : '');
const so = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const chuaXongWon = l => l.stage !== 'won' && l.stage !== 'lost';
// RTDB có thể trả mảng về dạng object {0:..,1:..}; chuỗi (tag cũ) coi là một phần tử.
export const mang = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : v ? [v] : []);

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
  { khoa:'venue',              tieuDe:'Venue',             kieu:'chon',  rong:160,                 lay: (l, c) => (c.tenVenue ? c.tenVenue(l) : '') },
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
  { khoa:'tags',               tieuDe:'Tag',               kieu:'chu',   rong:130,                 lay: l => mang(l.tags).join(', ') },
  { khoa:'todos',              tieuDe:'Việc',              kieu:'so',    rong:110,                 lay: l => { const t = mang(l.todos); return t.length ? t.filter(x => !x.done).length : null; } },
  { khoa:'lastNote',           tieuDe:'Ghi chú gần nhất',  kieu:'chu',   rong:220,                 lay: l => { const n = mang(l.notesList); return n.length ? String(n[n.length - 1].text || '') : ''; } },
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
        const t = mang(l.todos);
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
