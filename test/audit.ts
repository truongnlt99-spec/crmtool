/**
 * Audit dữ liệu thật — CHỈ ĐỌC, không ghi bất cứ thứ gì.
 * Chạy: node test/audit.ts   (cần .env.local như bộ test)
 */
import fs from 'node:fs';
import { createSign } from 'node:crypto';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';

const p = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(p)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(p, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Thieu .env.local — xem huong dan trong test/write-tools.test.ts');
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const b64 = (x: any) =>
  Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Math.floor(Date.now() / 1000);
const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64(JSON.stringify({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
}));
const s = createSign('RSA-SHA256'); s.update(`${head}.${claim}`);
const jwt = `${head}.${claim}.${b64(s.sign(sa.private_key.replace(/\\n/g, '\n')))}`;
const tk: any = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
})).json();

// ".json" phai nam NGAY SAU duong dan roi moi toi "?..." — ghep thang la hong,
// dung loi da sua trong fbRequest cua api/mcp.ts
const doc = async (path: string) => {
  const [p, q] = path.split('?');
  const url = `${DB}/${p}.json${q ? '?' + q : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk.access_token}` } });
  if (!r.ok) throw new Error(`Doc ${p} that bai: HTTP ${r.status}`);
  return r.json() as Promise<any>;
};

/* ---- Cac nhanh o goc: phat hien nhanh rac do loi ghep duong dan hoac test bo quen ---- */
const goc = await doc('?shallow=true');
const nhanhGoc = Object.keys(goc || {});
const HOP_LE = ['crmData', 'appConfig', 'authLog', 'shareLog'];
const nhanhRac = nhanhGoc.filter((k) => !HOP_LE.includes(k));

const raw = await doc('crmData/leads');
const leads: any[] = Object.values(raw || {});
const mang = (v: any) => (Array.isArray(v) ? v : Object.values(v || {}));

const loi: string[] = [];
const STAGES = ['leadin','baogia','follow1','follow2','follow3','nuoidaihan','won','lost'];

// Cau truc
for (const [k, l] of Object.entries<any>(raw || {})) {
  if (l.id !== k) loi.push(`Khoa "${k}" != id "${l.id}"`);
  if (!l.name) loi.push(`Lead ${l.id}: thieu ten`);
  if (!STAGES.includes(l.stage)) loi.push(`Lead ${l.name}: stage la "${l.stage}"`);
  for (const f of ['todos', 'notesList', 'activityLog', 'tags']) {
    const v = l[f];
    if (v && !Array.isArray(v) && typeof v === 'object') {
      const ks = Object.keys(v);
      if (ks.every((x) => /^\d+$/.test(x))) {
        const nums = ks.map(Number).sort((a, b) => a - b);
        const lienTuc = nums.every((n, i) => n === i);
        loi.push(`Lead ${l.name}: ${f} thanh OBJECT${lienTuc ? '' : ' — CHI SO KHONG LIEN TUC (mat phan tu!)'}`);
      }
    }
  }
}

const coOwner = leads.filter((l) => l.ownerUid === OWNER);
const khacOwner = leads.filter((l) => l.ownerUid && l.ownerUid !== OWNER);
const chuaCoOwner = leads.filter((l) => !l.ownerUid);

const todos = leads.flatMap((l) => mang(l.todos).map((t: any) => ({ ...t, lead: l.name })));
const todoCoId = todos.filter((t) => t.id);
const todoCoHan = todos.filter((t) => t.dueDate);
const xongThieuNgay = todos.filter((t) => t.done && !t.completedAt);

console.log('='.repeat(58));
console.log('DU LIEU THAT');
console.log('='.repeat(58));
console.log('  Cac nhanh o goc    :', nhanhGoc.join(', ') || '(trong)');
console.log('  Nhanh rac          :', nhanhRac.length ? nhanhRac.join(', ') + '  <-- CAN XOA' : 'khong co');
console.log('  So lead            :', leads.length);
console.log('  planRevenue        :', (await doc('crmData/planRevenue'))?.toLocaleString('vi-VN'), 'd');
console.log('  updatedAt          :', await doc('crmData/updatedAt'));

console.log('\nCHU SO HUU (ownerUid)');
console.log('  Da gan dung chu    :', coOwner.length, '/', leads.length);
console.log('  Gan chu KHAC       :', khacOwner.length);
console.log('  CHUA gan           :', chuaCoOwner.length, chuaCoOwner.length ? '(se gan khi vo mo app lan toi)' : '');

console.log('\nVIEC CAN LAM');
console.log('  Tong todo          :', todos.length);
console.log('  Da co id           :', todoCoId.length, '/', todos.length);
console.log('  Da co han rieng    :', todoCoHan.length, '/', todos.length);
console.log('  Xong nhung thieu ngay hoan thanh:', xongThieuNgay.length);

const log = (await doc('authLog?orderBy=%22%24key%22&limitToLast=300')) || {};
const dangNhap = Object.values<any>(log);
console.log('\nNHAT KY DANG NHAP');
console.log('  So ban ghi         :', dangNhap.length, '(app tu don, giu 200 gan nhat)');
console.log('  Tu tai khoan la    :', dangNhap.filter((x) => x.uid !== OWNER).length);

const cfg = await doc('appConfig');
console.log('\nCAU HINH');
console.log('  Khoa MCP do app sinh:', cfg?.mcpSecret ? 'da co' : 'chua tao');

console.log('\n' + '='.repeat(58));
console.log(loi.length ? `LOI CAU TRUC: ${loi.length}` : 'LOI CAU TRUC: khong co');
console.log('='.repeat(58));
loi.forEach((x) => console.log('  [!] ' + x));
