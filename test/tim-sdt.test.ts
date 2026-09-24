/** Test khopSoDienThoai: tìm deal theo SĐT trên link chia sẻ. Hàm thuần, không chạm Firebase. */
import { khopSoDienThoai } from '../api/mcp.ts';

let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};

// Khớp đủ số, bỏ qua dấu cách / chấm / gạch
eq('đủ số, cách viết khác nhau', khopSoDienThoai('0901 234 567', '0901.234.567'), true);
eq('đủ số, dạng +84', khopSoDienThoai('0901234567', '+84 901 234 567'), true);
eq('lưu dạng 84, gõ dạng 0', khopSoDienThoai('84901234567', '0901234567'), true);
eq('gõ thiếu số 0 đầu', khopSoDienThoai('0901234567', '901234567'), true);

// Không cho dò từng phần: gõ ít hơn 9 chữ số thì không khớp gì cả
eq('gõ 4 số cuối không khớp', khopSoDienThoai('0901234567', '4567'), false);
eq('gõ 8 số không khớp', khopSoDienThoai('0901234567', '01234567'), false);
eq('số khác không khớp', khopSoDienThoai('0901234567', '0901234568'), false);
eq('lead không có SĐT', khopSoDienThoai('', '0901234567'), false);
eq('lead có SĐT ngắn bất thường', khopSoDienThoai('567', '0901234567'), false);

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exit(1);
