/**
 * Test link chia sẻ chỉ xem.
 * Dữ liệu CRM đọc từ nhánh sandbox; cấu hình chia sẻ dùng nhánh riêng để không
 * đụng vào cấu hình thật. Cuối bài dọn sạch mọi thứ đã tạo.
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
    headers: { 'Content-Type': 'application/json', 'user-agent': 'MayTest/1.0 (Windows) Chrome/1' },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() };
};

const TOKEN = 'token-test-' + Date.now();
const SALT = 'muoi-test';
const MAT_KHAU = 'bimat246810';

// Nho lai cau hinh that de tra ve nguyen trang
const cfgThat = await (await db('appConfig/share')).json();

try {
  console.log('\n>> Dung du lieu sandbox + cau hinh chia se tam');
  await db('crmDataTest', { method:'PUT', body: JSON.stringify({
    leads: { L1: { id:'L1', name:'Khach Sandbox', stage:'baogia', ownerUid:'U',
      revenueExpected: 50000000, deadline:'2026-09-30', createdAt:'2026-09-01',
      phone:'0900000001', facebook:'fb.com/test',
      notesList:[{id:'n1',text:'GHI CHU BI MAT',createdAt:'x',updatedAt:'x'}],
      todos:[{id:'t0',text:'viec',done:false}], tags:[], activityLog:[] } },
    planRevenue: 100000000, planLeads: 10 }) });
  await db('appConfig/share', { method:'PUT', body: JSON.stringify({
    token: TOKEN, salt: SALT, passHash: createHash('sha256').update(`${SALT}:${MAT_KHAU}`).digest('hex'),
    enabled: true, createdAt: new Date().toISOString(), failCount: 0, lockedUntil: 0 }) });
  console.log('   seed OK');

  console.log('\n>> 1. Token sai -> phai bi tu choi');
  const r1 = await goiShare({ token: 'token-bay-ba', passcode: MAT_KHAU });
  check('tra ve 403', r1.status === 403, String(r1.status));
  check('khong lo du lieu', !r1.data.leads);

  console.log('\n>> 2. Token dung, mat khau SAI -> phai bi tu choi');
  const r2 = await goiShare({ token: TOKEN, passcode: 'sai-be-bet' });
  check('tra ve 401', r2.status === 401, String(r2.status));
  check('khong lo du lieu', !r2.data.leads);

  console.log('\n>> 3. Token dung, mat khau DUNG -> tra du lieu');
  const r3 = await goiShare({ token: TOKEN, passcode: MAT_KHAU });
  check('tra ve 200', r3.status === 200, JSON.stringify(r3.data).slice(0,150));
  check('co danh sach lead', Array.isArray(r3.data.leads) && r3.data.leads.length === 1);
  check('co so lieu dashboard', !!r3.data.dashboard?.pipeline);
  check('co danh sach giai doan', Array.isArray(r3.data.giaiDoan) && r3.data.giaiDoan.length === 8);

  console.log('\n>> 4. Du lieu nhay cam KHONG duoc gui ra');
  const chuoi = JSON.stringify(r3.data);
  check('khong co so dien thoai', !chuoi.includes('0900000001'));
  check('khong co facebook',     !chuoi.includes('fb.com/test'));
  check('khong co ghi chu',      !chuoi.includes('GHI CHU BI MAT'));
  check('van co ten + doanh thu', chuoi.includes('Khach Sandbox') && chuoi.includes('50000000'));

  console.log('\n>> 5. GET bi tu choi (mat khau khong duoc nam tren thanh dia chi)');
  const rGet = await handler.fetch(new Request('http://x/api/mcp?mode=share&t=' + TOKEN, { method: 'GET' }));
  check('tra ve 405', rGet.status === 405, String(rGet.status));

  console.log('\n>> 6. Tat chia se -> khong xem duoc nua');
  await db('appConfig/share', { method:'PATCH', body: JSON.stringify({ enabled:false }) });
  const r6 = await goiShare({ token: TOKEN, passcode: MAT_KHAU });
  check('tra ve 403 khi da tat', r6.status === 403, String(r6.status));
  await db('appConfig/share', { method:'PATCH', body: JSON.stringify({ enabled:true }) });

  console.log('\n>> 7. Nhat ky truy cap co ghi ca lan dung lan sai');
  const log = await (await db('shareLog?orderBy=%22%24key%22&limitToLast=50')).json();
  const rows = Object.values<any>(log || {}).filter(r => (r.ua||'').includes('MayTest'));
  check('co ghi nhat ky', rows.length >= 2, 'so dong: ' + rows.length);
  check('co dong THANH CONG', rows.some(r => r.ok === true));
  check('co dong SAI mat khau', rows.some(r => r.ok === false));
  check('co luu thiet bi', rows.every(r => typeof r.ua === 'string' && r.ua.length > 0));

  console.log('\n>> 8. Khoa tam sau 10 lan sai');
  for (let i = 0; i < 10; i++) await goiShare({ token: TOKEN, passcode: 'sai' + i });
  const r8 = await goiShare({ token: TOKEN, passcode: MAT_KHAU });
  check('bi khoa tam du mat khau dung', r8.status === 429, String(r8.status) + ' ' + JSON.stringify(r8.data).slice(0,90));
} catch (e: any) {
  fail++; console.log('\nNGOAI LE: ' + e.message + '\n' + e.stack);
} finally {
  // Don sach: sandbox + cau hinh chia se + cac dong log do test tao ra
  await db('crmDataTest', { method:'DELETE' });
  if (cfgThat && !cfgThat.error) {
    await db('appConfig/share', { method:'PUT', body: JSON.stringify(cfgThat) });
  } else {
    await db('appConfig/share', { method:'DELETE' });
  }
  const log = await (await db('shareLog')).json();
  const boDi: Record<string, null> = {};
  Object.entries<any>(log || {}).forEach(([k, v]) => { if ((v.ua||'').includes('MayTest')) boDi[k] = null; });
  if (Object.keys(boDi).length) await db('shareLog', { method:'PATCH', body: JSON.stringify(boDi) });

  const conLai = await (await db('shareLog')).json();
  const sot = Object.values<any>(conLai || {}).filter(r => (r.ua||'').includes('MayTest')).length;
  console.log(`\n>> Don dep: sandbox xoa, cau hinh chia se tra ve nguyen trang, log test con sot: ${sot}`);
  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
}
