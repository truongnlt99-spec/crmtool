// Khởi tạo bản ghi taiKhoan cho 2 tài khoản đang dùng (Trường = admin, Trân = chủ kho cũ).
// Chạy: node scripts/khoi-tao-phan-quyen.mjs   (cần .env.local chứa FIREBASE_SERVICE_ACCOUNT)
// Chạy lại không phá gì: đọc bản ghi hiện có rồi CHỈ PATCH các ô còn THIẾU — không bao giờ
// ghi đè ô đã có (kể cả khoa/admin/coKho admin đã đổi trong màn Quản trị), không ghi email rỗng,
// và không bao giờ đụng ô `khoa` của Trường. In ra đúng những gì đã thay đổi.
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
const doc = async (path) => {
  const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${tkDb}` } });
  if (!r.ok) throw new Error(`GET ${path} loi ${r.status}: ${await r.text()}`);
  return await r.json();
};
const patch = async (path, data) => {
  const r = await fetch(`${DB}/${path}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkDb}` }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`PATCH ${path} loi ${r.status}: ${await r.text()}`);
};

// Chỉ giữ các ô mà bản ghi hiện có CHƯA có. Bỏ email rỗng.
function oThieu(hienCo, macDinh) {
  const cu = hienCo && typeof hienCo === 'object' ? hienCo : {};
  const them = {};
  for (const [k, v] of Object.entries(macDinh)) {
    if (k === 'email' && !v) continue;
    if (cu[k] === undefined || cu[k] === null) them[k] = v;
  }
  return them;
}
async function boSung(ten, uid, macDinh) {
  const them = oThieu(await doc(`taiKhoan/${uid}`), macDinh);
  if (!Object.keys(them).length) { console.log(`${ten} (${uid}): da du, khong doi gi.`); return; }
  await patch(`taiKhoan/${uid}`, them);
  console.log(`${ten} (${uid}): da them ${JSON.stringify(them)}`);
}

const truong = await tra({ email: [EMAIL_TRUONG] });
if (!truong) { console.error(`Khong tim thay tai khoan Auth cho ${EMAIL_TRUONG}`); process.exit(1); }
const tran = await tra({ localId: [OWNER_UID] });
if (!tran) { console.error(`Khong tim thay tai khoan Auth cho UID ${OWNER_UID}`); process.exit(1); }

// Trường: KHÔNG có `khoa` trong danh sách -> không bao giờ đụng tới.
await boSung('Truong', truong.localId, { email: EMAIL_TRUONG, ten: 'Trường', admin: true, coKho: true });
await boSung('Tran', OWNER_UID, { email: tran.email || '', ten: 'Trân', coKho: true, admin: false, khoa: false });
