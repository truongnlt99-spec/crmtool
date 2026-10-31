/**
 * Test ham thuan theo doi link san pham (web/link-gui.js + api/mcp.ts). KHONG cham Firebase.
 * Chay: npm run test:link-gui
 */
const web = (await import('../web/link-gui.js')) as any;
const mcp = (await import('../api/mcp.ts')) as any;

let pass = 0, fail = 0;
const check = (ten: string, dk: boolean, ct: unknown = '') => {
  if (dk) { pass++; console.log(`  OK   ${ten}`); }
  else { fail++; console.log(`  FAIL ${ten} ${JSON.stringify(ct)}`); }
};
const bang = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n>> nhanLink (web + server cung bo ca)');
const CA_NHAN: Array<[Record<string, number>, string]> = [
  [{}, 'chuaMo'],
  [{ soLanMo: 1 }, 'xemQua'],
  [{ soLanMo: 2 }, 'quanTam'],
];
for (const [vao, ra] of CA_NHAN) {
  check(`web ${JSON.stringify(vao)} -> ${ra}`, web.nhanLink(vao) === ra, web.nhanLink(vao));
  check(`server ${JSON.stringify(vao)} -> ${ra}`, mcp.nhanLink(vao) === ra, mcp.nhanLink(vao));
}
check('TEN_NHAN du 3 nhan', web.TEN_NHAN.quanTam === 'Quan tâm' && web.TEN_NHAN.xemQua === 'Đã mở' && web.TEN_NHAN.chuaMo === 'Chưa mở');

console.log('\n>> thongKeSanPham');
const links = {
  a: { leadId: 'l1', venueId: 'v1', spId: 's1', tenSp: 'Mot', soLanMo: 3, guiLuc: 10, lanCuoi: 50 },
  b: { leadId: 'l2', venueId: 'v1', spId: 's1', tenSp: 'Mot', guiLuc: 30 },
  c: { leadId: 'l1', venueId: 'v1', spId: 's2', tenSp: 'Hai', soLanMo: 5, guiLuc: 20, lanCuoi: 90 },
};
check('dem khach va tong luot click', bang(web.thongKeSanPham(links)['v1/s1'], { daGui: 2, khachMo: 1, luotClick: 3 }), web.thongKeSanPham(links));
check('rong khong loi', bang(web.thongKeSanPham(null), {}));

console.log('\n>> thong ke tong');
check('tongQuan', bang(web.tongQuan(links), { daGui: 3, khachNhan: 2, luotClick: 8, linkDaMo: 2 }), web.tongQuan(links));
check('tongQuan rong', bang(web.tongQuan(null), { daGui: 0, khachNhan: 0, luotClick: 0, linkDaMo: 0 }));
check('topSanPham nhieu click truoc', bang(web.topSanPham(links).map((x: any) => x.tenSp), ['Hai', 'Mot']), web.topSanPham(links));
check('topSanPham co so lieu', web.topSanPham(links)[1].daGui === 2 && web.topSanPham(links)[1].luotClick === 3);
check('topSanPham gioi han', web.topSanPham(links, 1).length === 1);
check('hoatDongGanDay moi truoc, bo link chua mo', bang(web.hoatDongGanDay(links).map((x: any) => x.token), ['c', 'a']));

