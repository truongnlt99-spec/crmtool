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
