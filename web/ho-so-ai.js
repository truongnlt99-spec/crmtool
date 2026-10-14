// Logic thuần cho hồ sơ khách AI + hàng chờ đề xuất trong index.html.
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/ho-so-ai.test.ts) và Chrome
// (test/ho-so-ai.test.html). Spec: docs/superpowers/specs/2026-10-14-ho-so-khach-ai-design.md

// CHÉP Ở 2 NƠI: đây và api/mcp.ts (FIELD_WHITELIST, PACKAGES, kiemTraGiaTriO, giaTriBang).
// Sửa một bên thì sửa cả hai — test chạy cùng bộ ca trên cả hai bản.
export const FIELD_WHITELIST = [
  'weddingDate', 'package', 'revenueExpected', 'expectedCloseMonth',
  'phone', 'facebook', 'schedule', 'persona', 'objection',
];
export const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'];
export const NHAN_O = {
  weddingDate: 'Ngày cưới', package: 'Gói dịch vụ', revenueExpected: 'Doanh thu dự kiến',
  expectedCloseMonth: 'Tháng chốt dự kiến', phone: 'SĐT', facebook: 'Facebook',
  schedule: 'Lịch trình', persona: 'Chân dung khách hàng', objection: 'Objection',
};
// id đề xuất / convId / msgId được phép đưa vào onclick
export const ID_HOP_LE = /^[A-Za-z0-9_-]{1,80}$/;

export function kiemTraGiaTriO(field, v){
  const chuoi = (min, max) =>
    typeof v === 'string' && v.trim().length >= min && v.length <= max ? null : `"${field}" phải là chữ ${min}–${max} ký tự`;
  switch (field){
    case 'weddingDate': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Ngày cưới phải dạng YYYY-MM-DD';
      const d = new Date(v + 'T00:00:00Z');
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? null : `Ngày ${v} không có thật`;
    }
    case 'package': return PACKAGES.includes(v) ? null : `Gói phải là một trong: ${PACKAGES.join(', ')}`;
    case 'revenueExpected': return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? null : 'Doanh thu dự kiến phải là số nguyên ≥ 0';
    case 'expectedCloseMonth': return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? null : 'Tháng chốt phải dạng YYYY-MM';
    case 'phone': case 'facebook': return chuoi(1, 100);
    case 'schedule': case 'persona': case 'objection': return chuoi(1, 2000);
    default: return `Ô "${field}" không nằm trong danh sách được đề xuất`;
  }
}

