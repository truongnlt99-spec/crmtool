// Logic thuần cho màn "Venue" (venue + sản phẩm theo tone) trong index.html.
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/venue.test.ts) và Chrome
// (test/venue-ui.test.html). Spec: docs/superpowers/specs/2026-10-28-venue-design.md
// Dữ liệu: <kho>/venues/<venueId> = { id, ten, taoLuc, sanPham: { <spId>: { id, ten, link, gia, tone: [toneId], taoLuc } } }
//          <kho>/toneMau/<toneId> = { id, ten, mau }   (chỉ tone người dùng thêm)

import { boDau, mang } from './bang-lead.js';
import { esc } from './ho-so-ai.js';

// CHÉP Ở 2 NƠI: đây và api/mcp.ts (TONE_MAC_DINH) — sửa một chỗ thì sửa cả hai.
export const TONE_MAC_DINH = [
  { id: 'trang',      ten: 'Trắng',          mau: '#F5F5F0' },
  { id: 'xanh-la',    ten: 'Xanh lá',        mau: '#4CAF7A' },
  { id: 'xanh-duong', ten: 'Xanh dương',     mau: '#4A8FD9' },
  { id: 'hong',       ten: 'Hồng',           mau: '#F29BB5' },
  { id: 'do',         ten: 'Đỏ',             mau: '#D9463B' },
  { id: 'vang',       ten: 'Vàng/Champagne', mau: '#E3C27A' },
  { id: 'tim',        ten: 'Tím',            mau: '#9B7BD1' },
  { id: 'be',         ten: 'Be/Nude',        mau: '#D9BFA3' },
  { id: 'pastel',     ten: 'Pastel',         mau: '#BFE3E0' },
  { id: 'den',        ten: 'Đen',            mau: '#2B2B2B' },
];

