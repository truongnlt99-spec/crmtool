// Logic thuần cho việc theo dõi link sản phẩm gửi khách (bảng Sản phẩm + chi tiết lead trong index.html).
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/link-gui.test.ts) và Chrome (test/link-gui-ui.test.html).
// Spec: docs/superpowers/specs/2026-10-31-theo-doi-link-san-pham-design.md
// Dữ liệu: <aiRoot>/linkGui/<token> = { leadId, venueId, spId, tenSp, nenTang, taoLuc, guiLuc, soLanGui, soLanMo, lanDau, lanCuoi }
//          <aiRoot>/linkGuiNgay/<yyyy-mm-dd>/mo = lượt click trong ngày (giờ Việt Nam)

import { boDau } from './bang-lead.js';
import { esc } from './ho-so-ai.js';
import { linkHopLe, ID_HOP_LE } from './venue.js';

/** Số sản phẩm tối đa trong một lần tạo link. Khớp giới hạn của /api/link-gui và tool create_product_links. */
export const MAX_SP = 10;

export const TEN_NHAN = { quanTam: 'Quan tâm', xemQua: 'Đã mở', chuaMo: 'Chưa mở' };

// CHÉP Ở 2 NƠI: đây và api/mcp.ts (nhanLink) — sửa một chỗ thì sửa cả hai, test/link-gui.test.ts chạy cùng bộ ca.
export function nhanLink(s){
  if (!s || !s.soLanMo) return 'chuaMo';
  return s.soLanMo >= 2 ? 'quanTam' : 'xemQua';
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
    const o = kq[k] || (kq[k] = { daGui: 0, khachMo: 0, luotClick: 0 });
    o.daGui++;
    if (d.soLanMo > 0) o.khachMo++;
    o.luotClick += d.soLanMo || 0;
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
    const so = d.soLanMo ? `${Number(d.soLanMo)} lần mở` : '';
    return `<div class="lg-link"><span class="lg-link-giua"><b>${esc(d.tenSp)}</b><small>${[so, phu].filter(Boolean).join(' · ')}</small></span>
      <span class="lg-nhan ${esc(d.nhan)}">${esc(TEN_NHAN[d.nhan])}</span></div>`;
  }).join('');
}

/** Một mẫu chỉ copy link để Zalo hiện thẻ ảnh; nhiều mẫu kèm tên để Trân biết link nào là mẫu nào. */
export const chuoiCopyTatCa = items => (items.length === 1 ? items[0].url : items.map(i => `${i.tenSp}\n${i.url}`).join('\n\n'));

/** Khách vừa nhận link gần đây nhất, mới gửi trước. Trân thường gửi tiếp cho đúng khách vừa rồi. */
export function khachVuaGui(linkGui, limit = 3){
  const ds = dsLink(linkGui).map(([, d]) => d).sort((a, b) => (b.guiLuc || 0) - (a.guiLuc || 0));
  return [...new Set(ds.map(d => d.leadId))].slice(0, limit);
}

export function tongQuan(linkGui){
  const ds = dsLink(linkGui).map(([, d]) => d);
  return {
    daGui: ds.length,
    khachNhan: new Set(ds.map(d => d.leadId)).size,
    luotClick: ds.reduce((n, d) => n + (d.soLanMo || 0), 0),
    linkDaMo: ds.filter(d => d.soLanMo > 0).length,
  };
}

/** Sản phẩm được click nhiều nhất; bằng nhau thì sản phẩm gửi nhiều hơn đứng trước. */
export function topSanPham(linkGui, limit = 5){
  const kq = {};
  for (const [, d] of dsLink(linkGui)) {
    const o = kq[`${d.venueId}/${d.spId}`] ||= { tenSp: d.tenSp, daGui: 0, khachMo: 0, luotClick: 0 };
    o.daGui++;
    o.luotClick += d.soLanMo || 0;
    if (d.soLanMo > 0) o.khachMo++;
  }
  return Object.values(kq).sort((a, b) => b.luotClick - a.luotClick || b.daGui - a.daGui).slice(0, limit);
}

/** Link khách vừa bấm, mới nhất trước. */
export function hoatDongGanDay(linkGui, limit = 6){
  return dsLink(linkGui)
    .filter(([, d]) => d.soLanMo > 0)
    .map(([token, d]) => ({ ...d, token }))
    .sort((a, b) => (b.lanCuoi || 0) - (a.lanCuoi || 0))
    .slice(0, limit);
}