export function giaTriBang(a, b){
  const rong = x => x === null || x === undefined || x === '';
  if (rong(a) && rong(b)) return true;
  if (rong(a) || rong(b)) return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

export function esc(s){
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

const mang = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const ngayVN = iso => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };

export function hienGiaTri(field, v){
  if (v === null || v === undefined || v === '') return '(trống)';
  if (field === 'weddingDate') return ngayVN(v);
  if (field === 'expectedCloseMonth'){ const [y, m] = String(v).split('-'); return `${m}/${y}`; }
  if (field === 'revenueExpected') return Number(v).toLocaleString('vi-VN').replace(/,/g, '.') + ' đ';
  return String(v);
}

/** Đề xuất đã nằm trong lead THEO BẢN MÁY CHỦ chưa (để đánh dấu duyet đúng thứ tự). */
export function daApDung(p, leadMayChu){
  if (!p || !leadMayChu) return false;
  if (p.type === 'todo') return mang(leadMayChu.todos).some(t => t && t.tuDeXuat === p.id);
  const hienTai = leadMayChu[p.field];
  return giaTriBang(hienTai, p.newValue) || (p.giaTriDuyet !== undefined && giaTriBang(hienTai, p.giaTriDuyet));
}

export function trangThaiLoiHua(h, homNay){
  if (h.trangThai === 'xong') return 'xong';
  return h.han && h.han < homNay ? 'quaHan' : 'mo';
}

export function demTinMoi(msgsTheoConv, cursorAt){
  let n = 0;
  for (const ds of Object.values(msgsTheoConv || {})) {
    if (!Array.isArray(ds)) continue;
    n += ds.filter(m => Number(m.at) > (cursorAt || 0)).length;
  }
  return n;
}

const goi = (ham, ...ids) => ids.every(i => ID_HOP_LE.test(String(i))) ? `onclick="${ham}(${ids.map(i => `'${i}'`).join(',')})"` : '';

// Chip nguồn: số nhỏ ①②…, câu trích nằm trong title; bấm -> nhảy tới tin.
function chipNguon(evs, coTin){
  return mang(evs).map((e, i) => {
    if (!coTin(e.convId, e.msgId)) return `<span class="hs-nguon mat" title="nguồn không còn: ${esc(e.quote)}" aria-label="nguồn không còn">×</span>`;
    return `<button type="button" class="hs-nguon" title="${esc(e.quote)}" aria-label="Xem tin: ${esc(e.quote)}" ${goi('xemNguon', e.convId, e.msgId)}>${i + 1}</button>`;
  }).join('');
}

function oSua(p){
  const v = p.newValue ?? '';
  if (p.field === 'package') {
    return `<select class="field-input">${PACKAGES.map(g => `<option value="${esc(g)}" ${g === v ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
  }
  if (p.field === 'weddingDate') return `<input class="field-input" type="date" value="${esc(v)}">`;
  if (p.field === 'expectedCloseMonth') return `<input class="field-input" type="month" value="${esc(v)}">`;
  if (p.field === 'revenueExpected') return `<input class="field-input" type="number" min="0" step="1" value="${esc(v)}">`;
  if (['schedule', 'persona', 'objection'].includes(p.field)) return `<textarea class="field-input">${esc(v)}</textarea>`;
  return `<input class="field-input" type="text" value="${esc(v)}">`;
}

/**
 * Một đề xuất = một dòng gọn (tiêu đề + nút ✓ duyệt nhanh). Bấm dòng -> mở chi tiết
 * (giá trị hiện tại, lý do, nguồn, Duyệt / Sửa rồi duyệt / Bỏ). `mo` = đang mở sẵn.
 */
export function veTheDeXuat(p, lead, mo = false){
  const idOk = ID_HOP_LE.test(String(p.id));
  const tom = p.type === 'todo'
    ? `Việc: ${esc(p.todoText)}${p.due ? ` · <span class="dx-han">hạn ${esc(ngayVN(p.due))}</span>` : ''}`
    : `${esc(NHAN_O[p.field] || p.field)} → <b>${esc(hienGiaTri(p.field, p.newValue))}</b>`;
  const daDoi = p.type === 'field' && lead && !giaTriBang(lead[p.field], p.oldValue);
  const hienTai = p.type === 'field' ? `<div class="dx-dong-tt"><span class="dx-nhan">Hiện tại</span>${esc(hienGiaTri(p.field, lead ? lead[p.field] : p.oldValue))}</div>` : '';
  const nut = idOk ? `
      <div class="dx-nut">
        <button type="button" class="btn btn-primary btn-sm" ${goi('duyetDeXuat', p.id)}>Duyệt</button>
        ${p.type === 'field' ? `<button type="button" class="btn btn-secondary btn-sm" ${goi('moSuaDeXuat', p.id)}>Sửa rồi duyệt</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" ${goi('boDeXuat', p.id)}>Bỏ</button>
      </div>
      ${p.type === 'field' ? `<div class="dx-sua" hidden>${oSua(p)}<button type="button" class="btn btn-primary btn-sm" onclick="duyetDeXuatSua('${p.id}', this)">Lưu &amp; duyệt</button></div>` : ''}` : '';
  return `
  <div class="dx-dong${mo ? ' mo' : ''}" data-dx="${idOk ? p.id : ''}">
    <div class="dx-hang" ${goi('moDongDeXuat', p.id)}>
      <span class="dx-loai ${p.type === 'todo' ? 'viec' : 'o'}" aria-hidden="true">${p.type === 'todo' ? '✓' : '✎'}</span>
      <span class="dx-tom">${tom}</span>
      ${daDoi ? '<span class="dx-co-doi" title="Ô này đã đổi từ lúc Claude đề xuất">!</span>' : ''}
      ${idOk ? `<button type="button" class="dx-nhanh" title="Duyệt nhanh" aria-label="Duyệt nhanh" onclick="event.stopPropagation(); duyetDeXuat('${p.id}')">✓</button>` : ''}
      <span class="dx-mui" aria-hidden="true">▾</span>
    </div>
    <div class="dx-chi-tiet">
      ${hienTai}
      ${daDoi ? `<div class="dx-canh-bao">Ô này đã đổi từ lúc Claude đề xuất</div>` : ''}
      <div class="dx-ly-do"><span class="dx-nhan">Lý do</span>${esc(p.reason)} ${chipNguon(p.evidence, () => true)}</div>
      ${nut}
    </div>
  </div>`;
}

const NHAN_NONG = { nong: 'Nóng', am: 'Ấm', nguoi: 'Nguội' };
const NHOM = [
  ['nhuCau', 'hs-nhu-cau', 'Nhu cầu'],
  ['nganSach', 'hs-ngan-sach', 'Ngân sách'],
  ['nguoiQuyetDinh', 'hs-nguoi-qd', 'Người quyết định'],
  ['objection', 'hs-objection', 'Objection'],
];

function thoiGianTruoc(iso, now){
  const t = Date.parse(iso);
  if (!isFinite(t)) return '';
  const phut = Math.max(0, Math.round((now - t) / 60000));
  if (phut < 1) return 'vừa xong';
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.round(phut / 60);
  if (gio < 24) return `${gio} giờ trước`;
  return `${Math.round(gio / 24)} ngày trước`;
}

/** Phần nằm trên thanh tiêu đề khối (vẫn thấy khi thu gọn): chip độ nóng + lúc cập nhật. */
export function veTomTatHoSo(brief, ctx){
  if (!brief) return '';
  const nong = brief.doNong || {};
  const luc = brief.updatedAt ? thoiGianTruoc(brief.updatedAt, ctx.now ?? Date.now()) : '';
  return `<span class="hs-nong ${esc(nong.muc || '')}" title="${esc(nong.lyDo || '')}">${esc(NHAN_NONG[nong.muc] || '—')}</span>${luc ? `<span class="hs-luc">${esc(luc)}</span>` : ''}`;
}

const THU_TU_HUA = { quaHan: 0, mo: 1, xong: 2 };

export function veHoSo(brief, ctx){
  if (!brief) {
    const cau = `Cập nhật hồ sơ khách ${ctx.tenLead || ''}`;
    return `
    <div class="hs-trong">
      <div class="empty-title">Chưa có hồ sơ</div>
      <div class="empty-sub">Nhờ Claude đọc hội thoại và lập hồ sơ. Dán câu này vào Claude:</div>
      <button type="button" class="hs-cau-mau" data-cau="${esc(cau)}" onclick="navigator.clipboard && navigator.clipboard.writeText(this.dataset.cau)">${esc(cau)}</button>
    </div>`;
  }
  const nong = brief.doNong || {};
  const nhom = NHOM.map(([k, cls, nhan]) => {
    const g = brief[k] || { text: 'chưa rõ', evidence: [] };
    const chuaRo = String(g.text || '').trim().toLowerCase() === 'chưa rõ';
    return `<div class="hs-nhom ${cls}${chuaRo ? ' chua-ro' : ''}"><div class="hs-nhan">${esc(nhan)}</div><div class="hs-chu">${esc(g.text)}${chipNguon(g.evidence, ctx.coTin)}</div></div>`;
  }).join('');
  const hua = mang(brief.loiHua)
    .map(h => ({ h, tt: trangThaiLoiHua(h, ctx.homNay) }))
    .sort((a, b) => THU_TU_HUA[a.tt] - THU_TU_HUA[b.tt] || String(a.h.han || '9').localeCompare(String(b.h.han || '9')));
  const dsHua = hua.map(({ h, tt }) => {
    const han = tt === 'xong' ? 'xong' : h.han ? `${tt === 'quaHan' ? 'quá hạn ' : ''}${esc(ngayVN(h.han).slice(0, 5))}` : 'không hạn';
    return `<div class="hs-hua ${tt}"><span class="hs-ai ${h.ai === 'khach' ? 'khach' : 'minh'}">${h.ai === 'khach' ? 'Khách' : 'Mình'}</span><span class="hs-hua-nd">${esc(h.noiDung)}${chipNguon(h.evidence, ctx.coTin)}</span><span class="hs-han">${han}</span></div>`;
  }).join('');
  return `
  ${brief.buocTiep ? `<div class="hs-buoc-tiep"><span class="hs-nhan">Bước tiếp</span>${esc(brief.buocTiep)}</div>` : ''}
  ${nong.lyDo ? `<div class="hs-ly-do-nong">${esc(NHAN_NONG[nong.muc] || '')} vì ${esc(nong.lyDo)}${chipNguon(nong.evidence, ctx.coTin)}</div>` : ''}
  <div class="hs-luoi">${nhom}</div>
  <div class="hs-nhan hs-tieu-hua">Lời hứa</div>
  <div class="hs-ds-hua">${dsHua || '<div class="list-empty">Chưa có lời hứa nào</div>'}</div>
  <div class="hs-chan">${Number(ctx.tinMoi) || 0} tin mới chưa phân tích</div>`;
}
