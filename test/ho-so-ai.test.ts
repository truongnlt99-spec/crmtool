/**
 * Test hàm thuần của hồ sơ khách AI — phía server (api/mcp.ts). Không chạm Firebase.
 * Task 2 bổ sung phần phía app (web/ho-so-ai.js) vào cuối file này.
 */
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

console.log('\n>> aiRootFromDataRoot');
eq('chu cu', S.aiRootFromDataRoot('crmData'), 'aiData');
eq('tai khoan khac', S.aiRootFromDataRoot('crmData_users/U1'), 'aiData_users/U1');
eq('sandbox', S.aiRootFromDataRoot('crmDataTest'), 'aiDataTest');

console.log('\n>> kiemTraGiaTriO');
// Bộ ca dùng chung — Task 2 chạy lại đúng bộ này trên web/ho-so-ai.js
const CA_GIA_TRI: Array<[string, unknown, boolean]> = [
  ['weddingDate', '2026-12-12', true],
  ['weddingDate', '2026-02-30', false],
  ['weddingDate', '12/12/2026', false],
  ['package', 'Signature', true],
  ['package', 'VIP', false],
  ['revenueExpected', 45000000, true],
  ['revenueExpected', -1, false],
  ['revenueExpected', 1.5, false],
  ['revenueExpected', '45000000', false],
  ['expectedCloseMonth', '2026-11', true],
  ['expectedCloseMonth', '2026-13', false],
  ['phone', '0901234567', true],
  ['phone', '', false],
  ['phone', 'x'.repeat(101), false],
  ['persona', 'Cô dâu làm ngân hàng, thích phong cách tự nhiên', true],
  ['persona', 'x'.repeat(2001), false],
  ['stage', 'won', false],
  ['revenueActual', 1, false],
];
for (const [f, v, hopLe] of CA_GIA_TRI) {
  eq(`${f}=${JSON.stringify(v).slice(0, 30)} -> ${hopLe ? 'hop le' : 'loi'}`, S.kiemTraGiaTriO(f, v) === null, hopLe);
}

console.log('\n>> giaTriBang');
eq('so va so', S.giaTriBang(45000000, 45000000), true);
eq('chuoi co khoang trang', S.giaTriBang(' Signature ', 'Signature'), true);
eq('rong va null', S.giaTriBang('', null), true);
eq('undefined va null', S.giaTriBang(undefined, null), true);
eq('khac nhau', S.giaTriBang('2026-12-12', '2026-12-13'), false);

console.log('\n>> trichDanKhop');
eq('khop sau chuan hoa', S.trichDanKhop('tụi EM   cưới 12/12', 'Dạ tụi em cưới 12/12 nha chị'), true);
eq('khong khop', S.trichDanKhop('cưới 13/12', 'Dạ tụi em cưới 12/12 nha chị'), false);
eq('qua ngan', S.trichDanKhop('em', 'Dạ tụi em cưới'), false);
// NFD (gõ trên Mac) vẫn khớp NFC
eq('NFD khop NFC', S.trichDanKhop('cưới'.normalize('NFD') + ' 12/12', 'tụi em cưới 12/12'), true);

console.log('\n>> gopTin');
const msgs = {
  c1: {
    '11': { at: 3000, fromMe: false, kind: 'text', text: 'Ba' },
    '10': { at: 1000, fromMe: true, kind: 'text', text: 'Một' },
  },
  g2: {
    '20': { at: 2000, fromMe: false, kind: 'text', text: 'Hai', senderName: 'Minh Tuấn' },
    '21': { at: 500, fromMe: false, kind: 'text', text: 'cũ hơn con trỏ' },
  },
} as any;
const tin = S.gopTin(msgs, { c1: 'Lan Nguyễn', g2: 'Nhóm cưới' }, 900);
eq('xep theo at, bo tin <= sauAt', tin.map((t) => t.msgId), ['10', '20', '11']);
eq('ten nguoi gui', tin.map((t) => t.from), ['Mình', 'Minh Tuấn', 'Lan Nguyễn']);

