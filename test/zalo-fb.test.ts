/**
 * Test client Firebase REST của extension bằng fetch giả. Không chạm mạng.
 */
import { createFb, FbError } from '../extension/lib/fb.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const DB = 'https://db.example';
const mem = new Map<string, any>();
const store = { get: async (k: string) => mem.get(k), set: async (k: string, v: any) => { mem.set(k, v); }, remove: async (k: string) => { mem.delete(k); } };
let clock = 1_000_000;
const calls: { url: string; init: any }[] = [];
let next: (url: string, init: any) => { status: number; body: any } = () => ({ status: 200, body: null });
const fetchImpl = async (url: string, init: any = {}) => {
  calls.push({ url, init });
  const r = next(url, init);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as any;
};
const fb = createFb({ apiKey: 'KEY', dbUrl: DB, store, fetchImpl, now: () => clock });

console.log('\n>> Chua dang nhap');
let err: any = null;
try { await fb.get('crmData/leads'); } catch (e) { err = e; }
check('get khi chua dang nhap -> AUTH', err instanceof FbError && err.code === 'AUTH');
check('currentUser null', (await fb.currentUser()) === null);

console.log('\n>> Dang nhap');
next = () => ({ status: 200, body: { localId: 'U1', email: 'a@b.c', idToken: 'T1', refreshToken: 'R1', expiresIn: '3600' } });
const u = await fb.signIn('a@b.c', 'mk');
check('tra uid + email', u.uid === 'U1' && u.email === 'a@b.c');
check('goi signInWithPassword kem key', calls.at(-1)!.url.includes('accounts:signInWithPassword?key=KEY'));
check('body co returnSecureToken', JSON.parse(calls.at(-1)!.init.body).returnSecureToken === true);
check('KHONG luu mat khau', !JSON.stringify([...mem.values()]).includes('"mk"'));

console.log('\n>> get / patch dung token con han');
calls.length = 0;
next = () => ({ status: 200, body: { L1: { id: 'L1' } } });
const leads = await fb.get('crmData/leads', { shallow: 'true' });
check('tra du lieu', leads.L1.id === 'L1');
check('url dung + auth', calls[0].url === `${DB}/crmData/leads.json?shallow=true&auth=T1`, calls[0].url);
check('khong goi lam moi token', calls.length === 1);
next = () => ({ status: 200, body: {} });
await fb.patch('', { 'zalo/links/1': { status: 'lead' } });
check('patch goc -> /.json', calls[1].url === `${DB}/.json?auth=T1` && calls[1].init.method === 'PATCH', calls[1].url);

console.log('\n>> Token het han -> lam moi');
clock += 3600_000;
calls.length = 0;
next = (url) => url.includes('securetoken')
  ? { status: 200, body: { id_token: 'T2', refresh_token: 'R2', user_id: 'U1', expires_in: '3600' } }
  : { status: 200, body: 1 };
await fb.get('x');
check('goi securetoken truoc', calls[0].url.includes('securetoken.googleapis.com/v1/token?key=KEY'));
check('dung refresh token cu', String(calls[0].init.body).includes('refresh_token=R1'));
check('request du lieu dung token moi', calls[1].url.endsWith('auth=T2'));

console.log('\n>> Phan loai loi');
next = () => ({ status: 401, body: { error: 'Permission denied' } });
err = null; try { await fb.get('zalo/links'); } catch (e) { err = e; }
check('Permission denied -> PERMISSION_DENIED', err?.code === 'PERMISSION_DENIED', err?.code);
next = () => ({ status: 400, body: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
err = null; try { await fb.signIn('a@b.c', 'sai'); } catch (e) { err = e; }
check('sai mat khau -> AUTH', err?.code === 'AUTH', err?.code);
next = () => { throw new TypeError('Failed to fetch'); };
err = null; try { await fb.get('x'); } catch (e) { err = e; }
check('mat mang -> NETWORK', err?.code === 'NETWORK', err?.code);

console.log('\n>> Dang xuat');
await fb.signOut();
check('xoa phien', (await fb.currentUser()) === null);

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exitCode = 1;
