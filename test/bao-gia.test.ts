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
eq('ten co hau to -> khop tien to', S.khopGoi('Gói Signature trọn ngày'), 'Signature');
eq('khong khop tron tu', S.khopGoi('Gói Signatureplus'), null);
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
check('goi khong khop: khong de xuat goi', !S.deXuatTuBaoGia(sua((b) => { b.buoi[1].goi = 'Gói Premium trọn ngày'; }), '2026-10-15', 'L1').some((d) => d.type === 'field' && d.field === 'package'));

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

console.log('\n>> nhieu phuong an');
const BUOI_AN_HOI: S.BuoiBaoGia = { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-24', gio: null, soKhach: null, moTa: null,
  goi: 'Gói Standard 1 buổi', giaGoc: 20900000, uuDaiPhanTram: 0, giaSauUuDai: 20900000, ekip: [], sanPham: [], quaTang: [] };
const cuoi = (goi: string, gia: number, ngay = '2026-11-25'): S.BuoiBaoGia => ({ loai: 'cuoi', ten: 'Rước dâu + tiệc Mipec', ngay, gio: null, soKhach: '75 mâm', moTa: null,
  goi, giaGoc: gia, uuDaiPhanTram: 0, giaSauUuDai: gia, ekip: [], sanPham: [], quaTang: [] });
const NHIEU: S.BaoGia = {
  tieuDe: 'So sánh 2 phương án quay chụp cưới', tenKhach: 'Anh Đức Minh', diaDiem: 'Mipec', hanUuDai: null, ghiChu: [],
  buoi: [BUOI_AN_HOI],
  phuongAn: [
    { ma: 'opt1', ten: 'Option 1', nhan: 'Vừa vặn', buoi: [cuoi('Gói Unique full ngày', 46900000)], tongGiaGoc: 67800000, tongSauUuDai: 67800000, tietKiem: 0, diemKhacBiet: 'Unique vừa vặn' },
    { ma: 'opt2', ten: 'Option 2', nhan: 'Trọn vẹn nhất', buoi: [cuoi('Gói Signature full ngày', 65900000)], tongGiaGoc: 86800000, tongSauUuDai: 86800000, tietKiem: 0, diemKhacBiet: 'Ekip 6 người + flycam' },
  ],
};
const suaN = (f: (b: any) => void) => { const b = JSON.parse(JSON.stringify(NHIEU)); f(b); return b as S.BaoGia; };
eq('2 phuong an mau: hop le', S.kiemTraBaoGia(NHIEU), []);
{
  const loi = S.kiemTraBaoGia(suaN((b) => { b.phuongAn[1].tongSauUuDai = 86000000; b.phuongAn[1].tietKiem = 800000; }));
  check('sai tong o Option 2: neu ten phuong an', loi.length === 1 && /^Option 2: Tổng sau ưu đãi/.test(loi[0]), JSON.stringify(loi));
}
check('1 phuong an -> loi', S.kiemTraBaoGia(suaN((b) => { b.phuongAn = [b.phuongAn[0]]; })).some((x) => /2–4 phương án/.test(x)));
check('ma trung -> loi', S.kiemTraBaoGia(suaN((b) => { b.phuongAn[1].ma = 'opt1'; })).some((x) => /trùng/.test(x)));
check('co tong o goc -> loi', S.kiemTraBaoGia(suaN((b) => { b.tongGiaGoc = 1; b.tongSauUuDai = 1; b.tietKiem = 0; })).some((x) => /không ghi tổng ở gốc/.test(x)));
check('khong phuong an + thieu tong -> loi', S.kiemTraBaoGia({ ...MAU, tongGiaGoc: undefined } as any).some((x) => /Thiếu tổng/.test(x)));
check('2 buoi cuoi trong 1 phuong an -> loi', S.kiemTraBaoGia(suaN((b) => { b.buoi[0].loai = 'cuoi'; })).some((x) => /Option 1: Chỉ được một buổi/.test(x)));
// Review Focus 1: buổi chung rỗng bị Firebase bỏ
{
  const khongChung = suaN((b) => { delete b.buoi; b.phuongAn.forEach((p: any) => { p.tongGiaGoc -= 20900000; p.tongSauUuDai -= 20900000; }); });
  eq('khong buoi chung (undefined): hop le', S.kiemTraBaoGia(khongChung), []);
  eq('cacPhuongAn chiu buoi undefined', S.cacPhuongAn(khongChung).map((p) => p.buoi.length), [1, 1]);
}
eq('cacPhuongAn: buoi chung + rieng', S.cacPhuongAn(NHIEU).map((p) => [p.ma, p.buoi.length, p.tongSauUuDai]), [['opt1', 2, 67800000], ['opt2', 2, 86800000]]);
eq('cacPhuongAn: bao gia 1 phuong an', S.cacPhuongAn(MAU).map((p) => [p.ma, p.buoi.length, p.tongSauUuDai]), [[null, 2, 41905000]]);
// Review Focus 2: tìm theo tên không phân biệt hoa / dấu
eq('tim theo ma', S.timPhuongAn(NHIEU, 'opt2')?.ma, 'opt2');
eq('tim theo ten thuong', S.timPhuongAn(NHIEU, 'option 2')?.ma, 'opt2');
eq('tim theo ten hoa', S.timPhuongAn(NHIEU, 'OPTION 1')?.ma, 'opt1');
eq('khong tim thay', S.timPhuongAn(NHIEU, 'Option 3'), null);
eq('bao gia 1 phuong an: khong tim', S.timPhuongAn(MAU, 'opt1'), null);
// Đề xuất
eq('nhieu PA: chi ngay cuoi (khong han -> khong viec)', S.deXuatTuBaoGia(NHIEU, '2026-10-15', 'L1').map((d) => d.type === 'field' ? d.field : 'todo'), ['weddingDate']);
eq('nhieu PA co han: ngay cuoi + viec', S.deXuatTuBaoGia(suaN((b) => { b.hanUuDai = '2026-10-30'; }), '2026-10-15', 'L1').map((d) => d.type === 'field' ? d.field : 'todo'), ['weddingDate', 'todo']);
check('Review Focus 4: ngay cuoi khac nhau -> khong de xuat ngay', !S.deXuatTuBaoGia(suaN((b) => { b.phuongAn[1].buoi[0].ngay = '2026-11-26'; }), '2026-10-15', 'L1').some((d) => d.type === 'field' && d.field === 'weddingDate'));
eq('deXuatTuPhuongAn opt2', S.deXuatTuPhuongAn(NHIEU, 'opt2').map((d: any) => [d.field, d.newValue]), [['revenueExpected', 86800000], ['package', 'Signature']]);
eq('deXuatTuPhuongAn opt1', S.deXuatTuPhuongAn(NHIEU, 'opt1').map((d: any) => [d.field, d.newValue]), [['revenueExpected', 67800000], ['package', 'Unique']]);

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
