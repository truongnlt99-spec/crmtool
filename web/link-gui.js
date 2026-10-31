// Logic thuần cho việc theo dõi link sản phẩm gửi khách (bảng Sản phẩm + chi tiết lead trong index.html).
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/link-gui.test.ts) và Chrome (test/link-gui-ui.test.html).
// Spec: docs/superpowers/specs/2026-10-31-theo-doi-link-san-pham-design.md
// Dữ liệu: <aiRoot>/linkGui/<token> = { leadId, venueId, spId, tenSp, nenTang, taoLuc, soLanGui, soLanMo, tongGiay,
//                                      soLanTuongTac, lanDau, lanCuoi }

import { boDau } from './bang-lead.js';

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

/** Danh sách khách trong ô chọn: chưa gõ thì hiện khách đang chăm gần đây, gõ thì tìm cả khách đã đóng. */
export function locKhach(leads, q, limit = 20){
  const moiTruoc = (a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  const k = boDau(q).trim();
  const ds = k
    ? leads.filter(l => boDau(l.name).includes(k) || String(l.phone || '').includes(k))
    : leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  return [...ds].sort(moiTruoc).slice(0, limit);
}

export const chuoiCopyTatCa = items => items.map(i => `${i.tenSp}\n${i.url}`).join('\n\n');

export function thoiLuong(giay){
  const s = Math.floor(giay || 0);
  if (!s) return '—';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}p${String(s % 60).padStart(2, '0')}s`;
}
