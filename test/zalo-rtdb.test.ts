/**
 * Kiểm tra cách ghi của extension trên Firebase thật, nhánh sandbox zaloTest.
 * Cần .env.local chứa FIREBASE_SERVICE_ACCOUNT. Cuối bài xoá sạch zaloTest.
 */
import fs from 'node:fs';
import { createSign } from 'node:crypto';
import * as M from '../extension/lib/zalo-map.js';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local'); process.exit(1); }

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const iat = Math.floor(Date.now() / 1000);
const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64(JSON.stringify({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  aud: 'https://oauth2.googleapis.com/token', exp: iat + 3600, iat,
}));
const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
const tk: any = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
})).json();
const db = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${DB}/${path}.json`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk.access_token}` },
  });
  return res.json();
};
const patchRoot = (body: object) => db('', { method: 'PATCH', body: JSON.stringify(body) });

const Z = 'zaloTest', C = 'c999';
const now = new Date();
const msg = { msgId: '7001', cliMsgId: '1001', convId: C, at: 1758500000123, fromMe: false, senderUid: '55', senderName: 'Lan', kind: 'text' };

try {
  console.log('\n>> 1. Gan hoi thoai + ghi sieu du lieu');
  await patchRoot({ ...M.linkPatch(Z, C, { status: 'lead', leadId: 'L1', name: 'Lan', now }), ...M.messagePatch(Z, msg) });
  const t1 = await db(`${Z}/msgs/${C}/7001`);
  check('co at + kind, chua co text', t1.at === msg.at && t1.kind === 'text' && !('text' in t1), JSON.stringify(t1));

  console.log('\n>> 2. Mo hoi thoai -> ghi chu');
  await patchRoot(M.messagePatch(Z, { ...msg, text: 'Chào em' }));
  check('co text', (await db(`${Z}/msgs/${C}/7001/text`)) === 'Chào em');

  console.log('\n>> 3. Quet IndexedDB lan nua (chi sieu du lieu) -> KHONG mat chu');
  await patchRoot(M.messagePatch(Z, msg));
  check('text van con', (await db(`${Z}/msgs/${C}/7001/text`)) === 'Chào em');

  console.log('\n>> 4. Meta + link trong cung mot lenh');
  await patchRoot({ [`${Z}/meta/${C}`]: M.mergeMeta(null, [msg], { leadId: 'L1' }) });
  const meta = await db(`${Z}/meta/${C}`);
  check('meta ghi dung', meta.lastCustomerAt === msg.at && meta.leadId === 'L1', JSON.stringify(meta));
  check('link ghi dung', (await db(`${Z}/links/${C}/leadId`)) === 'L1');

  console.log('\n>> 5. Bo gan -> go sach');
  await patchRoot(M.purgeConvPatch(Z, C));
  check('links/meta/msgs deu mat', (await db(`${Z}/links/${C}`)) === null && (await db(`${Z}/meta/${C}`)) === null && (await db(`${Z}/msgs/${C}`)) === null);
} catch (e: any) {
  fail++; console.log('\nNGOAI LE: ' + e.message);
} finally {
  await db(Z, { method: 'DELETE' });
  console.log(`\n>> Don dep: ${Z} da xoa -> ${JSON.stringify(await db(Z))}`);
  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
  if (fail) process.exitCode = 1;
}
