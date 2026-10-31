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
  [{ soLanMo: 1, tongGiay: 59 }, 'xemQua'],
  [{ soLanMo: 1, tongGiay: 60 }, 'quanTam'],
  [{ soLanMo: 2 }, 'quanTam'],
  [{ soLanMo: 1, soLanTuongTac: 1 }, 'quanTam'],
];
for (const [vao, ra] of CA_NHAN) {
  check(`web ${JSON.stringify(vao)} -> ${ra}`, web.nhanLink(vao) === ra, web.nhanLink(vao));
  check(`server ${JSON.stringify(vao)} -> ${ra}`, mcp.nhanLink(vao) === ra, mcp.nhanLink(vao));
}
check('TEN_NHAN du 3 nhan', web.TEN_NHAN.quanTam === 'Quan tâm' && web.TEN_NHAN.xemQua === 'Xem qua' && web.TEN_NHAN.chuaMo === 'Chưa mở');

console.log('\n>> thongKeSanPham');
const links = {
  a: { leadId: 'l1', venueId: 'v1', spId: 's1', soLanMo: 3, soLanTuongTac: 0, tongGiay: 10 },
  b: { leadId: 'l2', venueId: 'v1', spId: 's1' },
  c: { leadId: 'l1', venueId: 'v1', spId: 's2', soLanMo: 1, soLanTuongTac: 2, lanCuoi: 50 },
};
check('2 khach cung san pham, 1 khach mo', bang(web.thongKeSanPham(links)['v1/s1'], { daGui: 2, khachMo: 1, tuongTac: 0 }), web.thongKeSanPham(links));
check('tuong tac dem so khach', web.thongKeSanPham(links)['v1/s2'].tuongTac === 1);
check('rong khong loi', bang(web.thongKeSanPham(null), {}));

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
  { id: '1', name: 'Mai Anh', phone: '0901234567', stage: 'baogia', updatedAt: '2026-10-01' },
  { id: '2', name: 'Hoàng Thu', phone: '', stage: 'leadin', updatedAt: '2026-10-05' },
  { id: '3', name: 'Đã chốt', stage: 'won', updatedAt: '2026-10-09' },
  { id: '4', name: 'Mất', stage: 'lost', updatedAt: '2026-10-10' },
];
check('rong: bo won/lost, moi truoc', bang(web.locKhach(leads, '').map((l: any) => l.id), ['2', '1']));
check('khong dau', web.locKhach(leads, 'hoang')[0]?.id === '2');
check('so dien thoai', web.locKhach(leads, '0901')[0]?.id === '1');
check('tim co ca khach da won', web.locKhach(leads, 'da chot')[0]?.id === '3');
check('limit', web.locKhach(leads, '', 1).length === 1);

console.log('\n>> chuoiCopyTatCa / thoiLuong');
check('moi mau 2 dong', web.chuoiCopyTatCa([{ tenSp: 'A', url: 'u1' }, { tenSp: 'B', url: 'u2' }]) === 'A\nu1\n\nB\nu2');
check('0 -> gach', web.thoiLuong(0) === '—');
check('45 -> 45s', web.thoiLuong(45) === '45s');
check('192 -> 3p12s', web.thoiLuong(192) === '3p12s');

console.log('\n>> kiemTraSuKien');
const T = 'abcDEF1234';
check('mo hop le', bang(mcp.kiemTraSuKien({ t: T, loai: 'mo' }), { t: T, loai: 'mo', giay: 0 }));
check('giay hop le', bang(mcp.kiemTraSuKien({ t: T, loai: 'giay', giay: 15 }), { t: T, loai: 'giay', giay: 15 }));
for (const xau of [null, 'x', { t: T, loai: 'la' }, { t: 'ngan', loai: 'mo' }, { t: '../x/y/z/', loai: 'mo' }, { t: T, loai: 'giay', giay: 0 },
  { t: T, loai: 'giay', giay: 31 }, { t: T, loai: 'giay', giay: '15' }, { t: T, loai: 'giay', giay: 1.5 }]) {
  check(`tu choi ${JSON.stringify(xau)}`, mcp.kiemTraSuKien(xau) === null, mcp.kiemTraSuKien(xau));
}

