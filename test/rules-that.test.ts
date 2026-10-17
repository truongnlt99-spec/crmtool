/**
 * Test Security Rules THẬT của Realtime Database (phân quyền tài khoản).
 *
 * CẦN DÁN firebase-rules-deploy.json VÀO FIREBASE CONSOLE (Realtime Database -> Rules -> Publish)
 * TRƯỚC KHI CHẠY. Rules trong repo không tự có hiệu lực.
 *
 * Tạo 4 user Auth tạm (pq-*@test.local): chủ C, người xem X, admin A, người lạ L.
 * Mọi nhánh test nằm dưới UID của các user tạm; dọn sạch trong finally.
 */
import fs from 'node:fs';
import { createSign, randomBytes } from 'node:crypto';

console.log('LUU Y: Can dan firebase-rules-deploy.json vao Console (Publish) truoc khi chay test nay.');

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const API_KEY = 'AIzaSyDT8jy6J5ohBbnJxZdrOnZhyI57D2ZRDhQ';
const IT = 'https://identitytoolkit.googleapis.com/v1';

const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local'); process.exit(1); }
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function laySaToken(scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));
  const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
  const r: any = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
  })).json();
  return r.access_token as string;
}
const tkDb = await laySaToken('https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email');
const tkIt = await laySaToken('https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform');

/** Ghi/đọc bằng service account (bỏ qua rules). */
const dbSa = (path: string, init: RequestInit = {}) => fetch(`${DB}/${path}.json`, {
  ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkDb}` },
});
/** Gọi như một người dùng thật, qua ?auth=<ID token>. */
const dbAs = (idToken: string, path: string, init: RequestInit = {}) =>
  fetch(`${DB}/${path}.json?auth=${encodeURIComponent(idToken)}`, {
    ...init, headers: { 'Content-Type': 'application/json' },
  });
const doc = async (idToken: string, path: string) => (await dbAs(idToken, path)).status;
const ghi = async (idToken: string, path: string, data: unknown) =>
  (await dbAs(idToken, path, { method: 'PATCH', body: JSON.stringify(data) })).status;

const itAdmin = async (hanhDong: string, body: unknown) => {
  const r = await fetch(`${IT}/projects/huyentrancrm/${hanhDong}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkIt}` }, body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() as any };
};
const dangNhap = async (email: string, matKhau: string) => {
  const r = await fetch(`${IT}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: matKhau, returnSecureToken: true }),
  });
  return await r.json() as any;
};

const rand = randomBytes(4).toString('hex');
const MAT_KHAU = 'MatKhauTest' + rand;
type U = { uid: string; token: string };
const cacUid: string[] = [];
async function taoUser(ten: string): Promise<U> {
  const email = `pq-${ten}-${rand}@test.local`;
  const t = await itAdmin('accounts', { email, password: MAT_KHAU, emailVerified: true });
  if (t.status !== 200) throw new Error(`Khong tao duoc user test ${ten}: ${t.status} ${JSON.stringify(t.data)}`);
  cacUid.push(t.data.localId);
  const dn = await dangNhap(email, MAT_KHAU);
  return { uid: t.data.localId, token: dn.idToken };
}