console.log('\n>> tinhDotTin');
const T = (msgId: string, at: number, thieu = false) => ({ convId: 'c1', msgId, at, thieu, from: 'Khách', text: thieu ? '' : 'x' });
const NOW = 10 * 24 * 3600_000;
{
  const r = S.tinhDotTin([T('a', 1), T('b', 2), T('c', 3)], 400, NOW);
  eq('du it tin: lay het, con tro = tin cuoi', [r.dot.length, r.conLai, r.cursorDeXuat], [3, 0, 3]);
}
{
  const r = S.tinhDotTin([T('a', 1), T('b', 2), T('c', 3)], 2, NOW);
  eq('cat dot', [r.dot.map((t) => t.msgId), r.conLai, r.cursorDeXuat], [['a', 'b'], 1, 2]);
}
{
  // Review Focus 1: không cắt giữa nhóm cùng mốc at
  const r = S.tinhDotTin([T('a', 1), T('b', 2), T('c', 2), T('d', 3)], 2, NOW);
  eq('khong cat giua nhom cung at', [r.dot.map((t) => t.msgId), r.cursorDeXuat], [['a'], 1]);
}
{
  const r = S.tinhDotTin([T('b', 2), T('c', 2), T('d', 3)], 1, NOW);
  eq('nhom cung at lon hon toiDa: lay ca nhom', [r.dot.map((t) => t.msgId), r.cursorDeXuat], [['b', 'c'], 2]);
}
{
  const r = S.tinhDotTin([T('a', NOW - 1000), T('b', NOW - 500, true), T('c', NOW - 100)], 400, NOW);
  eq('tin thieu moi: con tro dung truoc', [r.dot.length, r.cursorDeXuat], [3, NOW - 1000]);
}
{
  const r = S.tinhDotTin([T('b', NOW - 500, true)], 400, NOW);
  eq('tin dau tien thieu: con tro null', r.cursorDeXuat, null);
}
{
  // Review Focus 2: tin thiếu quá 3 ngày không chặn con trỏ
  const cu = NOW - 4 * 24 * 3600_000;
  const r = S.tinhDotTin([T('a', cu, true), T('b', cu + 1)], 400, NOW);
  eq('tin thieu qua 3 ngay: bo qua', r.cursorDeXuat, cu + 1);
}
{
  // Fix round 1: tin thiếu mới cùng mốc at với tin thật phía trước -> con trỏ phải lùi hẳn về null
  const r = S.tinhDotTin([T('a', NOW - 500), T('b', NOW - 500, true), T('c', NOW - 100)], 400, NOW);
  eq('thieu moi cung at voi tin that truoc: con tro null', r.cursorDeXuat, null);
}
{
  // Fix round 1: lùi về mốc nhỏ hơn at của tin thiếu
  const r = S.tinhDotTin([T('z', NOW - 900), T('a', NOW - 500), T('b', NOW - 500, true)], 400, NOW);
  eq('thieu moi: con tro lui ve moc truoc do', r.cursorDeXuat, NOW - 900);
}

console.log('\n>> kiemTraBangChung');
{
  const theoConv = { c1: { '10': { at: 1, kind: 'text', text: 'Tụi em cưới 12/12 nha chị' } } } as any;
  eq('hop le', S.kiemTraBangChung([{ convId: 'c1', msgId: '10', quote: 'cưới 12/12' }], theoConv, 'nhuCau'), []);
  const loi = S.kiemTraBangChung([
    { convId: 'c9', msgId: '10', quote: 'cưới 12/12' },
    { convId: 'c1', msgId: '99', quote: 'cưới 12/12' },
    { convId: 'c1', msgId: '10', quote: 'cưới 13/12' },
  ], theoConv, 'nhuCau');
  eq('3 loi', loi.length, 3);
  check('loi hoi thoai la', /c9/.test(loi[0]) && /không thuộc lead/.test(loi[0]), loi[0]);
  check('loi tin khong co', /99/.test(loi[1]), loi[1]);
  check('loi khong khop', /không khớp/.test(loi[2]), loi[2]);
  // tin file: khớp theo tên file
  const file = { c1: { '11': { at: 2, kind: 'file', text: '', fileName: 'Bao gia HayDay.pdf' } } } as any;
  eq('khop ten file', S.kiemTraBangChung([{ convId: 'c1', msgId: '11', quote: 'bao gia hayday' }], file, 'x'), []);
  // Fix round 1: thuộc tính kế thừa của Object không được coi là hội thoại của lead
  const proto = S.kiemTraBangChung([{ convId: 'constructor', msgId: '10', quote: 'cưới 12/12' }], theoConv, 'nhuCau');
  eq('constructor khong la hoi thoai cua lead', proto.length === 1 && /không thuộc lead/.test(proto[0]), true);
}

console.log('\n>> xetDeXuat');
{
  const lead = { id: 'L1', weddingDate: '2026-12-12', package: 'Unique' };
  const ds: S.DeXuat[] = [
    { id: 'f_a', leadId: 'L1', type: 'field', field: 'package', newValue: 'Signature', status: 'cho', reason: '', evidence: [], createdAt: '' },
    { id: 'f_b', leadId: 'L1', type: 'field', field: 'phone', newValue: '0901', status: 'bo', reason: '', evidence: [], createdAt: '' },
    { id: 'todo_h_1', leadId: 'L1', type: 'todo', huaId: 'h_1', status: 'duyet', reason: '', evidence: [], createdAt: '' },
  ];
  eq('gia tri da dung', S.xetDeXuat({ type: 'field', field: 'weddingDate', newValue: '2026-12-12' }, lead, ds).hanhDong, 'boQua');
  eq('da bi bo dung gia tri', S.xetDeXuat({ type: 'field', field: 'phone', newValue: '0901' }, lead, ds).hanhDong, 'boQua');
  eq('bo roi nhung gia tri khac -> tao', S.xetDeXuat({ type: 'field', field: 'phone', newValue: '0902' }, lead, ds).hanhDong, 'tao');
  eq('dang cho cung o -> thay', S.xetDeXuat({ type: 'field', field: 'package', newValue: 'Standard' }, lead, ds), { hanhDong: 'thay', idCu: 'f_a' });
  eq('todo da co', S.xetDeXuat({ type: 'todo', huaId: 'h_1' }, lead, ds).hanhDong, 'boQua');
  eq('todo moi', S.xetDeXuat({ type: 'todo', huaId: 'h_2' }, lead, ds).hanhDong, 'tao');
}

// Task 2 nối thêm phần web vào đây, trước dòng tổng kết.

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