// Venue gợi ý, rút từ dữ liệu lead thật (lịch trình, ghi chú, báo giá) ngày 28/10/2026.
// bietDanh viết KHÔNG dấu, chữ thường. `cha` = tên venue chung của cùng thương hiệu: lead khớp
// chi nhánh thì bỏ venue chung (nhắc "White Palace" rồi "White Palace Phạm Văn Đồng" = một nơi).
// `chiGoiY` = vẫn gợi ý tạo venue nhưng không tính khi gắn lead (tên hay xuất hiện vì lý do khác).
export const VENUE_MAU = [
  { ten: 'White Palace', bietDanh: ['white palace', 'white palcae'] },
  { ten: 'White Palace Võ Văn Kiệt', cha: 'White Palace', bietDanh: ['white palace vo van kiet', 'white palace vvk'] },
  { ten: 'White Palace Phạm Văn Đồng', cha: 'White Palace', bietDanh: ['white palace pham van dong', 'white palace pvd'] },
  { ten: 'Pavillon', bietDanh: ['pavillon'] },
  { ten: 'Pavillon Tân Sơn Nhất', cha: 'Pavillon', bietDanh: ['pavillon tan son nhat'] },
  { ten: 'Pavillon C', cha: 'Pavillon', bietDanh: ['pavillon c'] },
  { ten: 'Capella', bietDanh: ['capella'] },
  { ten: 'Capella Park View', cha: 'Capella', bietDanh: ['capella park view', 'capella parkview'] },
  { ten: 'Capella 3/2 Q10', cha: 'Capella', bietDanh: ['capella 3/2', 'capella q10'] },
  { ten: 'Gem Center', bietDanh: ['gem center'] },
  { ten: 'Chloe Gallery', bietDanh: ['chloe gallery', 'chloe'] },
  { ten: 'Maison de Charme', bietDanh: ['maison de charme', 'maison de charm'] },
  { ten: 'Luxury Palace', bietDanh: ['luxury palace'] },
  { ten: 'Diamond Palace', bietDanh: ['diamond palace'] },
  { ten: 'Cát Đằng Palace', bietDanh: ['cat dang palace', 'cat dang'] },
  { ten: 'Nikko', bietDanh: ['nikko'] },
  { ten: 'InterContinental', bietDanh: ['intercontinental', 'intercontinetal'] },
  { ten: 'Lotte Sài Gòn', bietDanh: ['lotte'] },
  { ten: 'Mường Thanh', bietDanh: ['muong thanh'] },
  { ten: 'Thisky Hall', bietDanh: ['thisky hall', 'thisky'] },
  { ten: 'Gala Center', bietDanh: ['gala center'] },
  { ten: 'Adora Center', bietDanh: ['adora'] },
  { ten: 'Queen Plaza Kỳ Hoà', bietDanh: ['queen plaza'] },
  { ten: 'TTTC The One', bietDanh: ['tttc the one', 'the one'] },
  { ten: 'Riverside', bietDanh: ['riverside'] },
  { ten: 'The Rustic', bietDanh: ['the rustic'] },
  { ten: 'The Mira', bietDanh: ['the mira'] },
  { ten: 'Emmi Thủ Đức', bietDanh: ['emmi'] },
  { ten: 'Claris Thủ Đức', bietDanh: ['claris'] },
  { ten: 'Asian Phan Đăng Lưu', bietDanh: ['asian phan dang luu'] },
  { ten: 'Ái Huê', bietDanh: ['ai hue'] },
  { ten: 'Đồng Xanh Q6', bietDanh: ['dong xanh'] },
  { ten: 'Thanh Tùng Dĩ An', bietDanh: ['thanh tung di an'] },
  { ten: 'Maxim', bietDanh: ['maxim'] },
  { ten: 'Hoa viên Tám Quỳnh', bietDanh: ['tam quynh'] },
  { ten: 'Sân Golf Sông Bé', bietDanh: ['golf song be'] },
  { ten: 'Vũ Garden', bietDanh: ['vu garden'], chiGoiY: true },   // chỗ chụp Pre Wedding, Trân hay gửi mẫu ở đây -> không dùng để gắn lead
  { ten: 'Merastic', bietDanh: ['merastic'] },
  { ten: 'Trống Đồng Long Biên', bietDanh: ['trong dong long bien'] },
  { ten: 'Mipec', bietDanh: ['mipec'] },
  { ten: 'An Lâm Retreats', bietDanh: ['an lam retreat'] },
  { ten: 'Naman Retreat', bietDanh: ['naman'] },
  { ten: 'Amor Resort', bietDanh: ['amor resort'] },
  { ten: 'Sala Beach Tuy Hoà', bietDanh: ['sala beach'] },
  { ten: 'Pullman Phú Quốc', bietDanh: ['pullman phu quoc'] },
  { ten: 'Tui Blue', bietDanh: ['tui blue'] },
  { ten: 'Đại Nam Boutique Hotel', bietDanh: ['dai nam boutique'] },
];

export const ID_HOP_LE = /^[A-Za-z0-9_-]{1,80}$/;