console.log('\n>> veTrangXem');
const FB = { token: T, tieuDe: 'Ảnh đẹp', anh: 'https://cdn.fb/a.jpg', linkGoc: 'https://www.facebook.com/hayday.media/posts/pfbidX', nenTang: 'facebook', ytId: null, origin: 'https://huyentran.vercel.app' };
const trangFb = mcp.veTrangXem(FB);
check('co og:title va og:image', /property="og:title" content="Ảnh đẹp"/.test(trangFb) && /property="og:image" content="https:\/\/cdn\.fb\/a\.jpg"/.test(trangFb));
check('fb: bo chu chu thich vi thu nho se khong doc duoc', trangFb.includes('show_text=false'));
check('khong co anh thi bo og:image', !/og:image/.test(mcp.veTrangXem({ ...FB, anh: '' })));
check('referrer giu origin, giau token', /<meta name="referrer" content="strict-origin">/.test(trangFb));
check('noindex', /name="robots" content="noindex"/.test(trangFb));
check('fb: iframe plugin + lop phu', trangFb.includes('plugins/post.php?href=https%3A%2F%2Fwww.facebook.com') && /<a id="phu" href="https:\/\/www\.facebook\.com/.test(trangFb));
const XSS = '"><script>window.bi=1</script>';
const trangXss = mcp.veTrangXem({ ...FB, tieuDe: XSS, anh: XSS, linkGoc: `https://x.vn/${XSS}` });
check('chong XSS tieu de, anh, link', !trangXss.includes('<script>window.bi=1'), trangXss.slice(0, 400));
check('link javascript khong thanh href', !/javascript:/.test(mcp.veTrangXem({ ...FB, linkGoc: 'javascript:alert(1)', nenTang: 'khac' })));
const trangYt = mcp.veTrangXem({ ...FB, nenTang: 'youtube', ytId: 'UrGCdCBCqq4', linkGoc: 'https://www.youtube.com/watch?v=UrGCdCBCqq4' });
check('yt: embed nocookie, jsapi, playsinline, origin', trangYt.includes('youtube-nocookie.com/embed/UrGCdCBCqq4?enablejsapi=1&amp;playsinline=1&amp;rel=0&amp;origin=https%3A%2F%2Fhuyentran.vercel.app'), trangYt.slice(0, 900));
check('yt: nap iframe_api, khong lop phu', trangYt.includes('https://www.youtube.com/iframe_api') && !trangYt.includes('id="phu"'));
check('yt: video thuong 16/9', trangYt.includes('16 / 9'));
check('yt: shorts 9/16', mcp.veTrangXem({ ...FB, nenTang: 'youtube', ytId: 'UrGCdCBCqq4', linkGoc: 'https://www.youtube.com/shorts/UrGCdCBCqq4' }).includes('9 / 16'));
const trangKhac = mcp.veTrangXem({ ...FB, nenTang: 'khac', linkGoc: 'https://hayday.vn/mau' });
check('khac: khong iframe', !trangKhac.includes('<iframe'));

console.log('\n>> JS_THEO_DOI');
const vm = await import('node:vm');
function chayTrang(cau: Record<string, unknown>, ls: Record<string, string> = {}) {
  const gui: any[] = [], the: Record<string, any> = {}, sk: Record<string, Function> = {};
  let bo: Function | null = null, huy = false, chuyen = '', bay = 1000, player: any = null, nemBeacon = false;
  const moi = (id: string) => (the[id] ||= { dataset: { src: 'https://f/x?a=1' }, style: {}, parentNode: { style: {} }, addEventListener: (_: string, f: Function) => { the[id].click = f; } });
  const ctx: any = {
    document: { visibilityState: 'visible', addEventListener: (n: string, f: Function) => { sk[n] = f; }, getElementById: (id: string) => (id === 'khong' ? null : moi(id)) },
    navigator: { sendBeacon: (_u: string, b: any) => { if (nemBeacon) throw new Error('x'); gui.push(JSON.parse(b.noiDung)); return true; } },
    localStorage: { getItem: (k: string) => ls[k] ?? null },
    Blob: function (this: any, a: string[]) { this.noiDung = a[0]; },
    setInterval: (f: Function) => { bo = f; return 1; }, clearInterval: () => { huy = true; },
    location: { replace: (u: string) => { chuyen = u; } },
    Date: { now: () => bay }, Math, JSON, innerWidth: 375,
    addEventListener: (n: string, f: Function) => { sk[n] = f; },
    YT: { Player: function (id: string, o: any) { player = { id, o }; } },
  };
  ctx.window = ctx; ctx.__xem = cau;
  vm.runInNewContext(mcp.JS_THEO_DOI, ctx);
  return { gui, the, ctx, sk, tick: () => bo && bo(), get huy() { return huy; }, get chuyen() { return chuyen; }, get player() { return player; },
    troi: (ms: number) => { bay += ms; }, nem: () => { nemBeacon = true; } };
}
const CFG = { t: T, linkGoc: 'https://www.facebook.com/a', nenTang: 'facebook' };
const p1 = chayTrang(CFG);
check('tai trang gui mo', bang(p1.gui, [{ t: T, loai: 'mo' }]), p1.gui);
check('fb: dung bai o 750px', p1.the.fbp.src === 'https://f/x?a=1&width=750', p1.the.fbp.src);
check('fb: thu nho vua man hinh 375', p1.the.fbp.style.transform === 'scale(0.5)' && p1.the.fbp.parentNode.style.height === '550px', p1.the.fbp);
p1.ctx.innerWidth = 1000; p1.sk.resize();
check('fb: man hinh rong giu cot 500px', p1.the.fbp.style.transform.startsWith('scale(0.66') && p1.the.fbp.parentNode.style.height === '733px', p1.the.fbp.style);
p1.troi(15000); p1.tick(); p1.troi(15000); p1.tick();
check('2 nhip gui giay:15', p1.gui.filter(g => g.loai === 'giay' && g.giay === 15).length === 2, p1.gui);
p1.the.phu.click();
check('bam lop phu gui tuongTac', p1.gui.at(-1).loai === 'tuongTac');

const p2 = chayTrang(CFG, { crmNoiBo: '1' });
p2.troi(15000); p2.tick(); p2.the.phu.click();
check('may noi bo khong gui gi', p2.gui.length === 0, p2.gui);

const p3 = chayTrang(CFG);
p3.ctx.document.visibilityState = 'hidden'; p3.troi(15000); p3.tick();
check('trang an khong tinh nhip', p3.gui.filter(g => g.loai === 'giay').length === 0, p3.gui);

const p4 = chayTrang(CFG);
p4.troi(9000); p4.ctx.document.visibilityState = 'hidden'; p4.sk.visibilitychange();
check('an trang gui phan giay le', p4.gui.at(-1)?.giay === 9, p4.gui);
p4.troi(60000); p4.ctx.document.visibilityState = 'visible'; p4.sk.visibilitychange(); p4.troi(15000); p4.tick();
check('hien lai: khong tinh luc an', p4.gui.at(-1)?.giay === 15, p4.gui);

const p5 = chayTrang(CFG);
for (let i = 0; i < 125; i++) { p5.troi(15000); p5.tick(); }
check('dung sau 120 nhip', p5.gui.filter(g => g.loai === 'giay').length === 120 && p5.huy, p5.gui.length);

const p6 = chayTrang(CFG); p6.nem();
let khongNem = true; try { p6.troi(15000); p6.tick(); p6.the.phu.click(); } catch { khongNem = false; }
check('beacon loi khong anh huong trang', khongNem);

const p7 = chayTrang({ ...CFG, nenTang: 'youtube' });
p7.ctx.onYouTubeIframeAPIReady();
check('yt: API noi chuyen dung ten mien nocookie', p7.player.o.host === 'https://www.youtube-nocookie.com', p7.player.o);
const ev = p7.player.o.events;
ev.onStateChange({ data: 1 }); ev.onStateChange({ data: 2 }); ev.onStateChange({ data: 1 });
check('phat video gui tuongTac dung 1 lan', p7.gui.filter(g => g.loai === 'tuongTac').length === 1, p7.gui);
ev.onError({ data: 150 });
check('video chan nhung -> chuyen sang link goc', p7.chuyen === CFG.linkGoc, p7.chuyen);

const p8 = chayTrang({ ...CFG, nenTang: 'khac', linkGoc: 'https://hayday.vn/mau' });
check('link khac: gui mo roi chuyen', p8.gui[0]?.loai === 'mo' && p8.chuyen === 'https://hayday.vn/mau', p8.gui);

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
