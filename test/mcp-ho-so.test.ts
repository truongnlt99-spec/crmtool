/**
 * Test tool MCP hồ sơ khách AI: list_stale_leads, lead_context, save_lead_brief, propose_changes,
 * prompt cap-nhat-ho-so. Sandbox 'crmDataTest' + 'zaloTest' + 'aiDataTest'. Luôn dọn sạch cuối bài.
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

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  }));
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return JSON.parse(line ? line.slice(5).trim() : text);
}
async function callTool(name: string, args: Record<string, unknown>) {
  const body = await rpc('tools/call', { name, arguments: args });
  const out = body?.result?.content?.[0]?.text ?? JSON.stringify(body?.error ?? '');
  let json: any = null;
  try { json = JSON.parse(out); } catch { json = null; }
  return { text: out, json, isError: !!body?.result?.isError || !!body?.error };
}

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
const doc = async (path: string) => (await db(path)).json() as Promise<any>;

const H = 3600_000;
const NOW = Date.now();

try {
  console.log('\n>> Dung sandbox crmDataTest + zaloTest + aiDataTest');
  await db('aiDataTest', { method: 'DELETE' });
  await db('crmDataTest', { method: 'PUT', body: JSON.stringify({
    leads: {
      L1: { id: 'L1', name: 'Lan Nguyễn', stage: 'baogia', package: 'Unique', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L2: { id: 'L2', name: 'Ngọc Hân', stage: 'follow1', package: 'Unique', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L3: { id: 'L3', name: 'Khách Chốt', stage: 'won', package: 'Standard', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L4: { id: 'L4', name: 'Chưa Có Zalo', stage: 'leadin', package: 'Standard', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
      L5: { id: 'L5', name: 'Khách Mất', stage: 'lost', package: 'Standard', ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-09-01' },
    },
    planRevenue: 1, planLeads: 1,
  }) });
  await db('zaloTest', { method: 'PUT', body: JSON.stringify({
    links: {
      c1: { status: 'lead', leadId: 'L1', name: 'Lan Nguyễn', isGroup: false, linkedAt: 1 },
      c2: { status: 'lead', leadId: 'L2', name: 'Ngọc Hân', isGroup: false, linkedAt: 1 },
      c3: { status: 'lead', leadId: 'L3', name: 'Khách Chốt', isGroup: false, linkedAt: 1 },
      c5: { status: 'lead', leadId: 'L5', name: 'Khách Mất', isGroup: false, linkedAt: 1 },
      c6: { status: 'lead', leadId: 'L1', name: 'Chồng Lan', isGroup: false, linkedAt: 1 },
      c9: { status: 'ignored', leadId: 'L1', name: 'Không phải khách', isGroup: false, linkedAt: 1 },
    },
    meta: {
      c1: { lastAt: NOW - 1 * H }, c2: { lastAt: NOW - 3 * H }, c3: { lastAt: NOW - 2 * H },
      c5: { lastAt: NOW - 30 * 60_000 }, c6: { lastAt: NOW - 6 * H }, c9: { lastAt: NOW - 1.5 * H },
    },
    msgs: {
      c1: {
        '101': { at: NOW - 5 * H, fromMe: false, kind: 'text', text: 'Tụi em cưới 12/12 nha chị' },
        '102': { at: NOW - 4 * H, fromMe: true, kind: 'text', text: 'Dạ tối nay em gửi chị phim mẫu Signature nha' },
        '103': { at: NOW - 3 * H, fromMe: false, kind: 'text', text: 'Để cuối tuần em bàn với ông xã rồi báo chị' },
        '104': { at: NOW - 2 * H, fromMe: false, kind: 'text', text: 'Bên kia báo 30 triệu thôi chị' },
        '105': { at: NOW - 1 * H, fromMe: false, kind: 'text' },   // chưa có nội dung
      },
      c2: { '201': { at: NOW - 3 * H, fromMe: false, kind: 'text', text: 'Ngân sách tụi em tầm 45 triệu' } },
      c5: { '501': { at: NOW - 30 * 60_000, fromMe: false, kind: 'text', text: 'Em đổi ý rồi' } },
      c6: { '601': { at: NOW - 6 * H, fromMe: false, kind: 'text', text: 'Anh là chồng Lan' } },
      c9: { '901': { at: NOW - 1.5 * H, fromMe: false, kind: 'text', text: 'TIN KHONG PHAI KHACH' } },
      c3: { '301': { at: NOW - 2 * H, fromMe: false, kind: 'text', text: 'Em chuyển cọc rồi nha' } },
    },
  }) });
  console.log('   seed OK');

  console.log('\n>> list_stale_leads');
  {
    const r = await callTool('list_stale_leads', {});
    const ids = (r.json?.leads || []).map((l: any) => l.leadId);
    check('co L1 va L2, xep tin moi nhat truoc', JSON.stringify(ids) === '["L1","L2"]', r.text);
    check('bo lead Won, Lost, khong co hoi thoai', !ids.includes('L3') && !ids.includes('L5') && !ids.includes('L4'));
    check('chua co ho so', r.json?.leads?.[0]?.chuaCoHoSo === true, r.text);
  }

  console.log('\n>> lead_context lan dau');
  {
    const r = await callTool('lead_context', { lead: 'L1' });
    const j = r.json;
    check('tra 6 tin (c1 + c6)', j?.tin?.length === 6, r.text.slice(0, 300));
    check('tin co convId + msgId', j?.tin?.[0]?.convId === 'c6' && j?.tin?.[0]?.msgId === '601' && j?.tin?.[1]?.msgId === '101');
    check('nguoi gui', j?.tin?.[2]?.from === 'Mình' && j?.tin?.[0]?.from === 'Chồng Lan' && j?.tin?.[1]?.from === 'Lan Nguyễn', JSON.stringify(j?.tin?.slice(0, 3)));
    check('con tro dung truoc tin thieu noi dung', j?.cursorDeXuat === NOW - 2 * H, String(j?.cursorDeXuat));
    check('chua co ho so', j?.brief === null);
    check('o hien tai', j?.lead?.package === 'Unique' && j?.lead?.stageName === 'Báo giá', JSON.stringify(j?.lead));
    check('chi tin tu c1 va c6', !j?.tin?.some((t: any) => !['c1', 'c6'].includes(t.convId)));
    check('khong lo tin link khong phai khach', !r.text.includes('901') && !r.text.includes('TIN KHONG PHAI KHACH'));
  }

  // Task 4, 5, 6 nối tiếp các khối test vào đây.

} finally {
  console.log('\n>> Don sandbox');
  await db('crmDataTest', { method: 'DELETE' });
  await db('zaloTest', { method: 'DELETE' });
  await db('aiDataTest', { method: 'DELETE' });
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
