/**
 * Test tao link, trang xem, su kien, tool MCP cua tinh nang theo doi link san pham.
 * Sandbox crmDataTest + aiDataTest + user Auth tam (lg-*@test.local). Luon don sach trong finally.
 */
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';
process.env.MCP_SECRET = '';

import fs from 'node:fs';
import { createSign, randomBytes } from 'node:crypto';

const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local'); process.exit(1); }

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const API_KEY = 'AIzaSyDT8jy6J5ohBbnJxZdrOnZhyI57D2ZRDhQ';
const IT = 'https://identitytoolkit.googleapis.com/v1';
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';

const mod: any = await import('../api/mcp.ts');
const handler = mod.default;
const { chuanHoaLink, layYoutubeId } = mod;

let pass = 0, fail = 0;
const check = (ten: string, dk: boolean, ct: unknown = '') => {
  if (dk) { pass++; console.log(`  OK   ${ten}`); }
  else { fail++; console.log(`  FAIL ${ten} ${typeof ct === 'string' ? ct : JSON.stringify(ct)}`); }
};

/* ---- Ca thuần: chuẩn hoá link ---- */
console.log('\n>> layYoutubeId');
const ID = 'UrGCdCBCqq4';
for (const u of [
  `https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/watch?v=${ID}&t=30s`, `https://youtube.com/watch?list=x&v=${ID}`,
  `https://youtu.be/${ID}?si=x`, `https://m.youtube.com/watch?v=${ID}`, `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/live/${ID}?feature=share`, `https://www.youtube.com/embed/${ID}`,
]) check(`nhan ${u}`, layYoutubeId(u) === ID, layYoutubeId(u));
for (const u of [
  'https://www.youtube.com/@hayday', 'https://www.youtube.com/playlist?list=x', 'https://www.youtube.com/watch?v=ngan',
  `https://www.youtube.com/watch?v=${ID.slice(0, 10)}"`, `https://notyoutube.com/watch?v=${ID}`, `https://youtube.com.evil.vn/watch?v=${ID}`, 'khong-phai-url',
]) check(`bo ${u}`, layYoutubeId(u) === null, layYoutubeId(u));

