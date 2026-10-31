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

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
