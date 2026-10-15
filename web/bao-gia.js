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

// CHÉP Ở 2 NƠI: khopGoi + PACKAGES ở đây và api/mcp.ts (khopGoi). Sửa một chỗ thì sửa cả hai.
const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'];
const boDau = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
export function khopGoi(ten){
  const chuan = s => boDau(s).replace(/^goi\s+/, '').replace(/\s+/g, ' ').trim();
  const t = chuan(ten);
  return PACKAGES.find(p => { const g = chuan(p); return t === g || t.startsWith(g + ' '); }) || null;
}
const ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

/** Phương án `ma` của báo giá, kèm buổi = buổi chung + buổi riêng. */
export function phuongAnCua(bg, ma){
  const p = mang(bg && bg.phuongAn).find(x => x && x.ma === ma);
  return p ? { ...p, buoi: [...mang(bg.buoi), ...mang(p.buoi)] } : null;
}
export function goiCuoiCua(pa){
  const cuoi = mang(pa && pa.buoi).find(b => b && b.loai === 'cuoi');
  return cuoi ? khopGoi(cuoi.goi) : null;
}
const tongCuaBan = b => {
  const pa = mang(b.phuongAn);
  if (!pa.length) return tien(b.tongSauUuDai);
  const chon = pa.find(p => p.ma === b.phuongAnDaChon);
  return chon ? `${chon.ten} · ${tien(chon.tongSauUuDai)}` : `${pa.length} phương án · từ ${tien(Math.min(...pa.map(p => Number(p.tongSauUuDai) || 0)))}`;
};

function veTong(tongGiaGoc, tongSauUuDai, tietKiem){
  return `<div class="bg-tong"><span class="bg-nhan">Tổng</span>${tietKiem ? `<s>${esc(tien(tongGiaGoc))}</s>` : ''}<b>${esc(tien(tongSauUuDai))}</b>${tietKiem ? `<span class="bg-tiet-kiem">Tiết kiệm ${esc(tien(tietKiem))}</span>` : ''}</div>`;
}

function vePhuongAn(bg, p, choPhepChon){
  const daChon = bg.phuongAnDaChon === p.ma;
  const coChon = !!bg.phuongAnDaChon;
  const nut = choPhepChon && !daChon && ID_OK.test(String(bg.id)) && ID_OK.test(String(p.ma))
    ? `<button type="button" class="btn btn-secondary btn-sm bg-chon" onclick="chonPhuongAn('${bg.id}','${p.ma}')">Khách chọn phương án này</button>` : '';
  return `
    <div class="bg-pa${daChon ? ' da-chon' : ''}${coChon && !daChon ? ' mo' : ''}">
      <div class="bg-pa-dau"><b>${esc(p.ten)}</b>${p.nhan ? ` <span class="bg-pa-nhan">${esc(p.nhan)}</span>` : ''}${daChon ? ' <span class="bg-da-chon">Khách đã chọn</span>' : ''}</div>
      ${mang(p.buoi).map(veBuoi).join('')}
      ${p.diemKhacBiet ? `<div class="bg-pa-khac">${esc(p.diemKhacBiet)}</div>` : ''}
      ${veTong(p.tongGiaGoc, p.tongSauUuDai, p.tietKiem)}
      ${nut}
    </div>`;
}

export function veBaoGia(lead, homNay, opts = {}){
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
    ${mang(bg.phuongAn).length
      ? `${mang(bg.buoi).length ? `<div class="bg-chung"><div class="bg-nhan">Giống nhau ở mọi phương án</div>${mang(bg.buoi).map(veBuoi).join('')}</div>` : ''}<div class="bg-luoi-pa">${mang(bg.phuongAn).map(p => vePhuongAn(bg, p, !!opts.choPhepChon)).join('')}</div>`
      : `${mang(bg.buoi).map(veBuoi).join('')}${veTong(bg.tongGiaGoc, bg.tongSauUuDai, bg.tietKiem)}`}
    ${han}
    ${ghiChu.length ? `<ul class="bg-ghi-chu">${ghiChu.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>
  ${cu.length ? `<details class="bg-ban-cu"><summary>${cu.length} bản báo giá trước</summary>${cu.map((b, i) =>
    `<div class="bg-cu-dong">Lần ${cu.length - i} · ${b.taoLuc && /^\d{4}-/.test(b.taoLuc) ? esc(ddmm(b.taoLuc.slice(0, 10))) : '—'} · ${esc(tongCuaBan(b))}</div>`).join('')}</details>` : ''}`;
}