try {
  const C = await taoUser('chu'), X = await taoUser('xem'), A = await taoUser('admin'), L = await taoUser('la');

  // Seed bằng service account
  await dbSa(`taiKhoan/${C.uid}`, { method: 'PATCH', body: JSON.stringify({ email: 'c@test.local', ten: 'C', coKho: true, admin: false, khoa: false }) });
  await dbSa(`taiKhoan/${X.uid}`, { method: 'PATCH', body: JSON.stringify({ email: 'x@test.local', ten: 'X', coKho: false, admin: false, khoa: false }) });
  await dbSa(`taiKhoan/${A.uid}`, { method: 'PATCH', body: JSON.stringify({ email: 'a@test.local', ten: 'A', coKho: false, admin: true, khoa: false }) });
  await dbSa(`taiKhoan/${L.uid}`, { method: 'PATCH', body: JSON.stringify({ email: 'l@test.local', ten: 'L', coKho: false, admin: false, khoa: false }) });
  await dbSa(`quyenXem/${X.uid}/${C.uid}`, { method: 'PUT', body: JSON.stringify({ crm: true, zalo: false, ai: false, tenChuKho: 'C' }) });
  await dbSa(`crmData_users/${C.uid}/leads/t1`, { method: 'PUT', body: JSON.stringify({ id: 't1', name: 'Khach test' }) });
  await dbSa(`zalo_users/${C.uid}/meta`, { method: 'PUT', body: JSON.stringify({ x: 1 }) });
  await dbSa(`aiData_users/${C.uid}/briefs/t1`, { method: 'PUT', body: JSON.stringify({ x: 1 }) });
  await dbSa(`appConfig_users/${C.uid}`, { method: 'PATCH', body: JSON.stringify({ ghiChu: 'bi mat' }) });

  console.log('\n>> Chủ C trên kho của mình');
  for (const p of ['crmData_users', 'zalo_users', 'aiData_users']) {
    check(`C đọc ${p}/C`, (await doc(C.token, `${p}/${C.uid}`)) === 200);
    check(`C ghi ${p}/C`, (await ghi(C.token, `${p}/${C.uid}/probe`, { v: 1 })) === 200);
  }

  console.log('\n>> Người xem X (chỉ crm)');
  check('X đọc crmData_users/C', (await doc(X.token, `crmData_users/${C.uid}`)) === 200);
  check('X đọc zalo_users/C bị chặn', (await doc(X.token, `zalo_users/${C.uid}`)) === 401);
  check('X đọc aiData_users/C bị chặn', (await doc(X.token, `aiData_users/${C.uid}`)) === 401);
  check('X đọc appConfig_users/C bị chặn', (await doc(X.token, `appConfig_users/${C.uid}`)) === 401);
  check('X ghi lead của C bị chặn', (await ghi(X.token, `crmData_users/${C.uid}/leads/t1`, { name: 'hack' })) === 401);
  check('X ghi crmData_users/X bị chặn (coKho=false)', (await ghi(X.token, `crmData_users/${X.uid}`, { leads: { a: { id: 'a' } } })) === 401);
  check('X tự cấp quyền zalo bị chặn', (await ghi(X.token, `quyenXem/${X.uid}/${C.uid}`, { zalo: true })) === 401);

  console.log('\n>> Admin A');
  check('A đọc crmData_users/C', (await doc(A.token, `crmData_users/${C.uid}`)) === 200);
  check('A ghi crmData_users/C', (await ghi(A.token, `crmData_users/${C.uid}/probe`, { v: 2 })) === 200);
  check('A đọc taiKhoan', (await doc(A.token, 'taiKhoan')) === 200);

  console.log('\n>> Người lạ L');
  check('L đọc crmData_users/C bị chặn', (await doc(L.token, `crmData_users/${C.uid}`)) === 401);
  check('L đọc taiKhoan bị chặn', (await doc(L.token, 'taiKhoan')) === 401);

  console.log('\n>> Khoá C -> cắt ngay bằng token cũ');
  await dbSa(`taiKhoan/${C.uid}`, { method: 'PATCH', body: JSON.stringify({ khoa: true }) });
  check('C (bị khoá) đọc crmData_users/C bị chặn', (await doc(C.token, `crmData_users/${C.uid}`)) === 401);
  check('X vẫn đọc được crmData_users/C', (await doc(X.token, `crmData_users/${C.uid}`)) === 200);
} finally {
  console.log('\n>> Dọn dẹp');
  for (const uid of cacUid) {
    await itAdmin('accounts:delete', { localId: uid }).catch(() => {});
    for (const p of ['taiKhoan', 'quyenXem', 'crmData_users', 'zalo_users', 'aiData_users', 'appConfig_users']) {
      await dbSa(`${p}/${uid}`, { method: 'DELETE' }).catch(() => {});
    }
  }
  console.log('   done (' + cacUid.length + ' user test)');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
