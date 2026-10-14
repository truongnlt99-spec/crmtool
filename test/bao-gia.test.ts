/** Test hàm thuần báo giá (api/mcp.ts). Không chạm Firebase. */
import * as S from '../api/mcp.ts';

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// Báo giá mẫu thật (Huyền Nguyễn) — phép tính đúng
const MAU: S.BaoGia = {
  tieuDe: 'Phương án quay chụp ăn hỏi & cưới', tenKhach: 'Cô dâu Huyền Nguyễn', diaDiem: 'Hà Nội',
  buoi: [
    { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-16', gio: '3h - 5h chiều', soKhach: '40-50', moTa: 'Chỉ lễ, không bao gồm tiệc',
      goi: 'Combo 2 máy chụp', giaGoc: 18000000, uuDaiPhanTram: 25, giaSauUuDai: 13500000,
      ekip: ['1 Nhiếp ảnh phóng sự', '1 Nhiếp ảnh truyền thống'], sanPham: ['Bộ hình phóng sự 200-300 tấm'], quaTang: [] },
    { loai: 'cuoi', ten: 'Đám cưới', ngay: '2026-12-24', gio: null, soKhach: '750', moTa: 'Đón dâu sáng + tiệc tại The One',
      goi: 'Gói Standard', giaGoc: 29900000, uuDaiPhanTram: 5, giaSauUuDai: 28405000,
      ekip: ['1 Nhiếp ảnh phóng sự', '1 Nhiếp ảnh nghi thức', '1 Quay phim phóng sự'], sanPham: ['Phim phóng sự ngắn 4-6 phút'], quaTang: ['Hình Sneak peek'] },
  ],
  tongGiaGoc: 47900000, tongSauUuDai: 41905000, tietKiem: 5995000,
  hanUuDai: '2026-10-20', ghiChu: ['Phụ phí chụp tiệc sau lễ ăn hỏi: 3.000.000 đ/máy'],
};
const sua = (f: (b: S.BaoGia) => void) => { const b = JSON.parse(JSON.stringify(MAU)); f(b); return b as S.BaoGia; };

console.log('\n>> kiemTraBaoGia');
eq('mau that: hop le', S.kiemTraBaoGia(MAU), []);
{
  const loi = S.kiemTraBaoGia(sua((b) => { b.buoi[0].giaSauUuDai = 13600000; b.tongSauUuDai = 42005000; b.tietKiem = 5895000; }));
  check('gia sau uu dai sai: neu ro dong', loi.length === 1 && /Buổi 1 \(Lễ ăn hỏi\)/.test(loi[0]) && /13\.500\.000/.test(loi[0]) && /13\.600\.000/.test(loi[0]), JSON.stringify(loi));
}
check('tong gia goc sai', S.kiemTraBaoGia(sua((b) => { b.tongGiaGoc = 48000000; b.tietKiem = 6095000; })).some((x) => /Tổng giá gốc/.test(x)));
check('tong sau uu dai sai', S.kiemTraBaoGia(sua((b) => { b.tongSauUuDai = 41000000; b.tietKiem = 6900000; })).some((x) => /Tổng sau ưu đãi/.test(x)));
check('tiet kiem sai', S.kiemTraBaoGia(sua((b) => { b.tietKiem = 5000000; })).some((x) => /Tiết kiệm/.test(x)));
check('ngay buoi khong co that', S.kiemTraBaoGia(sua((b) => { b.buoi[1].ngay = '2026-02-30'; })).some((x) => /2026-02-30/.test(x)));
check('han uu dai khong co that', S.kiemTraBaoGia(sua((b) => { b.hanUuDai = '2026-13-01'; })).some((x) => /Hạn ưu đãi/.test(x)));
check('hai buoi cuoi', S.kiemTraBaoGia(sua((b) => { b.buoi[0].loai = 'cuoi'; })).some((x) => /một buổi/.test(x)));
// Review Focus 1: % lẻ, sai số làm tròn ≤ 1.000 đ không phải lỗi
eq('uu dai le 33%: lam tron nghin dong', S.kiemTraBaoGia(sua((b) => {
  b.buoi[0].uuDaiPhanTram = 33; b.buoi[0].giaSauUuDai = 12060000;   // 18tr × 67% = 12.060.000
  b.tongSauUuDai = 12060000 + 28405000; b.tietKiem = 47900000 - b.tongSauUuDai;
})), []);
check('sai qua 1.000 d van la loi', S.kiemTraBaoGia(sua((b) => {
  b.buoi[0].giaSauUuDai = 13502000; b.tongSauUuDai = 13502000 + 28405000; b.tietKiem = 47900000 - b.tongSauUuDai;
})).length === 1);