console.log('\n>> Lan gui');
const M = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
const guiDs = web.dsLanGui({
  a: { leadId: 'l1', tenSp: 'Pre Wedding An Lâm', guiLuc: M('2026-10-01'), soLanGui: 2, soLanMo: 3, lanCuoi: M('2026-10-03') },
  b: { leadId: 'l2', tenSp: 'Áo dài hồng', taoLuc: M('2026-10-10'), soLanGui: 1 },
  c: { leadId: 'l1', tenSp: 'Decor be', guiLuc: M('2026-10-20'), soLanGui: 1, soLanMo: 1, lanCuoi: M('2026-10-21') },
  d: { leadId: 'l3', tenSp: 'Lead da xoa', guiLuc: M('2026-10-05'), soLanGui: 1 },
}, (id: string) => ({ l1: 'Chị Mai Anh', l2: 'Anh Hoàng' } as any)[id] || '');
const idLoc = (b: any) => web.locLanGui(guiDs, b).map((x: any) => x.token);
check('dsLanGui co token, ten khach, nhan, ngay gui', guiDs[0].token === 'a' && guiDs[0].khach === 'Chị Mai Anh' && guiDs[0].nhan === 'quanTam' && guiDs[0].ngayGui === '2026-10-01', guiDs[0]);
check('thieu guiLuc thi dung taoLuc', guiDs[1].ngayGui === '2026-10-10', guiDs[1]);
check('khong loc: du het', idLoc({}).length === 4);
check('tim khong dau theo khach', bang(idLoc({ q: 'mai anh' }), ['a', 'c']), idLoc({ q: 'mai anh' }));
check('tim khong dau theo san pham', bang(idLoc({ q: 'ao dai' }), ['b']));
check('tu ngay gom ca ngay do', bang(idLoc({ tu: '2026-10-10' }), ['b', 'c']), idLoc({ tu: '2026-10-10' }));
check('den ngay gom ca ngay do', bang(idLoc({ den: '2026-10-05' }), ['a', 'd']), idLoc({ den: '2026-10-05' }));
check('chua mo', bang(idLoc({ trangThai: 'chuaMo' }), ['b', 'd']));
check('da mo', bang(idLoc({ trangThai: 'daMo' }), ['a', 'c']));
check('quan tam', bang(idLoc({ trangThai: 'quanTam' }), ['a']));
check('mo tu n lan', bang(idLoc({ moTu: 2 }), ['a']));
check('gui tu n lan', bang(idLoc({ guiTu: 2 }), ['a']));
check('ket hop nhieu dieu kien', bang(idLoc({ q: 'mai', tu: '2026-10-10', trangThai: 'daMo' }), ['c']));
const sx = (khoa: string, giam: boolean) => web.sapXepLanGui(guiDs, khoa, giam).map((x: any) => x.token);
check('sap xep ngay gui moi truoc', bang(sx('guiLuc', true), ['c', 'b', 'd', 'a']), sx('guiLuc', true));
check('sap xep luot click nhieu truoc', sx('soLanMo', true)[0] === 'a');
check('sap xep tang dan', sx('soLanMo', false).at(-1) === 'a');
check('sap xep khong doi mang goc', guiDs[0].token === 'a');
check('tong lan gui', bang(web.tongLanGui(guiDs), { dong: 4, daMo: 2, luotClick: 4, soLanGui: 5 }), web.tongLanGui(guiDs));
const nh = web.chuoiNgay({ '2026-10-30': { mo: 4 }, '2026-10-31': { mo: 1 } }, '2026-10-31', 3);
check('chuoiNgay du ngay, thieu la 0', bang(nh, [{ ngay: '2026-10-29', mo: 0 }, { ngay: '2026-10-30', mo: 4 }, { ngay: '2026-10-31', mo: 1 }]), nh);
const qua = web.chuoiNgay({}, '2026-03-01', 2);
check('chuoiNgay qua thang', qua[0].ngay === '2026-02-28', qua);
check('khachVuaGui moi gui truoc, moi khach mot lan', bang(web.khachVuaGui(links), ['l2', 'l1']), web.khachVuaGui(links));
check('khachVuaGui gioi han', web.khachVuaGui(links, 1).length === 1);

console.log('\n>> dsTheoLead');
const theoLead = {
  x: { leadId: 'l1', tenSp: 'chua mo' },
  y: { leadId: 'l1', tenSp: 'xem qua moi', soLanMo: 1, lanCuoi: 90 },
  z: { leadId: 'l1', tenSp: 'quan tam', soLanMo: 2, lanCuoi: 10 },
  w: { leadId: 'l1', tenSp: 'xem qua cu', soLanMo: 1, lanCuoi: 20 },
  k: { leadId: 'l2', tenSp: 'khach khac' },
};
check('quan tam truoc, moi truoc, chua mo cuoi',
  bang(web.dsTheoLead(theoLead, 'l1').map((d: any) => d.tenSp), ['quan tam', 'xem qua moi', 'xem qua cu', 'chua mo']),
  web.dsTheoLead(theoLead, 'l1').map((d: any) => d.tenSp));
check('co token trong tung dong', web.dsTheoLead(theoLead, 'l2')[0].token === 'k');

console.log('\n>> daGuiChoLead');
check('dem mau da gui trong nhom dang chon', web.daGuiChoLead(links, 'l1', ['v1/s1', 'v1/s9']) === 1);

console.log('\n>> locKhach');
const leads = [
  { id: 'L100', name: 'Mai Anh', phone: '0901234567', stage: 'baogia', createdAt: '2026-10-01' },
  { id: 'L200', name: 'Hoàng Thu', phone: '', stage: 'leadin', createdAt: '2026-10-05' },
  { id: 'L300', name: 'Đã chốt', stage: 'won', createdAt: '2026-10-09' },
  { id: 'L400', name: 'Mất', stage: 'lost', createdAt: '2026-10-10' },
  { id: 'L201', name: 'Cùng ngày', stage: 'leadin', createdAt: '2026-10-05' },
];
check('rong: bo won/lost, moi truoc, cung ngay theo id', bang(web.locKhach(leads, '').map((l: any) => l.id), ['L201', 'L200', 'L100']), web.locKhach(leads, '').map((l: any) => l.id));
check('khong dau', web.locKhach(leads, 'hoang')[0]?.id === 'L200');
check('so dien thoai', web.locKhach(leads, '0901')[0]?.id === 'L100');
check('tim co ca khach da won', web.locKhach(leads, 'da chot')[0]?.id === 'L300');
check('limit', web.locKhach(leads, '', 1).length === 1);

