/**
 * Test 3 tool MCP đọc hội thoại Zalo: list_conversations, get_conversation, get_lead (phần zalo).
 * Chạy trên nhánh sandbox 'crmDataTest' + 'zaloTest'. KHÔNG đụng dữ liệu thật.
 * Cuối bài luôn xoá sandbox, kể cả khi lỗi giữa chừng.
 */
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';

{
  const fs = await import('node:fs');
  const path = new URL('../.env.local', import.meta.url);
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(path)) {
    process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(path, 'utf8').trim();
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('Thieu .env.local (service account) — xem huong dan trong test/write-tools.test.ts');
    process.exit(1);
  }
}

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const handler = ((await import('../api/mcp.ts')) as any).default;

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

async function callTool(name: string, args: Record<string, unknown>) {
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
}

/* ---- Firebase admin cho việc dựng/dọn sandbox ---- */
async function adminToken(): Promise<string> {
  const { createSign } = await import('node:crypto');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
  const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', exp: iat + 3600, iat,
  }));
  const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
  });
  return ((await res.json()) as any).access_token;
}
const TOKEN = await adminToken();
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${DB}/${path}.json`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` } });

const H = 3600_000, D = 24 * H;
const NOW = Date.now();
const MA_HOA = 'lDWqNsuflkEXdcRVtAc6QXLvzLNX6Ux1sM1b53pxss0=';
const OLD = Date.UTC(2026, 8, 1, 3, 0);   // 01/09/2026 10:00 giờ VN

