/**
 * Test tool venue: list_venues, find_venue_products, add_venue_product, ten venue trong list_leads/get_lead,
 * venueId trong approve_proposal. Sandbox crmDataTest + aiDataTest. Luon don sach cuoi bai.
 */
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';

{
  const fs = await import('node:fs');
  const path = new URL('../.env.local', import.meta.url);
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(path)) {
    process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(path, 'utf8').trim();
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local (service account)'); process.exit(1); }
}

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const mod = (await import('../api/mcp.ts')) as any;
const handler = mod.default;

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

try {
  await db('aiDataTest', { method: 'DELETE' });
  await db('crmDataTest', { method: 'PUT', body: JSON.stringify({
    leads: { L1: { id: 'L1', name: 'Khach Venue', stage: 'leadin', venueId: 'vn_gem' } },
    venues: { vn_gem: { id: 'vn_gem', ten: 'Gem Center', taoLuc: '2026-10-01T00:00:00.000Z', sanPham: {
      sp_a: { id: 'sp_a', ten: 'Tiệc tối tone hồng', link: 'https://fb.com/a', tone: ['hong', 'trang'], taoLuc: '2026-10-02T00:00:00.000Z' },
    } } },
    toneMau: { tn_nau: { id: 'tn_nau', ten: 'Nâu đất', mau: '#7a5230' } },
  }) });

  console.log('\n>> list_venues');
  const lv = await callTool('list_venues', {});
  check('co Gem Center, 1 sp, 1 lead', lv.json?.venues?.[0]?.ten === 'Gem Center' && lv.json.venues[0].soSanPham === 1 && lv.json.venues[0].soLead === 1, lv.text.slice(0, 300));
  check('tone gom ca tone them', lv.json?.tones?.length === 11 && lv.json.tones.some((t: any) => t.ten === 'Nâu đất'));

  console.log('\n>> add_venue_product');
  const r1 = await callTool('add_venue_product', { venue: 'Chloe Gallery', ten: 'Ngoài trời xanh', link: 'https://fb.com/c', gia: 'Gói Unique', tone: ['Xanh lá', 'trắng'] });
  check('tao venue moi + them sp', r1.json?.daThem && r1.json.venueMoi && r1.json.venue === 'Chloe Gallery', r1.text);
  const vid = r1.json?.venueId;
  const luu = await doc(`crmDataTest/venues/${vid}`);
  const sp = luu && Object.values(luu.sanPham || {})[0] as any;
  check('luu dung cho, tone la id', sp?.link === 'https://fb.com/c' && JSON.stringify(sp.tone) === '["xanh-la","trang"]' && sp.gia === 'Gói Unique', JSON.stringify(luu));
  const r2 = await callTool('add_venue_product', { venue: 'chloe gallery', ten: 'Trùng', link: 'https://fb.com/c', tone: ['hong'] });
  check('trung link cung venue -> khong them', r2.json?.daCo === true && Object.keys((await doc(`crmDataTest/venues/${vid}/sanPham`)) || {}).length === 1, r2.text);
  const r3 = await callTool('add_venue_product', { venue: 'Gem Center', ten: 'Cổng nâu', link: 'https://fb.com/n', tone: ['nâu đất'] });
  check('venue co san theo ten + tone them', r3.json?.daThem && !r3.json.venueMoi && r3.json.venueId === 'vn_gem', r3.text);
  const r4 = await callTool('add_venue_product', { venue: 'Gem Center', ten: 'X', link: 'https://fb.com/x', tone: ['cam'] });
  check('tone la -> loi kem danh sach', r4.isError && /Tone hợp lệ/.test(r4.text), r4.text);
  const r5 = await callTool('add_venue_product', { venue: 'Gem Center', ten: 'X', link: 'javascript:alert(1)', tone: ['hong'] });
  check('link sai -> loi', r5.isError && /http/.test(r5.text), r5.text);
  check('loi khong ghi gi', Object.keys((await doc('crmDataTest/venues/vn_gem/sanPham')) || {}).length === 2);

  console.log('\n>> find_venue_products');
  const f1 = await callTool('find_venue_products', { venue: 'gem' });
  check('theo venue khong dau', f1.json?.total === 2 && f1.json.sanPham.every((x: any) => x.venue === 'Gem Center'), f1.text.slice(0, 300));
  const f2 = await callTool('find_venue_products', { tone: 'xanh' });
  check('tone "xanh" ra sp xanh la', f2.json?.total === 1 && f2.json.sanPham[0].link === 'https://fb.com/c' && f2.json.sanPham[0].tone.includes('Xanh lá'), f2.text.slice(0, 300));
  const f3 = await callTool('find_venue_products', { q: 'unique' });
  check('q khop gia', f3.json?.total === 1, f3.text.slice(0, 200));
  const f4 = await callTool('find_venue_products', { tone: 'cam' });
  check('tone khong co -> loi', f4.isError, f4.text);
  const f5 = await callTool('find_venue_products', {});
  check('moi nhat truoc', f5.json?.sanPham?.[f5.json.sanPham.length - 1]?.id === 'sp_a', f5.text.slice(0, 200));

  console.log('\n>> ten venue trong lead');
  const g = await callTool('get_lead', { lead: 'L1' });
  check('get_lead co ten venue', g.json?.venue === 'Gem Center', g.text.slice(0, 200));
  const ll = await callTool('list_leads', {});
  check('list_leads co ten venue', ll.json?.leads?.[0]?.venue === 'Gem Center', ll.text.slice(0, 300));

  console.log('\n>> approve_proposal venueId');
  await db('aiDataTest/proposals', { method: 'PATCH', body: JSON.stringify({
    p_ok: { id: 'p_ok', leadId: 'L1', type: 'field', field: 'venueId', newValue: vid, status: 'cho', reason: 't', evidence: [] },
    p_ma: { id: 'p_ma', leadId: 'L1', type: 'field', field: 'venueId', newValue: 'vn_khongco', status: 'cho', reason: 't', evidence: [] },
  }) });
  const a1 = await callTool('approve_proposal', { proposalId: 'p_ok' });
  check('duyet -> lead doi venue, bao ten', !a1.isError && /Chloe Gallery/.test(a1.text) && (await doc('crmDataTest/leads/L1/venueId')) === vid, a1.text);
  const a2 = await callTool('approve_proposal', { proposalId: 'p_ma' });
  check('venue khong con -> khong duyet', a2.isError && (await doc('crmDataTest/leads/L1/venueId')) === vid, a2.text);
} finally {
  console.log('\n>> Don sandbox');
  await db('crmDataTest', { method: 'DELETE' });
  await db('aiDataTest', { method: 'DELETE' });
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
