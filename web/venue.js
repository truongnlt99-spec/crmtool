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
  { ten: 'Vũ Garden', bietDanh: ['vu garden'] },
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
    if (ten.length > 1 && chuaGan) canChonTay.push({ leadId: l.id, ten });
    for (const t of ten){
      if (timVenueTheoTen(venues, t)) continue;
      if (!goiY.has(t)) goiY.set(t, { ten: t, leadIds: [], nhacDen: 0 });
      const g = goiY.get(t);
      g.nhacDen++;
      if (ten.length === 1 && chuaGan) g.leadIds.push(l.id);
    }
  }
  return { goiY: [...goiY.values()].sort((a, b) => b.nhacDen - a.nhacDen || a.ten.localeCompare(b.ten)), canChonTay };
}

const ICON = {
  ghim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  gia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  mo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
  sua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  xoa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
};
const mauAnToan = m => (/^#[0-9a-f]{6}$/i.test(m) ? m : '#cccccc');

/** Thẻ một sản phẩm: dải màu tone ở đầu thẻ, tên (link), venue, giá, tone, nút Copy link + icon mở/sửa/xoá.
 *  Mọi chữ đã escape; link chỉ thành thẻ <a> khi là http(s). */
export function veSanPham(venue, sp, tones, { chiXem = false, hienVenue = true } = {}){
  const theoId = Object.fromEntries(tones.map(t => [t.id, t]));
  const ds = mang(sp.tone).map(id => theoId[id]).filter(Boolean);
  const dai = ds.map(t => `<span style="background:${mauAnToan(t.mau)}"></span>`).join('');
  const cham = ds.map(t => `<span class="vn-tone"><span class="vn-cham" style="background:${mauAnToan(t.mau)}"></span>${esc(t.ten)}</span>`).join('');
  const ok = linkHopLe(sp.link), link = ok ? esc(sp.link.trim()) : '';
  const idOk = ID_HOP_LE.test(venue.id) && ID_HOP_LE.test(sp.id);
  const sua = chiXem || !idOk ? '' :
    `<button class="vn-icon" onclick="moSuaSanPham('${venue.id}','${sp.id}')" title="Sửa" aria-label="Sửa sản phẩm">${ICON.sua}</button>` +
    `<button class="vn-icon xoa" onclick="xoaSanPham('${venue.id}','${sp.id}')" title="Xoá" aria-label="Xoá sản phẩm">${ICON.xoa}</button>`;
  return `<article class="vn-sp">
    <div class="vn-sp-mau" aria-hidden="true">${dai}</div>
    <div class="vn-sp-than">
      <h4 class="vn-sp-ten">${ok ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${esc(sp.ten)}</a>` : esc(sp.ten)}</h4>
      ${hienVenue ? `<div class="vn-sp-venue">${ICON.ghim}${esc(venue.ten)}</div>` : ''}
      ${sp.gia ? `<div class="vn-sp-gia">${ICON.gia}${esc(sp.gia)}</div>` : ''}
      <div class="vn-sp-tones">${cham}</div>
    </div>
    <div class="vn-sp-nut">
      ${ok ? `<button class="vn-copy" data-link="${link}" onclick="copyLinkSanPham(this)">${ICON.copy}<span>Copy link</span></button>
      <a class="vn-icon" href="${link}" target="_blank" rel="noopener noreferrer" title="Mở bài viết" aria-label="Mở bài viết">${ICON.mo}</a>` : ''}
      ${sua}
    </div>
  </article>`;
}

/** id mới theo kiểu app (tiền tố + thời gian + ngẫu nhiên). */
export const taoId = tienTo => tienTo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
