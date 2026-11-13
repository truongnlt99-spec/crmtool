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

console.log('\n>> JS_THEO_DOI: ma thiet bi');
function chayCoBoNho(ls: Record<string, string>) {
  const gui: any[] = [];
  const ctx: any = {
    navigator: { sendBeacon: (_u: string, b: any) => { gui.push(JSON.parse(b.noiDung)); return true; } },
    localStorage: { getItem: (k: string) => ls[k] ?? null, setItem: (k: string, v: string) => { ls[k] = v; } },
    crypto: globalThis.crypto, Uint8Array, Blob: function (this: any, a: string[]) { this.noiDung = a[0]; },
    location: { replace: () => {} }, JSON,
  };
  ctx.window = ctx; ctx.__xem = { t: T, linkGoc: L };
  vm.runInNewContext(mcp.JS_THEO_DOI, ctx);
  return gui[0];
}
const boNho: Record<string, string> = {};
const lan1 = chayCoBoNho(boNho), lan2 = chayCoBoNho(boNho);
check('tao ma 12 ky tu, luu lai, lan sau dung lai', /^[A-Za-z0-9]{12}$/.test(lan1.tb) && lan2.tb === lan1.tb && boNho.crmTb === lan1.tb, [lan1, lan2]);
check('ma cu hong thi tao lai', chayCoBoNho({ crmTb: '<x>' }).tb !== '<x>');

console.log('\n>> thongTinNguoiXem');
const UA = {
  zalo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile ZaloTheme/light ZaloLanguage/vi',
  mess: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile [FB_IAB/Orca-Android;FBAV/480.0]',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36',
};
const n1 = mcp.thongTinNguoiXem('AbCdEf123456', UA.zalo, '1.2.3.4', 'H%C3%A0%20N%E1%BB%99i', T, 'k');
check('iPhone Zalo, giai ma thanh pho', n1.tb === 'AbCdEf123456' && n1.app === 'zalo' && n1.may === 'iPhone' && n1.tp === 'Hà Nội' && /^[0-9a-f]{10}$/.test(n1.mang), n1);
const n2 = mcp.thongTinNguoiXem(undefined, UA.mess, '1.2.3.4', '', T, 'k');
check('Messenger Android, khong ma -> ma tu mang', n2.app === 'facebook' && n2.may === 'Android' && /^m[0-9a-f]{11}$/.test(n2.tb) && n2.mang === n1.mang, n2);
const pc = mcp.thongTinNguoiXem('', UA.pc, '', '', T);
check('may tinh trinh duyet', pc.may === 'mayTinh' && pc.app === 'trinhDuyet', pc);
check('ma sai dang khong dung', mcp.thongTinNguoiXem('../x/y', UA.pc, '1.1.1.1', '', T).tb.startsWith('m'));
check('cung IP khac link -> ma mang khac', mcp.thongTinNguoiXem('', UA.pc, '1.2.3.4', '', 'zzzzzzzzzz', 'k').mang !== n1.mang);
check('thanh pho hong khong nem', mcp.thongTinNguoiXem('', UA.pc, '', '%E0%A4%A', T).tp === '');

console.log('\n>> loaiNguoiXem');
const tb = (o: Record<string, unknown>) => ({ soLan: 1, app: 'zalo', may: 'iPhone', tp: 'HCM', mang: 'a', ...o });
const CA_XEM: Array<[unknown, string]> = [
  [undefined, ''], [{}, ''],
  [{ a: tb({}) }, 'motLan'],
  [{ a: tb({ soLan: 4 }) }, 'xemLai'],
  [{ a: tb({}), b: tb({ may: 'mayTinh', app: 'trinhDuyet' }) }, 'coThe'],
  [{ a: tb({}), b: tb({ may: 'mayTinh', mang: 'b' }) }, 'coThe'],
  [{ a: tb({}), b: tb({ tp: 'Ha Noi' }) }, 'chiaSe'],
  [{ a: tb({}), b: tb({ app: 'facebook' }) }, 'chiaSe'],
  [{ a: tb({}), b: tb({ may: 'Android' }) }, 'chiaSe'],
  [{ a: tb({}), b: tb({ may: 'mayTinh' }), c: tb({ may: 'mayTinh', app: 'trinhDuyet' }) }, 'chiaSe'],
];
for (const [vao, ra] of CA_XEM) check(`${String(JSON.stringify(vao)).slice(0, 80)} -> ${ra || '(rong)'}`, web.loaiNguoiXem(vao) === ra, web.loaiNguoiXem(vao));
const moTa = web.moTaThietBi({ b: tb({ dau: 2, may: 'mayTinh', app: 'trinhDuyet', tp: '' }), a: tb({ dau: 1, soLan: 3 }), c: tb({ dau: 3, mang: 'z', may: 'Android', app: 'facebook', tp: 'Ha Noi' }) });
check('mo ta thiet bi theo thu tu mo, danh dau cung mang', moTa === 'iPhone · Zalo · 3 lần · HCM (cùng mạng); Máy tính · trình duyệt · 1 lần (cùng mạng); Android · Messenger/Facebook · 1 lần · Ha Noi', moTa);
const khoi = web.veKhoiDaGui([{ tenSp: 'A', soLanMo: 2, nhan: 'quanTam', nguoiXem: { a: tb({ tp: '<img src=x onerror=1>' }), b: tb({ tp: 'HN' }) } }]);
check('khoi da gui: nhan chia se + mo ta, chong XSS', khoi.includes('Đã chia sẻ') && khoi.includes('lg-tb') && !khoi.includes('<img src=x'), khoi);
check('khoi da gui: link cu khong co thiet bi thi khong nhan', !web.veKhoiDaGui([{ tenSp: 'A', soLanMo: 2, nhan: 'quanTam' }]).includes('lg-tb'));
const bangLg = web.veLanGui([{ token: 't', khach: 'K', leadId: 'L1', tenSp: 'A', soLanMo: 1, nhan: 'xemQua', ngayGui: '2026-11-13', nguoiXem: { a: tb({ tp: '"><b>x' }) } }], [{}], { khoa: 'guiLuc', giam: true, origin: 'https://x' });
check('bang Lan gui: nhan 1 nguoi, title duoc escape', bangLg.includes('1 người, xem 1 lần') && !bangLg.includes('"><b>x'), bangLg);

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
