/**
 * Test hàm thuần của bảng Danh sách lead (web/bang-lead.js). Không chạm mạng/database.
 */
import * as B from '../web/bang-lead.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};
const ids = (ls: any[]) => ls.map(l => l.id).join(',');

const ctx = {
  leadStatus: (l: any) => {
    if (l.stage === 'won') return { type: 'won', label: 'Đã chốt ✓' };
    if (l.stage === 'lost') return { type: 'lost', label: 'Đã đóng' };
    if (!l.deadline) return { type: 'gray', label: 'Chưa hẹn' };
    if (l.deadline < '2026-10-14') return { type: 'red', label: 'Trễ' };
    if (l.deadline === '2026-10-14') return { type: 'green', label: 'Hôm nay' };
    return { type: 'gray', label: 'Còn' };
  },
  leadTypeOf: (l: any) => l.leadType || 'Lead công ty',
  stageName: (id: string) => ({ leadin: 'Lead in', baogia: 'Báo giá', won: 'Won', lost: 'Lost' } as any)[id] || id || '',
  coZalo: (l: any) => l.id === 'A',
};

const LEADS = [
  { id: 'A', name: 'Nguyễn Thị Hằng', phone: '0901', package: 'Unique', stage: 'leadin', deadline: '2026-10-10',
    weddingDate: '2026-12-01', revenueExpected: 30000000, createdAt: '2026-09-01', tags: ['VIP'],
    todos: [{ done: true }, { done: false }], notesList: [{ text: 'cũ' }, { text: 'mới nhất' }] },
  { id: 'B', name: 'Trần Minh', package: 'Standard', stage: 'won', revenueExpected: 20000000, revenueActual: 25000000,
    weddingDate: '2026-11-15', createdAt: '2026-09-05', wonAt: '2026-10-01' },
  { id: 'C', name: 'Lê Hà', package: 'Unique', stage: 'baogia', deadline: '2026-10-14', createdAt: '2026-08-20',
    expectedCloseMonth: '2026-11', leadType: 'Lead salehunt' },
  // lead cũ thiếu gần hết trường
  { id: 'D', name: 'Cũ', stage: 'lost', lostReason: 'Giá cao', createdAt: '2026-07-01' },
];

console.log('\n>> boDau');
check('bo dau + chu thuong', B.boDau('Nguyễn Đức HẰNG') === 'nguyen duc hang');
check('null -> rong', B.boDau(null) === '' && B.boDau(undefined) === '');

console.log('\n>> COT');
check('cot dau la name', B.COT[0].khoa === 'name');
check('khoa khong trung', new Set(B.COT.map((c: any) => c.khoa)).size === B.COT.length);
check('du 20 cot', B.COT.length === 20, String(B.COT.length));

console.log('\n>> layGiaTri');
check('status tre', B.layGiaTri('status', LEADS[0], ctx) === 'Trễ hẹn');
check('status hom nay', B.layGiaTri('status', LEADS[2], ctx) === 'Hôm nay');
check('status won/lost', B.layGiaTri('status', LEADS[1], ctx) === 'Won' && B.layGiaTri('status', LEADS[3], ctx) === 'Lost');
check('status chua hen', B.layGiaTri('status', { stage: 'leadin' }, ctx) === 'Chưa hẹn');
check('status con han', B.layGiaTri('status', { stage: 'leadin', deadline: '2026-12-01' }, ctx) === 'Còn hạn');
check('todos = so viec chua xong', B.layGiaTri('todos', LEADS[0], ctx) === 1);
check('todos thieu -> null', B.layGiaTri('todos', LEADS[3], ctx) === null);
check('lastNote = phan tu cuoi', B.layGiaTri('lastNote', LEADS[0], ctx) === 'mới nhất');
check('tags noi bang dau phay', B.layGiaTri('tags', LEADS[0], ctx) === 'VIP');
check('tien thieu -> null', B.layGiaTri('revenueActual', LEADS[0], ctx) === null);
check('tien 0 van la 0', B.layGiaTri('revenueExpected', { revenueExpected: 0 }, ctx) === 0);
check('leadType mac dinh', B.layGiaTri('leadType', LEADS[0], ctx) === 'Lead công ty');
check('stage -> ten', B.layGiaTri('stage', LEADS[2], ctx) === 'Báo giá');
check('zalo co/khong', B.layGiaTri('zalo', LEADS[0], ctx) === 'Có' && B.layGiaTri('zalo', LEADS[1], ctx) === 'Không');
check('ngay thieu -> rong', B.layGiaTri('weddingDate', LEADS[3], ctx) === '');

