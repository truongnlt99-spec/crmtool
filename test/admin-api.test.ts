/**
 * Test API admin (/api/admin): tạo / khoá / mở khoá tài khoản + chặn khoá MCP khi tài khoản bị khoá.
 * Tạo user Firebase Auth TẠM (pq-*@test.local) và dọn sạch trong finally.
 */
process.env.MCP_SECRET = 'khoa-env-cua-test-admin-api';

import fs from 'node:fs';
import { createSign, randomBytes } from 'node:crypto';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const API_KEY = 'AIzaSyDT8jy6J5ohBbnJxZdrOnZhyI57D2ZRDhQ';
const IT = 'https://identitytoolkit.googleapis.com/v1';

const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local'); process.exit(1); }

const mod: any = await import('../api/mcp.ts');
const handler = mod.default;
const { kiemTraYeuCauAdmin } = mod;

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

/* ---- Ca thuần ---- */
console.log('\n>> Ca thuần kiemTraYeuCauAdmin');
check('thiếu hanhDong -> 400', kiemTraYeuCauAdmin({}, 'u1').ok === false && kiemTraYeuCauAdmin({}, 'u1').status === 400);
check('body không phải object -> 400', kiemTraYeuCauAdmin(null, 'u1').ok === false);
check('tao mật khẩu 7 ký tự -> 400',
  kiemTraYeuCauAdmin({ hanhDong: 'tao', email: 'a@b.c', matKhau: '1234567', ten: 'A', coKho: true }, 'u1').ok === false);
check('tao email rỗng -> 400',
  kiemTraYeuCauAdmin({ hanhDong: 'tao', email: '  ', matKhau: '12345678', ten: 'A', coKho: true }, 'u1').ok === false);
check('khoa chính mình -> 400', kiemTraYeuCauAdmin({ hanhDong: 'khoa', uid: 'u1' }, 'u1').ok === false);
check('khoa người khác -> ok', kiemTraYeuCauAdmin({ hanhDong: 'khoa', uid: 'u2' }, 'u1').ok === true);
check('moKhoa thiếu uid -> 400', kiemTraYeuCauAdmin({ hanhDong: 'moKhoa' }, 'u1').ok === false);
const hopLe = kiemTraYeuCauAdmin({ hanhDong: 'tao', email: ' A@B.c ', matKhau: '12345678', ten: ' An ', coKho: false }, 'u1');
check('tao hợp lệ -> ok, email chuẩn hoá', hopLe.ok === true && hopLe.yeuCau.email === 'a@b.c' && hopLe.yeuCau.ten === 'An' && hopLe.yeuCau.coKho === false,
  JSON.stringify(hopLe));