try {
  console.log('\n>> Dung sandbox crmDataTest + zaloTest');
  await db('crmDataTest', { method: 'PUT', body: JSON.stringify({
    leads: {
      L1: { id: 'L1', name: 'Lan Nguyễn', stage: 'baogia', package: 'Signature', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L2: { id: 'L2', name: 'Ngọc Hân', stage: 'follow1', package: 'Unique', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L3: { id: 'L3', name: 'Khách Chốt', stage: 'won', package: 'Standard', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L4: { id: 'L4', name: 'Chưa Có Zalo', stage: 'leadin', package: 'Standard', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
    },
    planRevenue: 1, planLeads: 1,
  }) });
  await db('zaloTest', { method: 'PUT', body: JSON.stringify({
    links: {
      c1: { status: 'lead', leadId: 'L1', name: 'Lan Nguyễn', isGroup: false, linkedAt: 1 },
      c5: { status: 'lead', leadId: 'L1', name: 'Chồng Lan', isGroup: false, linkedAt: 1 },
      g2: { status: 'lead', leadId: 'L2', name: 'Nhóm cưới Hân & Tú', isGroup: true, linkedAt: 1 },
      c3: { status: 'lead', leadId: 'L3', name: 'Khách Chốt', isGroup: false, linkedAt: 1 },
      c4: { status: 'ignored', leadId: null, name: 'Mẹ', isGroup: false, linkedAt: 1 },
    },
    meta: {
      c1: { lastAt: NOW - 2 * H, lastCustomerAt: NOW - 2 * H, lastMeAt: NOW - 5 * H },
      c5: { lastAt: NOW - 1 * H, lastCustomerAt: NOW - 3 * H, lastMeAt: NOW - 1 * H },
      g2: { lastAt: NOW - 4 * D, lastCustomerAt: NOW - 5 * D, lastMeAt: NOW - 4 * D },
      c3: { lastAt: NOW - 30 * 60_000, lastCustomerAt: NOW - 30 * 60_000, lastMeAt: 0 },
    },
    msgs: {
      c1: {
        '100': { at: OLD, fromMe: false, kind: 'text', text: 'TIN CU DAU THANG', senderName: MA_HOA },
        '101': { at: NOW - 5 * H, fromMe: true, kind: 'text', text: 'Em gửi chị báo giá Signature ạ' },
        '102': { at: NOW - 2.1 * H, fromMe: false, kind: 'text', text: 'Gói này có flycam không em?', senderName: MA_HOA },
        '103': { at: NOW - 2 * H + 1000, fromMe: false, kind: 'image', senderName: MA_HOA },
        '104': { at: NOW - 2 * H + 2000, fromMe: false, kind: 'text', senderName: MA_HOA,
                 quote: { title: 'Huyền Trân', text: 'báo giá Signature' } },
      },
      c5: { '200': { at: NOW - 1 * H, fromMe: true, kind: 'text', text: 'Dạ em chào anh' } },
      g2: {
        '300': { at: NOW - 5 * D, fromMe: false, kind: 'text', text: 'Ngân sách tầm 45tr', senderName: 'Minh Tuấn' },
        '301': { at: NOW - 5 * D + 1000, fromMe: false, kind: 'text', text: 'Tin nhóm tên mã hoá', senderName: MA_HOA },
      },
      c4: { '400': { at: NOW, fromMe: false, kind: 'text', text: 'TIN GIA DINH' } },
    },
  }) });
  console.log('   seed OK');

  console.log('\n>> 1. list_conversations');
  const r1 = await callTool('list_conversations', {});
  const ds = r1.json?.conversations || [];
  check('khong loi', !r1.isError, r1.text.slice(0, 200));
  check('4 hoi thoai da gan lead (bo "khong phai khach")', r1.json?.total === 4, String(r1.json?.total));
  check('moi nhan len dau', ds.map((x: any) => x.convId).join() === 'c3,c5,c1,g2', ds.map((x: any) => x.convId).join());
  check('dem cho tra loi / khach im', r1.json?.counts?.waiting === 1 && r1.json?.counts?.silent === 1, JSON.stringify(r1.json?.counts));
  const c1 = ds.find((x: any) => x.convId === 'c1');
  check('co ten lead, giai doan, chip', c1?.leadName === 'Lan Nguyễn' && c1?.stageName === 'Báo giá' && c1?.state === 'Khách chờ trả lời · 2 giờ', JSON.stringify(c1));
  check('lead Won khong co chip', ds.find((x: any) => x.convId === 'c3')?.state === null);
  check('co gio tin cuoi dang doc duoc', typeof c1?.lastMessageAt === 'string' && /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(c1.lastMessageAt), c1?.lastMessageAt);
  check('KHONG lo hoi thoai "khong phai khach"', !r1.text.includes('Mẹ') && !r1.text.includes('TIN GIA DINH'));
  const r1b = await callTool('list_conversations', { filter: 'waiting' });
  check('loc cho tra loi', (r1b.json?.conversations || []).map((x: any) => x.convId).join() === 'c1');
  const r1c = await callTool('list_conversations', { search: 'ngoc han' });
  check('tim khong dau theo ten lead', (r1c.json?.conversations || []).map((x: any) => x.convId).join() === 'g2');

  console.log('\n>> 2. get_conversation');
  const r2 = await callTool('get_conversation', { lead: 'L1' });
  check('khong loi', !r2.isError, r2.text.slice(0, 200));
  const hts = r2.json?.conversations || [];
  check('lead co 2 hoi thoai', hts.length === 2, String(hts.length));
  const h1 = hts.find((x: any) => x.convId === 'c1');
  const tins = h1?.messages || [];
  check('du 5 tin, cu -> moi', tins.length === 5 && tins[0].text === 'TIN CU DAU THANG', JSON.stringify(tins.map((t: any) => t.text)));
  check('tin cua minh ghi "Mình"', tins[1]?.from === 'Mình');
  check('chat 1-1: nguoi gui = ten hoi thoai', tins[2]?.from === 'Lan Nguyễn', tins[2]?.from);
  check('tin anh co nhan', tins[3]?.text === '[Hình ảnh]', tins[3]?.text);
  check('tin chua co chu duoc ghi ro', /chưa có nội dung/i.test(tins[4]?.text || ''), tins[4]?.text);
  check('co trich dan', tins[4]?.quote === 'Huyền Trân: báo giá Signature', tins[4]?.quote);
  check('dem tin thieu chu', h1?.missingText === 1);
  check('ten ma hoa KHONG lot ra', !r2.text.includes(MA_HOA));
  check('co thong tin lead', r2.json?.lead?.name === 'Lan Nguyễn' && r2.json?.lead?.stageName === 'Báo giá');

  const r2b = await callTool('get_conversation', { lead: 'L1', from: '2026-09-10' });
  const h1b = (r2b.json?.conversations || []).find((x: any) => x.convId === 'c1');
  check('loc tu ngay bo tin cu', h1b?.messages?.length === 4 && !r2b.text.includes('TIN CU DAU THANG'));
  const r2c = await callTool('get_conversation', { lead: 'L1', limit: 2 });
  const h1c = (r2c.json?.conversations || []).find((x: any) => x.convId === 'c1');
  check('limit lay N tin MOI NHAT', h1c?.shown === 2 && h1c?.total === 5 && h1c?.messages?.[1]?.quote === 'Huyền Trân: báo giá Signature', JSON.stringify({ shown: h1c?.shown, total: h1c?.total }));

  const r2d = await callTool('get_conversation', { convId: 'g2' });
  const tg = r2d.json?.conversations?.[0]?.messages || [];
  check('doc theo convId (nhom)', r2d.json?.conversations?.length === 1 && tg.length === 2);
  check('nhom: giu ten that, ten ma hoa -> "Khách"', tg[0]?.from === 'Minh Tuấn' && tg[1]?.from === 'Khách', JSON.stringify(tg.map((t: any) => t.from)));
  const r2e = await callTool('get_conversation', { convId: 'c4' });
  check('hoi thoai "khong phai khach" -> bao loi, khong lo tin', r2e.isError && !r2e.text.includes('TIN GIA DINH'), r2e.text.slice(0, 120));
  const r2f = await callTool('get_conversation', { lead: 'L4' });
  check('lead chua gan Zalo -> bao ro', !r2f.isError && /chưa gắn/i.test(r2f.text), r2f.text.slice(0, 120));

  console.log('\n>> 3. get_lead co them phan zalo');
  const r3 = await callTool('get_lead', { lead: 'L1' });
  check('co zalo.conversations = 2', r3.json?.zalo?.conversations === 2, JSON.stringify(r3.json?.zalo));
  check('co chip cho tra loi', r3.json?.zalo?.state === 'Khách chờ trả lời · 2 giờ', r3.json?.zalo?.state);
  check('KHONG nhet tin nhan vao get_lead', !r3.text.includes('flycam'));
  const r3b = await callTool('get_lead', { lead: 'L4' });
  check('lead chua gan Zalo -> zalo null', r3b.json && r3b.json.zalo === null, JSON.stringify(r3b.json?.zalo));
} catch (e: any) {
  fail++; console.log('\nNGOAI LE: ' + e.message);
} finally {
  await db('crmDataTest', { method: 'DELETE' });
  await db('zaloTest', { method: 'DELETE' });
  console.log('\n>> Don dep: crmDataTest + zaloTest da xoa');
  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
  if (fail) process.exitCode = 1;
}
