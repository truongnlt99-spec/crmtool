/**
 * Kiểm tra TĨNH Security Rules (firebase-rules.json / firebase-rules-deploy.json).
 * Không chạm mạng/database. Test rules trên DB thật nằm ở test phân quyền (Task 3).
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
const KHONG_KHOA = "taiKhoan/' + auth.uid + '/khoa').val() !== true";
const doc = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

const full = doc('firebase-rules.json');
const deploy = doc('firebase-rules-deploy.json');
const R = full.rules;

check('hai file rules: khoi rules giong het nhau', JSON.stringify(R) === JSON.stringify(deploy.rules));
check('file deploy chi co khoa rules', Object.keys(deploy).join() === 'rules');

const CAP = [
  ['crmData', 'crmData_users'],
  ['zalo', 'zalo_users'],
  ['aiData', 'aiData_users'],
  ['appConfig', 'appConfig_users'],
];
for (const [cu, moi] of CAP) {
  for (const k of ['.read', '.write']) {
    const a = String(R[cu]?.[k] ?? '').split(`'${OWNER}'`).join('$uid');
    const b = String(R[moi]?.$uid?.[k] ?? '');
    check(`${cu} ${k} == ${moi}.$uid ${k} (sau khi thay UID chu cu)`, a !== '' && a === b, `\n    ${a}\n    ${b}`);
  }
}

const KHO = ['crmData', 'zalo', 'aiData'];
const NHANH = [...CAP.flat()];
for (const ten of NHANH) {
  const node = R[ten]?.$uid ?? R[ten];
  for (const k of ['.read', '.write']) {
    check(`${ten} ${k} co kiem tra KHONG_KHOA`, String(node?.[k] ?? '').includes(KHONG_KHOA));
  }
}
for (const ten of [...KHO, 'crmData_users', 'zalo_users', 'aiData_users']) {
  const node = R[ten]?.$uid ?? R[ten];
  check(`${ten} .write khong co quyenXem (nguoi xem khong ghi)`, !String(node?.['.write'] ?? '').includes('quyenXem'));
  check(`${ten} .read cho nguoi xem + admin`, /quyenXem/.test(node?.['.read'] ?? '') && /admin/.test(node?.['.read'] ?? ''));
}
for (const ten of ['appConfig', 'appConfig_users']) {
  const node = R[ten]?.$uid ?? R[ten];
  check(`${ten} khong lo cho nguoi xem`, !/quyenXem/.test(node?.['.read'] ?? ''));
}

check('crmData giu .indexOn ownerUid', JSON.stringify(R.crmData?.leads?.['.indexOn']) === '["ownerUid"]');
check('aiData giu .indexOn status', JSON.stringify(R.aiData?.proposals?.['.indexOn']) === '["status"]');

check('khong con shareLog', !('shareLog' in R));
check('khong con shareLog_users', !('shareLog_users' in R));

check('co nhanh taiKhoan', !!R.taiKhoan);
check('taiKhoan .read chi admin', /admin/.test(R.taiKhoan?.['.read'] ?? '') && !/auth\.uid ===/.test(R.taiKhoan?.['.read'] ?? ''));
check('taiKhoan .write admin + chua khoa', /admin/.test(R.taiKhoan?.['.write'] ?? '') && String(R.taiKhoan?.['.write']).includes(KHONG_KHOA));
check('taiKhoan/$uid doc duoc ban ghi cua minh', /auth\.uid === \$uid/.test(R.taiKhoan?.$uid?.['.read'] ?? ''));
check('co nhanh quyenXem', !!R.quyenXem);
check('quyenXem .read chi admin', /admin/.test(R.quyenXem?.['.read'] ?? ''));
check('quyenXem .write admin + chua khoa', /admin/.test(R.quyenXem?.['.write'] ?? '') && String(R.quyenXem?.['.write']).includes(KHONG_KHOA));
check('quyenXem/$nguoiXem doc duoc cua minh', /auth\.uid === \$nguoiXem/.test(R.quyenXem?.$nguoiXem?.['.read'] ?? ''));
check('taiKhoan .read admin phai chua khoa', String(R.taiKhoan?.['.read']).includes(KHONG_KHOA));
check('taiKhoan/$uid .read: admin phai chua khoa', String(R.taiKhoan?.$uid?.['.read']).includes(KHONG_KHOA));
check('taiKhoan/$uid .read: chinh chu doc duoc ke ca khi bi khoa', String(R.taiKhoan?.$uid?.['.read']).startsWith('auth.uid === $uid ||'));
check('quyenXem .read admin phai chua khoa', String(R.quyenXem?.['.read']).includes(KHONG_KHOA));
check('quyenXem/$nguoiXem .read: chinh chu khong can chua khoa', R.quyenXem?.$nguoiXem?.['.read'] === 'auth.uid === $nguoiXem');
check('authLog .read phai chua khoa', String(R.authLog?.['.read']).includes(KHONG_KHOA));
check('authLog .read co admin', /admin/.test(R.authLog?.['.read'] ?? '') && String(R.authLog['.read']).includes(OWNER));

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
