/**
 * Test cách ly dữ liệu theo tài khoản cho link chia sẻ.
 * Chứng minh: token dạng "<uid>.<hex>" đọc ĐÚNG kho crmData_users/<uid> và cấu hình
 * appConfig_users/<uid>, KHÔNG đọc nhầm dữ liệu của chủ cũ.
 * Kho chủ cũ trỏ về sandbox crmDataTest để không đụng dữ liệu thật; nhánh của tài khoản
 * test nằm dưới một UID giả và được dọn sạch cuối bài.
 */
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';

import fs from 'node:fs';
import { createHash, createSign } from 'node:crypto';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';

const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Thieu .env.local'); process.exit(1);
}

const mod: any = await import('../api/mcp.ts');
const handler = mod.default;

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

/* ---- Token admin ---- */
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const now = Math.floor(Date.now()/1000);
const head = b64(JSON.stringify({ alg:'RS256', typ:'JWT' }));
const claim = b64(JSON.stringify({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  aud: 'https://oauth2.googleapis.com/token', exp: now+3600, iat: now,
}));
const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
const tk: any = await (await fetch('https://oauth2.googleapis.com/token', {
  method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:`${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g,'\n')))}` }),
})).json();

const db = async (path: string, init: RequestInit = {}) => {
  const [p, q] = path.split('?');
  return fetch(`${DB}/${p}.json${q ? '?' + q : ''}`, {
    ...init,
    headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tk.access_token}`, ...(init.headers||{}) },
  });
};

const goiShare = async (body: unknown) => {
  const res = await handler.fetch(new Request('http://x/api/mcp?mode=share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'MayTestScope/1.0 (Windows) Chrome/1' },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() };
};

const UID = 'zScopeTestUid' + Date.now();          // UID giả, không trùng chủ cũ, không có dấu "."
const TOKEN = `${UID}.` + 'rand' + Date.now();
const SALT = 'muoi-scope';
const MAT_KHAU = 'bimat13579';

try {
  console.log('\n>> Seed: chủ cũ (sandbox) và tài khoản test có dữ liệu KHÁC NHAU');
  // Dữ liệu của chủ cũ trong sandbox — KHÔNG được lộ qua token của tài khoản test
  await db('crmDataTest', { method:'PUT', body: JSON.stringify({
    leads: { LO: { id:'LO', name:'Khach CHU CU', stage:'baogia', revenueExpected: 111,
      deadline:'2026-09-30', createdAt:'2026-09-01', notesList:[], todos:[], tags:[], activityLog:[] } },
    planRevenue: 111, planLeads: 1 }) });
  // Dữ liệu RIÊNG của tài khoản test
  await db(`crmData_users/${UID}`, { method:'PUT', body: JSON.stringify({
    leads: { LR: { id:'LR', name:'Khach RIENG', stage:'won', revenueActual: 999, wonAt:'2026-09-10',
      revenueExpected: 999, deadline:'2026-09-30', createdAt:'2026-09-01',
      notesList:[], todos:[], tags:[], activityLog:[] } },
    planRevenue: 999, planLeads: 9 }) });
  await db(`appConfig_users/${UID}/share`, { method:'PUT', body: JSON.stringify({
    token: TOKEN, salt: SALT, passHash: createHash('sha256').update(`${SALT}:${MAT_KHAU}`).digest('hex'),
    enabled: true, createdAt: new Date().toISOString(), failCount: 0, lockedUntil: 0 }) });
  console.log('   seed OK');

  console.log('\n>> 1. Token tài khoản test + mật khẩu đúng -> đọc ĐÚNG kho riêng');
  const r = await goiShare({ token: TOKEN, passcode: MAT_KHAU });
  check('trả về 200', r.status === 200, JSON.stringify(r.data).slice(0,150));
  const chuoi = JSON.stringify(r.data);
  check('CÓ lead của kho riêng', chuoi.includes('Khach RIENG'));
  check('KHÔNG lộ lead của chủ cũ', !chuoi.includes('Khach CHU CU'));
  check('kế hoạch đúng của kho riêng', r.data.dashboard?.doanhThuThucTe?.keHoach === 999,
        JSON.stringify(r.data.dashboard?.doanhThuThucTe));

  console.log('\n>> 2. Nhật ký ghi vào shareLog_users/<uid> (không phải shareLog chung)');
  const log = await (await db(`shareLog_users/${UID}?orderBy=%22%24key%22&limitToLast=10`)).json();
  const rows = Object.values<any>(log || {}).filter(r => (r.ua||'').includes('MayTestScope'));
  check('có ghi nhật ký ở nhánh riêng', rows.length >= 1, 'số dòng: ' + rows.length);

  console.log('\n>> 3. Mật khẩu sai -> 401, không lộ dữ liệu');
  const rSai = await goiShare({ token: TOKEN, passcode: 'sai-het' });
  check('trả về 401', rSai.status === 401, String(rSai.status));
  check('không lộ dữ liệu', !rSai.data.leads);

} finally {
  console.log('\n>> Dọn dẹp');
  await db(`crmData_users/${UID}`, { method:'DELETE' }).catch(()=>{});
  await db(`appConfig_users/${UID}`, { method:'DELETE' }).catch(()=>{});
  await db(`shareLog_users/${UID}`, { method:'DELETE' }).catch(()=>{});
  await db('crmDataTest', { method:'DELETE' }).catch(()=>{});
  console.log('   done');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
