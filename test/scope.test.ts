/** Test resolveScope: phân giải token/khoá -> kho dữ liệu. Hàm thuần, không chạm Firebase. */
import { resolveScope } from '../api/mcp.ts';

const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};

// Token hex thuần (link cũ) -> chủ cũ
eq('hex thuần -> chủ cũ', resolveScope('abcd1234ef'), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

// Tiền tố đúng UID chủ cũ -> vẫn scope chủ cũ
eq('tiền tố OWNER -> chủ cũ', resolveScope(`${OWNER}.abcd`), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

// Tài khoản mới -> kho riêng
eq('uid khác -> kho riêng', resolveScope('HGpKBnj7qiUvKTG8HvcI72Se4Qr2.abcd'), {
  uid: 'HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  dataRoot: 'crmData_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  configPath: 'appConfig_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  shareLogPath: 'shareLog_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
});

// Rỗng / không hợp lệ -> chủ cũ (an toàn)
eq('rỗng -> chủ cũ', resolveScope(''), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});
eq('dấu chấm đầu chuỗi -> chủ cũ', resolveScope('.abcd'), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