console.log('\n>> locLead');
check('khong loc -> giu het', ids(B.locLead(LEADS, {}, '', ctx)) === 'A,B,C,D');
check('tim ten khong dau', ids(B.locLead(LEADS, {}, 'hang', ctx)) === 'A');
check('loc chu chua', ids(B.locLead(LEADS, { phone: { chua: '090' } }, '', ctx)) === 'A');
check('loc chu rong -> bo qua', ids(B.locLead(LEADS, { phone: { chua: '  ' } }, '', ctx)) === 'A,B,C,D');
check('loc chon', ids(B.locLead(LEADS, { package: { chon: ['Unique'] } }, '', ctx)) === 'A,C');
check('loc chon gia tri rong', ids(B.locLead(LEADS, { package: { chon: [''] } }, '', ctx)) === 'D');
check('loc chon mang rong -> 0 dong', B.locLead(LEADS, { package: { chon: [] } }, '', ctx).length === 0);
check('loc khoang ngay 2 dau', ids(B.locLead(LEADS, { weddingDate: { tu: '2026-11-01', den: '2026-11-30' } }, '', ctx)) === 'B');
check('loc khoang ngay 1 dau, bo dong rong', ids(B.locLead(LEADS, { weddingDate: { tu: '2026-11-20' } }, '', ctx)) === 'A');
check('loc khoang so', ids(B.locLead(LEADS, { revenueExpected: { tu: 25000000 } }, '', ctx)) === 'A');
check('loc khoang thang', ids(B.locLead(LEADS, { expectedCloseMonth: { den: '2026-11' } }, '', ctx)) === 'C');
check('khoang trong ca 2 dau -> bo qua', ids(B.locLead(LEADS, { weddingDate: { tu: '', den: '' } }, '', ctx)) === 'A,B,C,D');
check('khoa la -> bo qua', ids(B.locLead(LEADS, { khongCo: { chua: 'x' } }, '', ctx)) === 'A,B,C,D');
check('ket hop tim + loc', ids(B.locLead(LEADS, { package: { chon: ['Unique'] } }, 'le', ctx)) === 'C');

console.log('\n>> sapXep');
check('ngay tang', ids(B.sapXep(LEADS, { khoa: 'createdAt', chieu: 'tang' }, ctx)) === 'D,C,A,B');
check('ngay giam', ids(B.sapXep(LEADS, { khoa: 'createdAt', chieu: 'giam' }, ctx)) === 'B,A,C,D');
check('rong xuong cuoi khi tang', ids(B.sapXep(LEADS, { khoa: 'weddingDate', chieu: 'tang' }, ctx)) === 'B,A,C,D');
check('rong xuong cuoi khi giam', ids(B.sapXep(LEADS, { khoa: 'revenueExpected', chieu: 'giam' }, ctx)) === 'A,B,C,D');
check('chu theo tieng Viet', ids(B.sapXep(LEADS, { khoa: 'name', chieu: 'tang' }, ctx)) === 'D,C,A,B');
check('trang thai theo thu tu muc do', ids(B.sapXep(LEADS, { khoa: 'status', chieu: 'tang' }, ctx)) === 'A,C,B,D');
check('on dinh khi bang nhau', ids(B.sapXep(LEADS, { khoa: 'package', chieu: 'tang' }, ctx)) === 'B,A,C,D');
check('khong doi mang goc', ids(LEADS) === 'A,B,C,D');
check('khoa la -> giu nguyen', ids(B.sapXep(LEADS, { khoa: 'xyz', chieu: 'tang' }, ctx)) === 'A,B,C,D');

console.log('\n>> tinhTong / giaTriDuyNhat / soCotDangLoc');
const t = B.tinhTong(LEADS);
check('tong', t.soLead === 4 && t.duKien === 50000000 && t.thucTe === 25000000, JSON.stringify(t));
check('tong rong', JSON.stringify(B.tinhTong([])) === JSON.stringify({ soLead: 0, duKien: 0, thucTe: 0 }));
check('gia tri duy nhat (co rong, sap xep)', JSON.stringify(B.giaTriDuyNhat(LEADS, 'package', ctx)) === JSON.stringify(['', 'Standard', 'Unique']));
check('gia tri duy nhat status theo thu tu', JSON.stringify(B.giaTriDuyNhat(LEADS, 'status', ctx)) === JSON.stringify(['Trễ hẹn', 'Hôm nay', 'Won', 'Lost']));
check('dem cot dang loc', B.soCotDangLoc({ a: { chua: 'x' }, b: { chua: ' ' }, c: { chon: [] }, d: { tu: '', den: '' }, e: { den: 5 } }) === 3);

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