console.log('\n>> khopGoi (Review Focus 3)');
eq('Gói Standard', S.khopGoi('Gói Standard'), 'Standard');
eq('gói standard', S.khopGoi('gói standard'), 'Standard');
eq('STANDARD', S.khopGoi('STANDARD'), 'Standard');
eq('HayDay Package', S.khopGoi('Gói HayDay Package'), 'HayDay Package');
eq('Gói lẻ', S.khopGoi('Gói lẻ'), 'Gói lẻ');
eq('ten co chu thua -> null', S.khopGoi('Gói Signature trọn ngày'), null);
eq('Combo 2 may chup -> null', S.khopGoi('Combo 2 máy chụp'), null);

console.log('\n>> deXuatTuBaoGia');
{
  const ds = S.deXuatTuBaoGia(MAU, '2026-10-15', 'L1');
  eq('du 4 de xuat', ds.map((d) => d.type === 'field' ? d.field : 'todo'), ['revenueExpected', 'weddingDate', 'package', 'todo']);
  eq('doanh thu = tong sau uu dai', (ds[0] as any).newValue, 41905000);
  eq('ngay cuoi = buoi cuoi', (ds[1] as any).newValue, '2026-12-24');
  eq('goi khop', (ds[2] as any).newValue, 'Standard');
  eq('viec nhac: id theo ngay han + han truoc 2 ngay', [(ds[3] as any).huaId, (ds[3] as any).due], ['bguu20261020_L1', '2026-10-18']);
  check('viec nhac: noi dung co ngay han', /20\/10/.test((ds[3] as any).todoText), (ds[3] as any).todoText);
}
// Review Focus 2: chỉ ăn hỏi
{
  const chiAnHoi = sua((b) => { b.buoi = [b.buoi[0]]; b.tongGiaGoc = 18000000; b.tongSauUuDai = 13500000; b.tietKiem = 4500000; });
  eq('chi an hoi: hop le', S.kiemTraBaoGia(chiAnHoi), []);
  eq('chi an hoi: chi de xuat doanh thu + viec', S.deXuatTuBaoGia(chiAnHoi, '2026-10-15', 'L1').map((d) => d.type === 'field' ? d.field : 'todo'), ['revenueExpected', 'todo']);
}
// Review Focus 4: hạn ưu đãi sát / đã qua
eq('han ngay mai: due la hom nay', (S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-16'; }), '2026-10-15').at(-1) as any).due, '2026-10-15', 'L1');
eq('han hom nay: due la hom nay', (S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-15'; }), '2026-10-15').at(-1) as any).due, '2026-10-15', 'L1');
check('han da qua: khong tao viec', !S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = '2026-10-14'; }), '2026-10-15', 'L1').some((d) => d.type === 'todo'));
check('khong co han: khong tao viec', !S.deXuatTuBaoGia(sua((b) => { b.hanUuDai = null; }), '2026-10-15', 'L1').some((d) => d.type === 'todo'));
check('goi khong khop: khong de xuat goi', !S.deXuatTuBaoGia(sua((b) => { b.buoi[1].goi = 'Gói Standard trọn ngày'; }), '2026-10-15', 'L1').some((d) => d.type === 'field' && d.field === 'package'));

console.log('\n>> baoGiaMoiNhat + ddmm');
eq('chua co bao gia', S.baoGiaMoiNhat({}), null);
{
  const l = { baoGia: {
    bg_a: { ...MAU, taoLuc: '2026-10-10T03:00:00.000Z', tongSauUuDai: 1 },
    bg_b: { ...MAU, taoLuc: '2026-10-14T03:00:00.000Z', tongSauUuDai: 2 },
  } } as any;
  eq('lay ban moi nhat', [S.baoGiaMoiNhat(l)?.id, S.baoGiaMoiNhat(l)?.tongSauUuDai], ['bg_b', 2]);
}
eq('ddmm', S.ddmm('2026-10-20'), '20/10');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
