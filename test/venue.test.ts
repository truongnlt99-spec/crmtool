/** Test hàm thuần web/venue.js. Không chạm Firebase. */
import * as V from '../web/venue.js';
import { boDau } from '../web/bang-lead.js';

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};

console.log('\n>> tone');
const tones = V.danhSachTone({ t1: { id: 'nau', ten: 'Nâu', mau: '#7a5230' }, t2: { id: 'trang', ten: 'Trùng', mau: '#fff' } });
eq('10 mac dinh + 1 them, bo trung', tones.length, 11);
eq('tone them o cuoi', tones[10].id, 'nau');
eq('toneMau rong', V.danhSachTone(null).length, 10);

console.log('\n>> link');
eq('https ok', V.linkHopLe('https://www.facebook.com/hayday/posts/1'), true);
eq('http ok', V.linkHopLe('http://a.b'), true);
eq('javascript sai', V.linkHopLe('javascript:alert(1)'), false);
eq('khong giao thuc sai', V.linkHopLe('www.facebook.com'), false);
eq('co khoang trang giua sai', V.linkHopLe('https://a b'), false);

console.log('\n>> kiemTraSanPham');
const ids = tones.map((t) => t.id);
eq('hop le', V.kiemTraSanPham({ ten: 'Cổng hoa', link: 'https://fb.com/1', tone: ['xanh-la'] }, ids), null);
eq('thieu tone', !!V.kiemTraSanPham({ ten: 'A', link: 'https://fb.com/1', tone: [] }, ids), true);
eq('tone la', V.kiemTraSanPham({ ten: 'A', link: 'https://fb.com/1', tone: ['cam'] }, ids), 'Tone không có trong danh sách: cam');
eq('link sai', !!V.kiemTraSanPham({ ten: 'A', link: 'javascript:x', tone: ['do'] }, ids), true);
eq('thieu ten', !!V.kiemTraSanPham({ ten: ' ', link: 'https://fb.com/1', tone: ['do'] }, ids), true);

console.log('\n>> locSanPham');
const venues = {
  v1: { id: 'v1', ten: 'Gem Center', sanPham: {
    a: { id: 'a', ten: 'Tiệc tone xanh', link: 'https://fb.com/a', tone: ['xanh-la'], taoLuc: '2026-10-01' },
    b: { id: 'b', ten: 'Cổng hồng', link: 'https://fb.com/b', gia: 'Gói Standard', tone: ['hong', 'trang'], taoLuc: '2026-10-05' },
  } },
  v2: { id: 'v2', ten: 'Chloe Gallery', sanPham: {
    c: { id: 'c', ten: 'Ngoài trời', link: 'https://fb.com/c', tone: ['xanh-duong'], taoLuc: '2026-10-03' },
  } },
};
const ma = (r: any[]) => r.map((x) => x.sp.id);
eq('tat ca, moi nhat truoc', ma(V.locSanPham(venues)), ['b', 'c', 'a']);
eq('tone xanh-la', ma(V.locSanPham(venues, { tone: ['xanh-la'] })), ['a']);
eq('nhieu tone = bat ky', ma(V.locSanPham(venues, { tone: ['xanh-la', 'xanh-duong'] })), ['c', 'a']);
eq('q "gem" khop ten venue', ma(V.locSanPham(venues, { q: 'gem' })), ['b', 'a']);
eq('q khong dau khop ten sp', ma(V.locSanPham(venues, { q: 'cong hong' })), ['b']);
eq('q khop gia', ma(V.locSanPham(venues, { q: 'standard' })), ['b']);
eq('theo venue', ma(V.locSanPham(venues, { venueId: 'v2' })), ['c']);
eq('timVenueTheoTen khong dau', V.timVenueTheoTen(venues, 'gem center')?.id, 'v1');
eq('timVenueTheoTen khong co', V.timVenueTheoTen(venues, 'Nikko'), null);

console.log('\n>> venueTrongChu');
const chu = (s: string) => V.venueTrongChu(boDau(s));
eq('long nhau lay dai nhat + bo venue chung', chu('Địa chỉ nhà hàng : White Palace Phạm Văn Đồng. tiệc ở white palace'), ['White Palace Phạm Văn Đồng']);
eq('generic', chu('tiệc tối tại White Palace ngày 2/1'), ['White Palace']);
eq('hai venue', chu('dự kiến Chloe hoặc Maison de Charme Q7').sort(), ['Chloe Gallery', 'Maison de Charme']);
eq('khong khop giua tu', chu('chloegallery xyz'), []);
eq('pavillon c khong khop pavillon cho', chu('pavillon cho'), ['Pavillon']);

console.log('\n>> khopVenueMau');
const leads = [
  { id: 'L1', schedule: 'Lễ sáng tiệc tối Gem Center 500 khách' },
  { id: 'L2', schedule: 'tiệc', notesList: [{ text: 'Dạ tiệc ở Gem Center' }] },
  { id: 'L3', schedule: 'Chloe hoặc Maison de Charme Q7' },
  { id: 'L4', schedule: 'Gem Center', venueId: 'vX' },
  { id: 'L5', baoGia: { b1: { diaDiem: 'Trung tâm tiệc cưới Mipec, Hà Nội' } } },
  { id: 'L6', schedule: 'Nikko 25 bàn' },
];
const kq = V.khopVenueMau(leads, { v9: { id: 'v9', ten: 'NIKKO' } });
const gem = kq.goiY.find((g: any) => g.ten === 'Gem Center');
eq('gem: 2 lead gan, lead da co venue khong gan', gem?.leadIds, ['L1', 'L2']);
eq('gem dem ca lead da co venue', gem?.nhacDen, 3);
eq('lead 2 venue -> chon tay', kq.canChonTay, [{ leadId: 'L3', ten: ['Chloe Gallery', 'Maison de Charme'] }]);
eq('lead 2 venue khong tu gan', kq.goiY.find((g: any) => g.ten === 'Chloe Gallery')?.leadIds, []);
eq('dia diem bao gia', kq.goiY.find((g: any) => g.ten === 'Mipec')?.leadIds, ['L5']);
eq('venue da co trong kho bo qua', kq.goiY.some((g: any) => g.ten === 'Nikko'), false);

console.log('\n>> soLeadTheoVenue');
eq('dem', V.soLeadTheoVenue([{ venueId: 'a' }, { venueId: 'a' }, { venueId: null }, {}]), { a: 2 });

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
