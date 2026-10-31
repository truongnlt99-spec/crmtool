// Logic thuần cho việc theo dõi link sản phẩm gửi khách (bảng Sản phẩm + chi tiết lead trong index.html).
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/link-gui.test.ts) và Chrome (test/link-gui-ui.test.html).
// Spec: docs/superpowers/specs/2026-10-31-theo-doi-link-san-pham-design.md
// Dữ liệu: <aiRoot>/linkGui/<token> = { leadId, venueId, spId, tenSp, nenTang, taoLuc, soLanGui, soLanMo, tongGiay,
//                                      soLanTuongTac, lanDau, lanCuoi }

import { boDau } from './bang-lead.js';
import { esc } from './ho-so-ai.js';
import { linkHopLe, ID_HOP_LE } from './venue.js';

/** Số sản phẩm tối đa trong một lần tạo link. Khớp giới hạn của /api/link-gui và tool create_product_links. */
export const MAX_SP = 10;

export const TEN_NHAN = { quanTam: 'Quan tâm', xemQua: 'Xem qua', chuaMo: 'Chưa mở' };

// CHÉP Ở 2 NƠI: đây và api/mcp.ts (nhanLink) — sửa một chỗ thì sửa cả hai, test/link-gui.test.ts chạy cùng bộ ca.
export function nhanLink(s){
  if (!s || !s.soLanMo) return 'chuaMo';
  return s.soLanTuongTac > 0 || s.soLanMo >= 2 || s.tongGiay >= 60 ? 'quanTam' : 'xemQua';
}

const dsLink = linkGui => Object.entries(linkGui || {}).filter(([, d]) => d && typeof d === 'object');
const THU_TU_NHAN = { quanTam: 0, xemQua: 1, chuaMo: 2 };

/** Link của một lead: nhãn cao trước, cùng nhãn thì xem gần đây trước. */
export function dsTheoLead(linkGui, leadId){
  return dsLink(linkGui)
    .filter(([, d]) => d.leadId === leadId)
    .map(([token, d]) => ({ ...d, token, nhan: nhanLink(d) }))
    .sort((a, b) => THU_TU_NHAN[a.nhan] - THU_TU_NHAN[b.nhan] || (b.lanCuoi || 0) - (a.lanCuoi || 0));
}

/** Tổng hợp theo sản phẩm, đếm số KHÁCH (mỗi link = một khách + một sản phẩm), không đếm số lượt. */
export function thongKeSanPham(linkGui){
  const kq = {};
  for (const [, d] of dsLink(linkGui)) {
    const k = `${d.venueId}/${d.spId}`;
    const o = kq[k] || (kq[k] = { daGui: 0, khachMo: 0, tuongTac: 0 });
    o.daGui++;
    if (d.soLanMo > 0) o.khachMo++;
    if (d.soLanTuongTac > 0) o.tuongTac++;
  }
  return kq;
}

/** Trong các sản phẩm đang chọn (`venueId/spId`), lead này đã có link bao nhiêu mẫu. */
export function daGuiChoLead(linkGui, leadId, spKeys){
  const co = new Set(dsLink(linkGui).filter(([, d]) => d.leadId === leadId).map(([, d]) => `${d.venueId}/${d.spId}`));
  return spKeys.filter(k => co.has(k)).length;
}

/** Danh sách khách trong ô chọn: chưa gõ thì hiện khách đang chăm mới nhất, gõ thì tìm cả khách đã đóng. */
export function locKhach(leads, q, limit = 20){
  // Lead không có mốc cập nhật; createdAt chỉ tới ngày nên cùng ngày xếp theo id (L + thời gian tạo).
  const moiTruoc = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id).localeCompare(String(a.id));
  const k = boDau(q).trim();
  const ds = k
    ? leads.filter(l => boDau(l.name).includes(k) || String(l.phone || '').includes(k))
    : leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  return [...ds].sort(moiTruoc).slice(0, limit);
}

const ddmmyyyy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