/* ---- Ca thật ---- */
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
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
const db = (path: string, init: RequestInit = {}) => fetch(`${DB}/${path}.json`, {
  ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkDb}` },
});
const dbJson = async (path: string) => (await db(path)).json();
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
  return { status: r.status, data: await r.json() as any };
};
const goiAdmin = async (idToken: string | null, body: unknown) => {
  const res = await handler.fetch(new Request('http://x/api/mcp?mode=admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as any };
};

const rand = randomBytes(4).toString('hex');
const MAT_KHAU = 'MatKhauTest' + rand;
const emailAdmin = `pq-admin-${rand}@test.local`;
const emailB = `pq-b-${rand}@test.local`;
const cacUid: string[] = [];

try {
  console.log('\n>> Seed: tạo admin test');
  const tao = await itAdmin('accounts', { email: emailAdmin, password: MAT_KHAU, emailVerified: true });
  if (tao.status !== 200) {
    console.log('   KHONG TAO DUOC USER TEST:', tao.status, JSON.stringify(tao.data));
    throw new Error('identity toolkit loi ' + tao.status);
  }
  const uidA = tao.data.localId as string; cacUid.push(uidA);
  await db(`taiKhoan/${uidA}`, { method: 'PATCH', body: JSON.stringify({ email: emailAdmin, ten: 'Admin test', coKho: false, admin: true, khoa: false, taoLuc: Date.now() }) });
  const dnA = await dangNhap(emailAdmin, MAT_KHAU);
  const tokenA = dnA.data.idToken as string;
  check('admin test đăng nhập được', dnA.status === 200, JSON.stringify(dnA.data).slice(0, 150));

  console.log('\n>> Xác thực');
  const r0 = await goiAdmin(null, { hanhDong: 'tao', email: emailB, matKhau: MAT_KHAU, ten: 'B', coKho: true });
  check('không token -> 401', r0.status === 401, String(r0.status));
  const r1 = await goiAdmin('token-sai', { hanhDong: 'tao', email: emailB, matKhau: MAT_KHAU, ten: 'B', coKho: true });
  check('token sai -> 401', r1.status === 401, String(r1.status));
  check('401 có loi tiếng Việt', typeof r1.data.loi === 'string' && r1.data.loi.length > 0);

  console.log('\n>> tao');
  const rBad = await goiAdmin(tokenA, { hanhDong: 'tao', email: emailB, matKhau: '123', ten: 'B', coKho: true });
  check('mật khẩu ngắn -> 400', rBad.status === 400, String(rBad.status));
  const rTao = await goiAdmin(tokenA, { hanhDong: 'tao', email: emailB, matKhau: MAT_KHAU, ten: 'Nguoi B', coKho: true });
  check('tao B -> 200 có uid', rTao.status === 200 && !!rTao.data.uid, JSON.stringify(rTao.data));
  const uidB = rTao.data.uid as string; if (uidB) cacUid.push(uidB);
  const tkB = await dbJson(`taiKhoan/${uidB}`);
  check('taiKhoan/B đúng', tkB && tkB.coKho === true && tkB.admin === false && tkB.khoa === false && tkB.email === emailB && tkB.ten === 'Nguoi B',
    JSON.stringify(tkB));
  const rTrung = await goiAdmin(tokenA, { hanhDong: 'tao', email: emailB, matKhau: MAT_KHAU, ten: 'B', coKho: true });
  check('tao trùng email -> 409', rTrung.status === 409, String(rTrung.status) + JSON.stringify(rTrung.data));

  console.log('\n>> B không phải admin');
  const dnB = await dangNhap(emailB, MAT_KHAU);
  check('B đăng nhập được', dnB.status === 200, JSON.stringify(dnB.data).slice(0, 150));
  const tokenB = dnB.data.idToken as string;
  const rB = await goiAdmin(tokenB, { hanhDong: 'tao', email: `pq-c-${rand}@test.local`, matKhau: MAT_KHAU, ten: 'C', coKho: true });
  check('B gọi tao -> 403', rB.status === 403, String(rB.status));

  console.log('\n>> khoa');
  const rChinhMinh = await goiAdmin(tokenA, { hanhDong: 'khoa', uid: uidA });
  check('khoá chính mình -> 400', rChinhMinh.status === 400, String(rChinhMinh.status));
  const khoaB = `${uidB}.` + randomBytes(20).toString('hex');
  await db(`appConfig_users/${uidB}`, { method: 'PATCH', body: JSON.stringify({ mcpSecret: khoaB }) });
  const rKhoa = await goiAdmin(tokenA, { hanhDong: 'khoa', uid: uidB });
  check('khoa B -> 200', rKhoa.status === 200, JSON.stringify(rKhoa.data));
  const lk = await itAdmin('accounts:lookup', { localId: [uidB] });
  check('Auth: B disabled', lk.data.users?.[0]?.disabled === true, JSON.stringify(lk.data).slice(0, 150));
  check('taiKhoan/B/khoa === true', (await dbJson(`taiKhoan/${uidB}/khoa`)) === true);
  check('mcpSecret của B đã bị xoá', (await dbJson(`appConfig_users/${uidB}/mcpSecret`)) === null);
  const dnB2 = await dangNhap(emailB, MAT_KHAU);
  check('B đăng nhập bị từ chối', dnB2.status !== 200, String(dnB2.status));

  console.log('\n>> khoá MCP của tài khoản bị khoá');
  // Ghi lại khoá để chứng minh chính kiểm tra khoa (chứ không chỉ việc xoá khoá) chặn được
  await db(`appConfig_users/${uidB}`, { method: 'PATCH', body: JSON.stringify({ mcpSecret: khoaB }) });
  const rMcp = await handler.fetch(new Request(`http://x/api/mcp?key=${khoaB}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  check('MCP bằng khoá B (đang bị khoá) -> 401', rMcp.status === 401, String(rMcp.status));
  const rEnv = await handler.fetch(new Request(`http://x/api/mcp?key=${process.env.MCP_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  check('khoá env MCP_SECRET không bị ảnh hưởng', rEnv.status !== 401, String(rEnv.status));
  await db(`appConfig_users/${uidB}/mcpSecret`, { method: 'DELETE' });

  console.log('\n>> moKhoa');
  const rMo = await goiAdmin(tokenA, { hanhDong: 'moKhoa', uid: uidB });
  check('moKhoa B -> 200', rMo.status === 200, JSON.stringify(rMo.data));
  check('taiKhoan/B/khoa === false', (await dbJson(`taiKhoan/${uidB}/khoa`)) === false);
  const dnB3 = await dangNhap(emailB, MAT_KHAU);
  check('B đăng nhập lại được', dnB3.status === 200, String(dnB3.status));
  check('mcpSecret không tự khôi phục', (await dbJson(`appConfig_users/${uidB}/mcpSecret`)) === null);

  console.log('\n>> Không đọc được trạng thái khoá -> fail closed (503)');
  const uidGia = "pqGia" + rand; cacUid.push(uidGia);
  const khoaB2 = `${uidGia}.` + randomBytes(20).toString('hex');
  await db(`appConfig_users/${uidGia}`, { method: "PATCH", body: JSON.stringify({ mcpSecret: khoaB2 }) });
  const fetchGoc = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) =>
    String(input?.url ?? input).includes(`taiKhoan/${uidGia}/khoa`)
      ? Promise.reject(new Error('mat mang gia lap'))
      : fetchGoc(input, init)) as typeof fetch;
  let r503: Response;
  try {
    r503 = await handler.fetch(new Request(`http://x/api/mcp?key=${khoaB2}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
  } finally { globalThis.fetch = fetchGoc; }
  check('đọc khoa lỗi -> 503, không cho qua', r503.status === 503, String(r503.status));
  await db(`appConfig_users/${uidB}/mcpSecret`, { method: 'DELETE' });

  console.log('\n>> Admin bị khoá không gọi được');
  await db(`taiKhoan/${uidA}`, { method: 'PATCH', body: JSON.stringify({ khoa: true }) });
  const rAK = await goiAdmin(tokenA, { hanhDong: 'moKhoa', uid: uidB });
  check('admin đang bị khoá -> 403', rAK.status === 403, String(rAK.status));
} finally {
  console.log('\n>> Dọn dẹp');
  for (const uid of cacUid) {
    await itAdmin('accounts:delete', { localId: uid }).catch(() => {});
    await db(`taiKhoan/${uid}`, { method: 'DELETE' }).catch(() => {});
    await db(`appConfig_users/${uid}`, { method: 'DELETE' }).catch(() => {});
  }
  console.log('   done (' + cacUid.length + ' user test)');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