console.log('\n>> chuanHoaLink');
const khongGoi = async () => { throw new Error('khong duoc goi mang'); };
const yt = await chuanHoaLink(`https://youtu.be/${ID}`, khongGoi);
check('youtube khong goi mang, co anh', yt.nenTang === 'youtube' && yt.ytId === ID && yt.anh === `https://img.youtube.com/vi/${ID}/hqdefault.jpg`, yt);
const khac = await chuanHoaLink('https://hayday.vn/mau', khongGoi);
check('link la -> khac, khong goi mang', khac.nenTang === 'khac' && khac.linkGoc === 'https://hayday.vn/mau', khac);
const fGia = (kich: Record<string, Response>) => async (u: string) => {
  const r = kich[u]; if (!r) throw new Error('la ' + u); return r;
};
const SHARE = 'https://www.facebook.com/share/p/1EYmDgqMRE/';
const GOC = 'https://www.facebook.com/hayday.media/posts/pfbidX';
const dLoi = await chuanHoaLink(SHARE, fGia({
  [SHARE]: new Response(null, { status: 302, headers: { Location: `${GOC}?rdid=1&share_url=abc` } }),
  [GOC]: new Response('<meta property="og:image" content="https://cdn.fb/a.jpg?x=1&amp;y=2">'),
}));
check('share/p -> link goc bo query', dLoi.linkGoc === GOC && dLoi.nenTang === 'facebook', dLoi);
check('og:image giai ma &amp;', dLoi.anh === 'https://cdn.fb/a.jpg?x=1&y=2', dLoi);
const doiShare = async (dich: string) => (await chuanHoaLink(SHARE, fGia({
  [SHARE]: new Response(null, { status: 302, headers: { Location: dich } }),
  [dich.split('?')[0]]: new Response(''),
  [dich]: new Response(''),
}))).linkGoc;
check('permalink giu story_fbid + id', (await doiShare('https://www.facebook.com/permalink.php?story_fbid=123&id=456&rdid=x&share_url=y')) === 'https://www.facebook.com/permalink.php?story_fbid=123&id=456');
check('photo giu fbid + set', (await doiShare('https://www.facebook.com/photo/?fbid=9&set=a.1&mibextid=z')) === 'https://www.facebook.com/photo/?fbid=9&set=a.1');
const WATCH = 'https://fb.watch/abc/';
const watch = await chuanHoaLink(WATCH, fGia({
  [WATCH]: new Response(null, { status: 302, headers: { Location: 'https://www.facebook.com/watch/?v=77&rdid=1' } }),
  'https://www.facebook.com/watch/?v=77': new Response(''),
}));
check('fb.watch giu v', watch.linkGoc === 'https://www.facebook.com/watch/?v=77', watch);
const ALBUM = 'https://www.facebook.com/media/set/?set=a.1&type=3';
const album = await chuanHoaLink(ALBUM, fGia({ [ALBUM]: new Response('<html></html>') }));
check('album giu query, khong co anh', album.linkGoc === ALBUM && album.anh === '', album);
const loiMang = await chuanHoaLink(SHARE, khongGoi);
check('loi mang -> giu link vao, khong nem', loiMang.linkGoc === SHARE && loiMang.nenTang === 'facebook' && loiMang.anh === '', loiMang);
const dangNhapFb = await chuanHoaLink(SHARE, fGia({
  [SHARE]: new Response(null, { status: 302, headers: { Location: 'https://www.facebook.com/login/?next=x' } }),
}));
check('bi day ve trang dang nhap -> giu link vao', dangNhapFb.linkGoc === SHARE, dangNhapFb);
const t0 = Date.now();
const giuTienTrinh = setTimeout(() => {}, 8000); // timer cua AbortSignal.timeout khong giu Node song
const treo = await chuanHoaLink(SHARE, (_u: string, init: RequestInit) => new Promise((_, loi) => {
  init.signal!.addEventListener('abort', () => loi(new Error('het gio')));
}) as Promise<Response>);
clearTimeout(giuTienTrinh);
check('treo -> dung sau khoang 5 giay', treo.linkGoc === SHARE && Date.now() - t0 < 7000, Date.now() - t0);

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
const dbJson = async (path: string): Promise<any> => (await db(path)).json();
const itAdmin = async (hanhDong: string, body: unknown) => {
  const r = await fetch(`${IT}/projects/huyentrancrm/${hanhDong}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkIt}` }, body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() as any };
};
const rand = randomBytes(4).toString('hex');
const MK = 'MatKhauTest' + rand;
const cacUid: string[] = [];
async function taoUser(ten: string, taiKhoan: Record<string, unknown>) {
  const email = `lg-${ten}-${rand}@test.local`;
  const tao = await itAdmin('accounts', { email, password: MK, emailVerified: true });
  if (tao.status !== 200) throw new Error('khong tao duoc user ' + JSON.stringify(tao.data));
  const uid = tao.data.localId as string; cacUid.push(uid);
  await db(`taiKhoan/${uid}`, { method: 'PATCH', body: JSON.stringify({ email, ten, ...taiKhoan }) });
  const dn: any = await (await fetch(`${IT}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MK, returnSecureToken: true }),
  })).json();
  return { uid, token: dn.idToken as string };
}
const goiLinkGui = async (idToken: string | null, body: unknown) => {
  const res = await handler.fetch(new Request('https://huyentran.vercel.app/api/mcp?mode=linkGui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json().catch(() => null) as any };
};

const LEAD = `lg_lead_${rand}`, VN = `lg_vn_${rand}`;
const tokens: string[] = [];

try {
  await db(`crmDataTest/leads/${LEAD}`, { method: 'PUT', body: JSON.stringify({ id: LEAD, name: `Khach LG ${rand}`, stage: 'leadin' }) });
  await db(`crmDataTest/venues/${VN}`, { method: 'PUT', body: JSON.stringify({ id: VN, ten: 'Venue LG', sanPham: {
    yt: { id: 'yt', ten: 'Phim <b>"test"</b>', link: `https://www.youtube.com/watch?v=${ID}`, tone: [] },
    khac: { id: 'khac', ten: 'Link khac', link: 'https://hayday.vn/mau', tone: [] },
  } }) });
  const admin = await taoUser('admin', { admin: true, coKho: false, khoa: false });
  const nguoiXem = await taoUser('xem', { admin: false, coKho: true, khoa: false });
  await db(`quyenXem/${nguoiXem.uid}/${OWNER}`, { method: 'PATCH', body: JSON.stringify({ crm: true }) });
  const adminKhoa = await taoUser('khoa', { admin: true, coKho: false, khoa: true });

  console.log('\n>> /api/link-gui: quyen');
  const yeuCau = { khoUid: OWNER, leadId: LEAD, dsSp: [{ venueId: VN, spId: 'yt' }] };
  check('khong token -> 401', (await goiLinkGui(null, yeuCau)).status === 401);
  check('nguoi chi co quyen xem -> 403', (await goiLinkGui(nguoiXem.token, yeuCau)).status === 403);
  check('tai khoan bi khoa -> 403', (await goiLinkGui(adminKhoa.token, yeuCau)).status === 403);
  check('khoUid ep duong dan -> 400', (await goiLinkGui(admin.token, { ...yeuCau, khoUid: '../x' })).status === 400);
  check('leadId ep duong dan -> 400', (await goiLinkGui(admin.token, { ...yeuCau, leadId: '../x' })).status === 400);
  check('11 san pham -> 400', (await goiLinkGui(admin.token, { ...yeuCau, dsSp: Array(11).fill({ venueId: VN, spId: 'yt' }) })).status === 400);
  check('lead khong ton tai -> 404', (await goiLinkGui(admin.token, { ...yeuCau, leadId: 'lg_khong_co' })).status === 404);

  console.log('\n>> /api/link-gui: tao');
  const r1 = await goiLinkGui(admin.token, { ...yeuCau, dsSp: [{ venueId: VN, spId: 'yt' }, { venueId: VN, spId: 'khong_co' }] });
  check('admin tao duoc', r1.status === 200 && r1.data.ok === true, r1);
  const kq = r1.data.ketQua[0];
  tokens.push(kq.token);
  check('token 10 ky tu chu so', /^[A-Za-z0-9]{10}$/.test(kq.token), kq);
  check('url dung', kq.url === `https://huyentran.vercel.app/xem/${kq.token}`, kq);
  check('san pham sai -> loi rieng dong do', typeof r1.data.ketQua[1].loi === 'string' && r1.data.ketQua[1].spId === 'khong_co', r1.data.ketQua[1]);
  const banGhi = await dbJson(`aiDataTest/linkGui/${kq.token}`);
  check('ban ghi dung kho', banGhi.leadId === LEAD && banGhi.soLanGui === 1 && banGhi.nenTang === 'youtube', banGhi);
  const traCuu = await dbJson(`linkXem/${kq.token}`);
  check('bang tra cuu tro ve aiDataTest', traCuu.aiRoot === 'aiDataTest' && traCuu.ytId === ID, traCuu);
  check('bang tra cuu khong co lead', !JSON.stringify(traCuu).includes(LEAD), traCuu);

  const r2 = await goiLinkGui(admin.token, yeuCau);
  check('gui lai: cung token, daCo', r2.data.ketQua[0].token === kq.token && r2.data.ketQua[0].daCo === true, r2);
  check('gui lai: soLanGui = 2', (await dbJson(`aiDataTest/linkGui/${kq.token}`)).soLanGui === 2);

  await db(`crmDataTest/venues/${VN}/sanPham/yt/link`, { method: 'PUT', body: JSON.stringify('https://www.youtube.com/watch?v=RzjhHL1aHmk') });
  await goiLinkGui(admin.token, yeuCau);
  check('sua link san pham roi gui lai: link cu tro sang link moi', (await dbJson(`linkXem/${kq.token}`)).ytId === 'RzjhHL1aHmk');

  await db(`crmDataTest/venues/${VN}/sanPham/yt`, { method: 'DELETE' });
  check('san pham da xoa: link van con', (await dbJson(`linkXem/${kq.token}`)).tieuDe.includes('test'));

  console.log('\n>> Facebook loi tam thoi roi gui lai');
  await db(`crmDataTest/venues/${VN}/sanPham/fb`, { method: 'PUT', body: JSON.stringify({ id: 'fb', ten: 'Bai FB', link: SHARE, tone: [] }) });
  const fbLoi = async () => { throw new Error('facebook loi'); };
  const dsFb = [{ venueId: VN, spId: 'fb' }];
  const lan1 = (await mod.taoLinkGui('crmDataTest', LEAD, dsFb, 'https://x', fbLoi))[0];
  tokens.push(lan1.token);
  check('Facebook loi van tao link', (await dbJson(`linkXem/${lan1.token}`)).linkGoc === SHARE);
  await mod.taoLinkGui('crmDataTest', LEAD, dsFb, 'https://x', fbLoi);
  check('van loi: giu nguyen, khong hong', (await dbJson(`linkXem/${lan1.token}`)).linkGoc === SHARE);
  const fbTot = fGia({
    [SHARE]: new Response(null, { status: 302, headers: { Location: GOC } }),
    [GOC]: new Response('<meta property="og:image" content="https://cdn.fb/b.jpg">'),
  });
  const lan3 = (await mod.taoLinkGui('crmDataTest', LEAD, dsFb, 'https://x', fbTot))[0];
  const sauSua = await dbJson(`linkXem/${lan3.token}`);
  check('gui lai sau khi Facebook on: tu sua link va anh', lan3.token === lan1.token && sauSua.linkGoc === GOC && sauSua.anh === 'https://cdn.fb/b.jpg', sauSua);

  console.log('\n>> /xem + su kien');
  const xem = async (t: string) => handler.fetch(new Request(`https://huyentran.vercel.app/api/mcp?mode=xem&t=${t}`));
  const suKien = async (body: unknown) => (await handler.fetch(new Request('https://huyentran.vercel.app/api/mcp?mode=xemSuKien', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
  }))).status;

  const trang = await xem(kq.token);
  const html = await trang.text();
  check('/xem 200 html', trang.status === 200 && (trang.headers.get('content-type') || '').includes('text/html'), trang.status);
  check('/xem khong lo lead', !html.includes(LEAD) && !html.includes('Khach LG'));
  check('/xem tieu de da escape', !html.includes('<b>"test"</b>') && html.includes('&lt;b&gt;'));
  const la = await xem('aaaaaaaaaa');
  check('token la -> 404 co thong bao', la.status === 404 && (await la.text()).includes('Link không còn hiệu lực'));
  check('token sai dinh dang -> 404', (await xem('..%2F..%2Fx')).status === 404);
  const fetchGoc = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('firebase sap'); }) as typeof fetch;
  const trangLoi = await xem(kq.token);
  globalThis.fetch = fetchGoc;
  check('firebase loi: khach thay trang thuong, khong thay JSON',
    trangLoi.status === 503 && (trangLoi.headers.get('content-type') || '').includes('text/html') && !(await trangLoi.text()).includes('{"loi"'));

  check('su kien token la -> 404', (await suKien({ t: 'aaaaaaaaaa', loai: 'mo' })) === 404);
  check('su kien sai -> 400', (await suKien({ t: kq.token, loai: 'la' })) === 400);
  const ketQuaMo = await Promise.all([suKien({ t: kq.token, loai: 'mo' }), suKien({ t: kq.token, loai: 'mo' })]);
  check('2 luot mo cung luc deu nhan', ketQuaMo.every((s) => s === 204), ketQuaMo);
  const sau2 = await dbJson(`aiDataTest/linkGui/${kq.token}`);
  check('2 luot mo song song du 2', sau2.soLanMo === 2, sau2);
  check('co lanDau, lanCuoi', sau2.lanDau > 0 && sau2.lanCuoi >= sau2.lanDau, sau2);
  await new Promise((r) => setTimeout(r, 30));
  await suKien({ t: kq.token, loai: 'giay', giay: 15 });
  await suKien({ t: kq.token, loai: 'giay', giay: 9 });
  await suKien({ t: kq.token, loai: 'tuongTac' });
  const sau3 = await dbJson(`aiDataTest/linkGui/${kq.token}`);
  check('giay cong don', sau3.tongGiay === 24, sau3);
  check('tuongTac tang', sau3.soLanTuongTac === 1, sau3);
  check('lanDau giu nguyen, lanCuoi moi hon', sau3.lanDau === sau2.lanDau && sau3.lanCuoi > sau2.lanCuoi, sau3);

  console.log('\n>> Tool MCP');
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const res = await handler.fetch(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
    }));
    const text = await res.text();
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    const body = JSON.parse(line ? line.slice(5).trim() : text);
    const out = body?.result?.content?.[0]?.text ?? JSON.stringify(body?.error ?? '');
    let json: any = null;
    try { json = JSON.parse(out); } catch { json = null; }
    return { text: out, json, isError: !!body?.result?.isError || !!body?.error };
  };
  await db(`crmDataTest/leads/${LEAD}_a`, { method: 'PUT', body: JSON.stringify({ id: `${LEAD}_a`, name: `Trung ten ${rand} A`, stage: 'leadin' }) });
  await db(`crmDataTest/leads/${LEAD}_b`, { method: 'PUT', body: JSON.stringify({ id: `${LEAD}_b`, name: `Trung ten ${rand} B`, stage: 'leadin' }) });

  const tim = await callTool('find_venue_products', { venue: VN });
  check('find_venue_products tra du venueId + id', tim.json?.sanPham?.some((s: any) => s.venueId === VN && s.id === 'khac'), tim.text);
  const sp1 = { venueId: VN, id: 'khac' };
  const taoTool = await callTool('create_product_links', { lead: `Khach LG ${rand}`, sanPham: [sp1] });
  const dongTool = taoTool.json?.links?.[0];
  if (dongTool?.url) tokens.push(dongTool.url.split('/').pop());
  check('create_product_links tra ten + url', dongTool?.tenSp === 'Link khac' && /^https:\/\/huyentran\.vercel\.app\/xem\/[A-Za-z0-9]{10}$/.test(dongTool?.url), taoTool.text);
  const lai = await callTool('create_product_links', { lead: LEAD, sanPham: [sp1] });
  check('goi lai khong tao token moi', lai.json?.links?.[0]?.url === dongTool?.url, lai.text);
  check('trung ten -> loi, khong tao', (await callTool('create_product_links', { lead: `Trung ten ${rand}`, sanPham: [sp1] })).isError);
  check('11 san pham -> loi', (await callTool('create_product_links', { lead: LEAD, sanPham: Array(11).fill(sp1) })).isError);

  const theoKhach = await callTool('get_link_stats', { lead: LEAD });
  const dongYt = theoKhach.json?.links?.find((d: any) => d.tongGiay === 24);
  check('get_link_stats theo khach co nhan', theoKhach.json?.links?.length === 3 && dongYt?.nhan === 'quanTam' && dongYt?.tuongTac === 1, theoKhach.text);
  check('co ten khach', dongYt?.khach === `Khach LG ${rand}`, dongYt);
  const theoSp = await callTool('get_link_stats', { venueId: VN, id: 'khac' });
  check('get_link_stats theo san pham', theoSp.json?.links?.length === 1 && theoSp.json.links[0].nhan === 'chuaMo', theoSp.text);
  const toanKho = await callTool('get_link_stats', {});
  check('get_link_stats toan kho', toanKho.json?.links?.length >= 2, toanKho.text);
} finally {
  for (const t of tokens) { await db(`linkXem/${t}`, { method: 'DELETE' }); await db(`aiDataTest/linkGui/${t}`, { method: 'DELETE' }); }
  for (const k of ['', '_a', '_b']) await db(`crmDataTest/leads/${LEAD}${k}`, { method: 'DELETE' });
  await db(`crmDataTest/venues/${VN}`, { method: 'DELETE' });
  for (const uid of cacUid) {
    await db(`taiKhoan/${uid}`, { method: 'DELETE' });
    await db(`quyenXem/${uid}`, { method: 'DELETE' });
    await itAdmin('accounts:delete', { localId: uid });
  }
}

console.log(`\n${pass} OK, ${fail} FAIL`);
if (fail) process.exit(1);
process.exit(0);