/** Tone mặc định + tone người dùng thêm (tone thêm trùng id mặc định thì bỏ). */
export function danhSachTone(toneMau){
  const them = mang(toneMau).filter(t => t && ID_HOP_LE.test(t.id || '') && t.ten && !TONE_MAC_DINH.some(m => m.id === t.id));
  // mau đi thẳng vào style="" -> chỉ nhận #rrggbb
  return [...TONE_MAC_DINH, ...them.map(t => ({ id: t.id, ten: String(t.ten), mau: /^#[0-9a-f]{6}$/i.test(t.mau) ? t.mau : '#cccccc' }))];
}

export const linkHopLe = s => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim()) && s.length <= 1000;

/** null = hợp lệ; chuỗi = lý do sai. */
export function kiemTraSanPham(sp, toneIds){
  if (!sp || typeof sp.ten !== 'string' || !sp.ten.trim() || sp.ten.length > 200) return 'Tên sản phẩm phải có, tối đa 200 ký tự';
  if (!linkHopLe(sp.link)) return 'Link phải bắt đầu bằng http:// hoặc https://';
  if (sp.gia != null && (typeof sp.gia !== 'string' || sp.gia.length > 200)) return 'Giá/gói tối đa 200 ký tự';
  const tone = mang(sp.tone);
  if (!tone.length) return 'Chọn ít nhất một tone';
  const sai = tone.filter(t => !toneIds.includes(t));
  return sai.length ? `Tone không có trong danh sách: ${sai.join(', ')}` : null;
}

const dsVenue = venues => mang(venues).filter(v => v && v.id);
const dsSanPham = v => mang(v.sanPham).filter(sp => sp && sp.id);

/** Lọc sản phẩm trên mọi venue (hoặc một venue). tone = khớp BẤT KỲ tone đã chọn. Mới nhất trước. */
export function locSanPham(venues, { q = '', tone = [], venueId = null } = {}){
  const tim = boDau(q);
  const ra = [];
  for (const v of dsVenue(venues)){
    if (venueId && v.id !== venueId) continue;
    const tenVenue = boDau(v.ten);
    for (const sp of dsSanPham(v)){
      if (tone.length && !mang(sp.tone).some(t => tone.includes(t))) continue;
      if (tim && !(tenVenue.includes(tim) || boDau(sp.ten).includes(tim) || boDau(sp.gia).includes(tim))) continue;
      ra.push({ venue: v, sp });
    }
  }
  return ra.sort((a, b) => String(b.sp.taoLuc || '').localeCompare(String(a.sp.taoLuc || '')));
}

export function timVenueTheoTen(venues, ten){
  const k = boDau(ten);
  return k ? dsVenue(venues).find(v => boDau(v.ten) === k) || null : null;
}

export function soLeadTheoVenue(leads){
  const dem = {};
  for (const l of mang(leads)) if (l && l.venueId) dem[l.venueId] = (dem[l.venueId] || 0) + 1;
  return dem;
}

/** Chữ của lead để dò tên venue: lịch trình + ghi chú + địa điểm báo giá. */
function chuCuaLead(l){
  return boDau([
    l.schedule,
    ...mang(l.notesList).map(n => n && n.text),
    ...mang(l.baoGia).map(b => b && b.diaDiem),
  ].filter(Boolean).join('\n'));
}

/** Tên venue mẫu khớp trong chữ (đã bỏ dấu). Khớp dài nhất cho cùng đoạn chữ; có chi nhánh thì bỏ venue chung. */
export function venueTrongChu(chu, mau = VENUE_MAU){
  const cacKhop = [];
  for (const m of mau){
    for (const b of m.bietDanh){
      const re = new RegExp(`(^|[^a-z0-9])${b.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=[^a-z0-9]|$)`, 'g');
      for (const x of chu.matchAll(re)){
        const dau = x.index + x[1].length;
        cacKhop.push({ ten: m.ten, dau, cuoi: dau + b.length });
      }
    }
  }
  cacKhop.sort((a, b) => (b.cuoi - b.dau) - (a.cuoi - a.dau));
  const giu = [];
  for (const k of cacKhop){
    if (!giu.some(g => k.dau < g.cuoi && g.dau < k.cuoi)) giu.push(k);
  }
  const ten = new Set(giu.map(k => k.ten));
  for (const m of mau) if (m.cha && ten.has(m.ten)) ten.delete(m.cha);
  return [...ten].sort((a, b) => a.localeCompare(b));
}

/**
 * Gợi ý venue từ lead. goiY: venue chưa có trong kho + các lead sẽ được gắn (khớp đúng 1 venue,
 * chưa có venueId). canChonTay: lead chưa có venueId mà khớp ≥2 venue — không tự gắn.
 */
export function khopVenueMau(leads, venues, mau = VENUE_MAU){
  const goiY = new Map();
  const canChonTay = [];
  for (const l of mang(leads)){
    if (!l || !l.id) continue;
    const ten = venueTrongChu(chuCuaLead(l), mau);
    if (!ten.length) continue;
    const chuaGan = !l.venueId;
    const tenGan = ten.filter(t => !mau.some(m => m.ten === t && m.chiGoiY));
    if (tenGan.length > 1 && chuaGan) canChonTay.push({ leadId: l.id, ten: tenGan });
    for (const t of ten){
      if (timVenueTheoTen(venues, t)) continue;
      if (!goiY.has(t)) goiY.set(t, { ten: t, leadIds: [], nhacDen: 0 });
      const g = goiY.get(t);
      g.nhacDen++;
      if (tenGan.length === 1 && tenGan[0] === t && chuaGan) g.leadIds.push(l.id);
    }
  }
  return { goiY: [...goiY.values()].sort((a, b) => b.nhacDen - a.nhacDen || a.ten.localeCompare(b.ten)), canChonTay };
}

const mauAnToan = m => (/^#[0-9a-f]{6}$/i.test(m) ? m : '#cccccc');
const ngayNgan = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };

/** Một dòng <tr> của bảng sản phẩm. Mọi chữ đã escape; link chỉ thành thẻ <a> / nút Copy khi là http(s). */
export function veDongSanPham(venue, sp, tones, { chiXem = false, chon = false, thongKe = null } = {}){
  const theoId = Object.fromEntries(tones.map(t => [t.id, t]));
  const tone = mang(sp.tone).map(id => theoId[id]).filter(Boolean)
    .map(t => `<span class="vn-tone"><span class="vn-cham" style="background:${mauAnToan(t.mau)}"></span>${esc(t.ten)}</span>`).join('');
  const ok = linkHopLe(sp.link), link = ok ? esc(sp.link.trim()) : '';
  const idOk = ID_HOP_LE.test(venue.id) && ID_HOP_LE.test(sp.id);
  const guiDuoc = !chiXem && ok && idOk;
  const khoa = `${venue.id}/${sp.id}`;
  const thao = (guiDuoc ? `<button type="button" class="vn-lk" onclick="moChonKhach(['${khoa}'])">Gửi khách</button>` : '') +
    (ok ? `<button type="button" class="vn-lk" data-link="${link}" onclick="copyLinkSanPham(this)">Copy link</button>` : '') +
    (chiXem || !idOk ? '' :
      `<button type="button" class="vn-lk" onclick="moSuaSanPham('${venue.id}','${sp.id}')">Sửa</button>` +
      `<button type="button" class="vn-lk xoa" onclick="xoaSanPham('${venue.id}','${sp.id}')">Xoá</button>`);
  const oTick = chiXem ? '' : `<td class="vn-c-chon">${guiDuoc
    ? `<input type="checkbox" class="vn-chon" data-sp="${khoa}" aria-label="Chọn ${esc(sp.ten)}" ${chon ? 'checked' : ''} onchange="chonSanPham(this)">` : ''}</td>`;
  const tk = thongKe || {};
  return `<tr>${oTick}
    <td class="vn-c-ten">${ok ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${esc(sp.ten)}</a>` : esc(sp.ten)}</td>
    <td>${esc(venue.ten)}</td>
    <td>${tone}</td>
    <td>${sp.gia ? esc(sp.gia) : '<span class="vn-c-mo">—</span>'}</td>
    <td>${ngayNgan(sp.taoLuc)}</td>
    <td class="so">${tk.daGui || 0}</td>
    <td class="so">${tk.khachMo || 0}</td>
    <td class="so">${tk.tuongTac || 0}</td>
    <td class="vn-c-thao">${thao}</td>
  </tr>`;
}

/** id mới theo kiểu app (tiền tố + thời gian + ngẫu nhiên). */
export const taoId = tienTo => tienTo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
