// Khởi tạo bản ghi taiKhoan cho 2 tài khoản đang dùng (Trường = admin, Trân = chủ kho cũ).
// Chạy: node scripts/khoi-tao-phan-quyen.mjs   (cần .env.local chứa FIREBASE_SERVICE_ACCOUNT)
// Chạy lại không phá gì: chỉ PATCH.
import fs from 'node:fs';
import { createSign } from 'node:crypto';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const PROJECT = 'huyentrancrm';
const OWNER_UID = '7ePgCPmzxHdEAEazHo9IkyKf2rw2'; // Trân
const EMAIL_TRUONG = 'truongnlt99@gmail.com';

const envPath = new URL('../.env.local', import.meta.url);
const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').trim() : '');
if (!raw) { console.error('Thieu .env.local (FIREBASE_SERVICE_ACCOUNT)'); process.exit(1); }
const sa = JSON.parse(raw);

const b64 = (x) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function laySaToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));
  const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
  const r = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
  })).json();
  if (!r.access_token) throw new Error('Khong lay duoc access token: ' + JSON.stringify(r));
  return r.access_token;
}

const tkDb = await laySaToken('https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email');
const tkIt = await laySaToken('https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform');

async function tra(body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkIt}` }, body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`accounts:lookup loi ${r.status}: ${JSON.stringify(d)}`);
  return d.users?.[0] || null;
}
const patch = async (path, data) => {
  const r = await fetch(`${DB}/${path}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkDb}` }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`PATCH ${path} loi ${r.status}: ${await r.text()}`);
};

const truong = await tra({ email: [EMAIL_TRUONG] });
if (!truong) { console.error(`Khong tim thay tai khoan Auth cho ${EMAIL_TRUONG}`); process.exit(1); }
const tran = await tra({ localId: [OWNER_UID] });
if (!tran) { console.error(`Khong tim thay tai khoan Auth cho UID ${OWNER_UID}`); process.exit(1); }

await patch(`taiKhoan/${truong.localId}`, { email: EMAIL_TRUONG, ten: 'Trường', coKho: true, admin: true, khoa: false });
await patch(`taiKhoan/${OWNER_UID}`, { email: tran.email || '', ten: 'Trân', coKho: true, admin: false, khoa: false });

console.log(`Da khoi tao: Truong (${truong.localId}) = admin, Tran (${OWNER_UID}, ${tran.email || 'khong co email'}) = chu kho.`);
