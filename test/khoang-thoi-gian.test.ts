/**
 * Test riêng phần tính khoảng thời gian cho báo cáo chia sẻ.
 * Không chạm database — chỉ gọi endpoint với dữ liệu giả để đọc lại tu/den/nhãn.
 */
import fs from 'node:fs';

const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

// Import thẳng từ module thật — không bóc tách chuỗi, nên test luôn bám đúng code đang chạy
const { tinhKhoang, cacThangTrongKhoang, dauTuan }: any = await import('../api/mcp.ts');

const HOM_NAY = '2026-09-04';   // thứ Sáu

console.log('\n>> Tuan (bat dau thu Hai)');
const t0 = tinhKhoang('tuan', 0, HOM_NAY);
check('tuan nay: 31/08 - 06/09', t0.tu === '2026-08-31' && t0.den === '2026-09-06', `${t0.tu} → ${t0.den}`);
const t1 = tinhKhoang('tuan', 1, HOM_NAY);
check('tuan truoc: 24/08 - 30/08', t1.tu === '2026-08-24' && t1.den === '2026-08-30', `${t1.tu} → ${t1.den}`);
check('CHU NHAT thuoc tuan dang chay', dauTuan('2026-09-06') === '2026-08-31', dauTuan('2026-09-06'));

console.log('\n>> Thang');
const m0 = tinhKhoang('thang', 0, HOM_NAY);
check('thang nay: 01/09 - 30/09', m0.tu === '2026-09-01' && m0.den === '2026-09-30', `${m0.tu} → ${m0.den}`);
const m9 = tinhKhoang('thang', 9, HOM_NAY);
check('lui 9 thang -> 12/2025 (giao nam)', m9.tu === '2025-12-01' && m9.den === '2025-12-31', `${m9.tu} → ${m9.den}`);
const mFeb = tinhKhoang('thang', 7, HOM_NAY);
check('thang 2/2026 co 28 ngay', mFeb.den === '2026-02-28', mFeb.den);
const mFeb24 = tinhKhoang('thang', 31, HOM_NAY);
check('thang 2/2024 NHUAN co 29 ngay', mFeb24.den === '2024-02-29', mFeb24.den);

console.log('\n>> Quy');
const q0 = tinhKhoang('quy', 0, HOM_NAY);
check('quy nay = Q3/2026: 01/07 - 30/09', q0.tu === '2026-07-01' && q0.den === '2026-09-30', `${q0.tu} → ${q0.den}`);
check('nhan dung', q0.nhan === 'Quý 3/2026', q0.nhan);
const q1 = tinhKhoang('quy', 1, HOM_NAY);
check('quy truoc = Q2/2026', q1.tu === '2026-04-01' && q1.den === '2026-06-30', `${q1.tu} → ${q1.den}`);
const q3 = tinhKhoang('quy', 3, HOM_NAY);
check('lui 3 quy -> Q4/2025 (giao nam)', q3.tu === '2025-10-01' && q3.den === '2025-12-31', `${q3.tu} → ${q3.den}`);

console.log('\n>> Nam');
const y0 = tinhKhoang('nam', 0, HOM_NAY);
check('nam nay: 01/01 - 31/12', y0.tu === '2026-01-01' && y0.den === '2026-12-31', `${y0.tu} → ${y0.den}`);
const y2 = tinhKhoang('nam', 2, HOM_NAY);
check('lui 2 nam -> 2024', y2.nhan === 'Năm 2024', y2.nhan);

console.log('\n>> Tuy chon');
const c1 = tinhKhoang('tuyChon', 0, HOM_NAY, '2026-08-10', '2026-08-20');
check('nhan dung khoang da chon', c1.tu === '2026-08-10' && c1.den === '2026-08-20');
const c2 = tinhKhoang('tuyChon', 0, HOM_NAY, '2026-08-20', '2026-08-10');
check('chon nguoc thi tu dao lai', c2.tu === '2026-08-10' && c2.den === '2026-08-20', `${c2.tu} → ${c2.den}`);
const c3 = tinhKhoang('tuyChon', 0, HOM_NAY, 'bay-ba', undefined);
check('ngay bay ba -> lui ve hom nay', c3.tu === HOM_NAY && c3.den === HOM_NAY, `${c3.tu} → ${c3.den}`);

console.log('\n>> Cac thang ma khoang cham toi');
check('trong 1 thang -> 1 ma', JSON.stringify(cacThangTrongKhoang('2026-09-01','2026-09-30')) === '["2026-09"]');
check('quy -> 3 ma', JSON.stringify(cacThangTrongKhoang('2026-07-01','2026-09-30')) === '["2026-07","2026-08","2026-09"]');
check('tuan giao thang -> 2 ma', JSON.stringify(cacThangTrongKhoang('2026-08-31','2026-09-06')) === '["2026-08","2026-09"]');
check('ca nam -> 12 ma', cacThangTrongKhoang('2026-01-01','2026-12-31').length === 12);

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exit(1);