console.log('\n>> chuoiCopyTatCa');
check('nhieu mau: moi mau 2 dong', web.chuoiCopyTatCa([{ tenSp: 'A', url: 'u1' }, { tenSp: 'B', url: 'u2' }]) === 'A\nu1\n\nB\nu2');
check('mot mau: chi link de Zalo hien the', web.chuoiCopyTatCa([{ tenSp: 'A', url: 'u1' }]) === 'u1');

console.log('\n>> kiemTraSuKien');
const T = 'abcDEF1234';
check('mo hop le', mcp.kiemTraSuKien({ t: T, loai: 'mo' }) === T);
for (const xau of [null, 'x', { t: T, loai: 'la' }, { t: T, loai: 'giay', giay: 15 }, { t: 'ngan', loai: 'mo' }, { t: '../x/y/z/', loai: 'mo' }]) {
  check(`tu choi ${JSON.stringify(xau)}`, mcp.kiemTraSuKien(xau) === null, mcp.kiemTraSuKien(xau));
}
check('ngayVN qua nua dem gio VN', mcp.ngayVN(Date.UTC(2026, 9, 31, 18, 0)) === '2026-11-01', mcp.ngayVN(Date.UTC(2026, 9, 31, 18, 0)));

console.log('\n>> veTrangXem');
const FB = { token: T, tieuDe: 'Ảnh đẹp', anh: 'https://cdn.fb/a.jpg', linkGoc: 'https://www.facebook.com/hayday.media/posts/pfbidX' };
const trang = mcp.veTrangXem(FB);
check('co og:title va og:image', /property="og:title" content="Ảnh đẹp"/.test(trang) && /property="og:image" content="https:\/\/cdn\.fb\/a\.jpg"/.test(trang));
check('khong co anh thi bo og:image', !/og:image/.test(mcp.veTrangXem({ ...FB, anh: '' })));
check('co noi dung thi co og:description', /property="og:description" content="Tiệc &amp; cưới"/.test(mcp.veTrangXem({ ...FB, moTa: 'Tiệc & cưới' })));
check('khong co noi dung thi bo og:description', !/og:description/.test(trang));
check('chong XSS noi dung', !mcp.veTrangXem({ ...FB, moTa: '"><script>window.bi=1</script>' }).includes('<script>window.bi=1'));
check('giau token voi trang dich', /<meta name="referrer" content="no-referrer">/.test(trang));
check('noindex', /name="robots" content="noindex"/.test(trang));
check('khong nhung gi', !trang.includes('<iframe'));
const XSS = '"><script>window.bi=1</script>';
const trangXss = mcp.veTrangXem({ ...FB, tieuDe: XSS, anh: XSS, linkGoc: `https://x.vn/${XSS}` });
check('chong XSS tieu de, anh, link', !trangXss.includes('<script>window.bi=1'), trangXss.slice(0, 400));
check('link javascript bi bo', !/javascript:/.test(mcp.veTrangXem({ ...FB, linkGoc: 'javascript:alert(1)' })));

console.log('\n>> JS_THEO_DOI');
const vm = await import('node:vm');
function chayTrang(linkGoc: string, ls: Record<string, string> | null = {}, nem = false) {
  const gui: any[] = [];
  let chuyen = '';
  const ctx: any = {
    navigator: { sendBeacon: (_u: string, b: any) => { if (nem) throw new Error('x'); gui.push(JSON.parse(b.noiDung)); return true; } },
    localStorage: { getItem: (k: string) => { if (!ls) throw new Error('chan'); return ls[k] ?? null; } },
    Blob: function (this: any, a: string[]) { this.noiDung = a[0]; },
    location: { replace: (u: string) => { chuyen = u; } },
    JSON,
  };
  ctx.window = ctx; ctx.__xem = { t: T, linkGoc };
  vm.runInNewContext(mcp.JS_THEO_DOI, ctx);
  return { gui, chuyen };
}
const L = 'https://www.youtube.com/watch?v=a';
const p1 = chayTrang(L);
check('gui mo roi chuyen thang', bang(p1.gui, [{ t: T, loai: 'mo' }]) && p1.chuyen === L, p1);
const p2 = chayTrang(L, { crmNoiBo: '1' });
check('may noi bo khong dem, van chuyen', p2.gui.length === 0 && p2.chuyen === L, p2);
const p3 = chayTrang(L, null);
check('webview chan localStorage van dem va chuyen', p3.gui.length === 1 && p3.chuyen === L, p3);
const p4 = chayTrang(L, {}, true);
check('beacon loi van chuyen', p4.chuyen === L);
check('link rong khong chuyen', chayTrang('').chuyen === '');

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