/** `n` ngày gần nhất tới `homNay` (yyyy-mm-dd), ngày không có click là 0. */
export function chuoiNgay(linkGuiNgay, homNay, n = 14){
  const moc = Date.parse(`${homNay}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const ngay = new Date(moc - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { ngay, mo: (linkGuiNgay && linkGuiNgay[ngay] && linkGuiNgay[ngay].mo) || 0 };
  });
}

const ddmm = ngay => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}`;

function veBieuDoNgay(ngay){
  const tong = ngay.reduce((n, d) => n + d.mo, 0), lonNhat = Math.max(...ngay.map(d => d.mo));
  const cot = ngay.map(d => {
    const nhan = `${ddmm(d.ngay)}: ${d.mo} lượt click`;
    const cao = d.mo ? Math.max(4, Math.round(d.mo / lonNhat * 100)) : 0;
    return `<div class="lg-cot" style="--h:${cao}%" tabindex="0" role="img" aria-label="${nhan}" data-tip="${nhan}">
      ${d.mo === lonNhat && d.mo ? `<b>${d.mo}</b>` : ''}<span></span></div>`;
  }).join('');
  return `<section class="lg-the"><div class="lg-the-dau"><h3>Lượt click ${ngay.length} ngày qua</h3><span>${tong} lượt</span></div>
    ${tong ? `<div class="lg-bieu-do">${cot}</div>
      <div class="lg-truc"><span>${ddmm(ngay[0].ngay)}</span><span>Hôm nay</span></div>`
      : '<p class="lg-trong">Chưa có lượt click nào trong khoảng này.</p>'}</section>`;
}

/** Màn Thống kê trong Venue. `tenKhach(leadId)` trả tên lead hoặc rỗng nếu lead đã xoá. */
export function veThongKe({ linkGui, linkGuiNgay, homNay, tenKhach, chiXem = false }){
  const t = tongQuan(linkGui);
  if (!t.daGui) {
    return `<div class="bang-trong">Chưa gửi link sản phẩm nào.
      <span>Số liệu sẽ hiện ở đây sau khi gửi link cho khách.</span>
      ${chiXem ? '' : `<button type="button" class="btn btn-primary" onclick="doiTabVenue('sp')">Chọn sản phẩm để gửi</button>`}</div>`;
  }
  const o = (ten, so, phu) => `<div class="lg-o"><span>${ten}</span><b>${so}</b><small>${phu}</small></div>`;
  const dongSp = topSanPham(linkGui).map(x => `<tr><td class="vn-c-ten">${esc(x.tenSp)}</td><td class="so">${x.daGui}</td><td class="so">${x.khachMo}</td><td class="so">${x.luotClick}</td></tr>`).join('');
  const dongKhach = hoatDongGanDay(linkGui).map(d => {
    const ten = tenKhach(d.leadId);
    const than = `<span class="lg-link-giua"><b>${esc(ten || '(lead đã xoá)')}</b><small>${esc(d.tenSp)}</small></span>
      <span class="lg-khi">${Number(d.soLanMo)} lần · ${d.lanCuoi ? hhmmNgay(d.lanCuoi) : ''}</span>`;
    return ten && /^[A-Za-z0-9_-]+$/.test(String(d.leadId))
      ? `<button type="button" class="lg-khach" onclick="openLead('${d.leadId}')">${than}</button>` : `<div class="lg-khach">${than}</div>`;
  }).join('');
  return `<div class="lg-tk">
    <div class="lg-o-luoi">
      ${o('Sản phẩm đã gửi', t.daGui, 'link đã tạo cho khách')}
      ${o('Khách đã nhận', t.khachNhan, 'khách có ít nhất một link')}
      ${o('Lượt click', t.luotClick, 'tổng số lần mở link')}
      ${o('Tỉ lệ mở', `${Math.round(t.linkDaMo / t.daGui * 100)}%`, `${t.linkDaMo}/${t.daGui} link được mở`)}
    </div>
    ${veBieuDoNgay(chuoiNgay(linkGuiNgay, homNay))}
    <div class="lg-tk-hai">
      <section class="lg-the"><div class="lg-the-dau"><h3>Sản phẩm được click nhiều</h3></div>
        <table class="bang vn-bang"><thead><tr><th>Sản phẩm</th><th class="so">Đã gửi</th><th class="so">Khách mở</th><th class="so">Lượt click</th></tr></thead><tbody>${dongSp}</tbody></table></section>
      <section class="lg-the"><div class="lg-the-dau"><h3>Khách vừa mở</h3></div>
        ${dongKhach || '<p class="lg-trong">Chưa có khách nào mở link.</p>'}</section>
    </div></div>`;
}