/** Một dòng khách trong ô chọn. Chỉ tạo nút bấm khi id an toàn để đưa vào onclick. */
export function veDongKhach(lead, daGui, tongChon, tenGiaiDoan){
  const ngay = ddmmyyyy(lead.weddingDate);
  const phu = [tenGiaiDoan, ngay ? `Cưới ${ngay}` : ''].filter(Boolean).join(' · ');
  const noiDung = `<span class="lg-khach-giua"><b>${esc(lead.name)}</b><small>${esc(phu)}</small></span>` +
    (daGui ? `<span class="lg-tag">Đã gửi ${daGui}/${tongChon} mẫu</span>` : '');
  return /^[A-Za-z0-9_-]+$/.test(String(lead.id))
    ? `<button type="button" class="lg-khach" onclick="chonKhachGui('${lead.id}')">${noiDung}</button>`
    : `<div class="lg-khach">${noiDung}</div>`;
}

/** Một dòng kết quả ở màn lấy link. `item`: { tenSp, url?, daCo?, soLanMo?, dangTao?, loi? }. */
export function veDongLink(item, i){
  const ten = `<b>${esc(item.tenSp)}</b>`;
  if (item.dangTao) return `<div class="lg-link"><span class="lg-link-giua">${ten}<small>Đang tạo…</small></span></div>`;
  if (!item.url) return `<div class="lg-link"><span class="lg-link-giua">${ten}<small class="lg-loi">${esc(item.loi || 'Chưa tạo được link.')}</small></span>
    <button type="button" class="btn btn-ghost" onclick="thuLaiLink(${Number(i)})">Thử lại</button></div>`;
  const ghiChu = item.daCo ? `<small>Link đã gửi trước đó · ${item.soLanMo ? `khách mở ${Number(item.soLanMo)} lần` : 'khách chưa mở'}</small>` : '';
  return `<div class="lg-link"><span class="lg-link-giua">${ten}<small class="lg-url">${esc(item.url)}</small>${ghiChu}</span>
    <button type="button" class="btn btn-ghost" data-url="${esc(item.url)}" onclick="copyLinkGui(this)">Copy</button></div>`;
}

/** Đưa mẫu thuộc venue của lead lên đầu, giữ nguyên thứ tự còn lại. */
export function uuTienVenue(ds, venueId){
  return venueId ? [...ds.filter(x => x.venue.id === venueId), ...ds.filter(x => x.venue.id !== venueId)] : ds;
}

/** Một mẫu trong hộp chọn sản phẩm cho khách. Mẫu link hỏng không chọn được nên không hiện. */
export function veDongMau({ venue, sp }, chon){
  if (!linkHopLe(sp.link) || !ID_HOP_LE.test(venue.id) || !ID_HOP_LE.test(sp.id)) return '';
  return `<label class="vn-tick"><input type="checkbox" data-sp="${venue.id}/${sp.id}" ${chon ? 'checked' : ''} onchange="chonMauGui(this)">
    <span>${esc(sp.ten)}<br><small>${esc(venue.ten)}</small></span></label>`;
}

const hhmmNgay = ms => {
  const d = new Date(ms), hai = n => String(n).padStart(2, '0');
  return `${hai(d.getHours())}:${hai(d.getMinutes())} ${hai(d.getDate())}/${hai(d.getMonth() + 1)}`;
};

/** Khối "Sản phẩm đã gửi" trong chi tiết lead. `ds` lấy từ dsTheoLead. */
export function veKhoiDaGui(ds){
  if (!ds.length) return '<p class="lg-trong">Chưa gửi sản phẩm nào.</p>';
  return ds.map(d => {
    const phu = d.lanCuoi ? `Xem gần nhất ${hhmmNgay(d.lanCuoi)}` : d.taoLuc ? `Tạo link ${hhmmNgay(d.taoLuc)}` : '';
    const so = d.soLanMo ? `${Number(d.soLanMo)} lần mở · ${thoiLuong(d.tongGiay)}` : '';
    return `<div class="lg-link"><span class="lg-link-giua"><b>${esc(d.tenSp)}</b><small>${[so, phu].filter(Boolean).join(' · ')}</small></span>
      <span class="lg-nhan ${esc(d.nhan)}">${esc(TEN_NHAN[d.nhan])}</span></div>`;
  }).join('');
}

export const chuoiCopyTatCa = items => items.map(i => `${i.tenSp}\n${i.url}`).join('\n\n');

export function thoiLuong(giay){
  const s = Math.floor(giay || 0);
  if (!s) return '—';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}p${String(s % 60).padStart(2, '0')}s`;
}
