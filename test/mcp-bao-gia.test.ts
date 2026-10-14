/**
 * Test tool save_quote + get_lead/lead_context trả báo giá. Sandbox crmDataTest + zaloTest + aiDataTest.
 * Luôn dọn sạch cuối bài.
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

// Ngày tương đối để test không phụ thuộc lịch
const homNay = mod.congNgay(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), 0);
const HAN = mod.congNgay(homNay, 10);
const MAU = {
  tieuDe: 'Phương án quay chụp ăn hỏi & cưới', tenKhach: 'Cô dâu Huyền Nguyễn', diaDiem: 'Hà Nội',
  buoi: [
    { loai: 'anHoi', ten: 'Lễ ăn hỏi', ngay: '2026-11-16', gio: '3h - 5h chiều', soKhach: '40-50', moTa: null,
      goi: 'Combo 2 máy chụp', giaGoc: 18000000, uuDaiPhanTram: 25, giaSauUuDai: 13500000, ekip: ['1 Nhiếp ảnh phóng sự'], sanPham: [], quaTang: [] },
    { loai: 'cuoi', ten: 'Đám cưới', ngay: '2026-12-24', gio: null, soKhach: '750', moTa: 'Tiệc tại The One',
      goi: 'Gói Standard', giaGoc: 29900000, uuDaiPhanTram: 5, giaSauUuDai: 28405000, ekip: [], sanPham: ['Phim 4-6 phút'], quaTang: ['Hình Sneak peek'] },
  ],
  tongGiaGoc: 47900000, tongSauUuDai: 41905000, tietKiem: 5995000, hanUuDai: HAN, ghiChu: [],
};

try {
  console.log('\n>> Dung sandbox');
  await db('aiDataTest', { method: 'DELETE' });
  await db('crmDataTest', { method: 'PUT', body: JSON.stringify({
    leads: { L1: { id: 'L1', name: 'Huyền Nguyễn', stage: 'baogia', package: 'Unique', revenueExpected: 0, ownerUid: 'U', deadline: '2026-12-01', createdAt: '2026-10-01' } },
    planRevenue: 1, planLeads: 1,
  }) });

  console.log('\n>> save_quote');
  const sai = await callTool('save_quote', { lead: 'L1', baoGia: { ...MAU, tongSauUuDai: 42000000, tietKiem: 5900000 } });
  check('tu choi phep tinh sai', sai.isError && /Tổng sau ưu đãi/.test(sai.text), sai.text);
  check('phep tinh sai: khong ghi gi', !(await doc('crmDataTest/leads/L1/baoGia')));

  const r1 = await callTool('save_quote', { lead: 'Huyền Nguyễn', baoGia: MAU });
  check('luu hop le', !r1.isError && /^bg_[a-z0-9]+$/.test(r1.json?.baoGiaId), r1.text);
  const luu = await doc(`crmDataTest/leads/L1/baoGia/${r1.json?.baoGiaId}`);
  check('bao gia luu trong lead + taoLuc', luu?.tongSauUuDai === 41905000 && typeof luu?.taoLuc === 'string', JSON.stringify(luu).slice(0, 200));
  const lead = await doc('crmDataTest/leads/L1');
  check('o cua lead khong doi', lead.revenueExpected === 0 && lead.package === 'Unique' && !lead.weddingDate, JSON.stringify(lead).slice(0, 200));
  check('co log hoat dong', Object.values(lead.activityLog || {}).some((a: any) => /Lưu báo giá/.test(a.text)));

  const p1 = (await doc('aiDataTest/proposals')) || {};
  const ds1 = Object.entries(p1).map(([id, p]: any) => ({ id, ...p }));
  check('4 de xuat', ds1.length === 4, JSON.stringify(ds1.map((p) => p.field || p.id)));
  const dt = ds1.find((p) => p.field === 'revenueExpected');
  check('de xuat doanh thu + nguon bao gia', dt?.newValue === 41905000 && dt?.nguon?.loai === 'baoGia' && dt?.nguon?.baoGiaId === r1.json?.baoGiaId && /Theo báo giá ngày/.test(dt?.reason), JSON.stringify(dt));
  check('de xuat ngay cuoi', ds1.some((p) => p.field === 'weddingDate' && p.newValue === '2026-12-24'));
  check('de xuat goi Standard', ds1.some((p) => p.field === 'package' && p.newValue === 'Standard'));
  const viec = ds1.find((p) => p.type === 'todo');
  check('viec nhac han uu dai', viec?.id === `todo_bguu${HAN.replace(/-/g, '')}` && viec?.due === mod.congNgay(HAN, -2), JSON.stringify(viec));

  // Review Focus 5: lưu lại y nguyên -> không đề xuất trùng
  const r2 = await callTool('save_quote', { lead: 'L1', baoGia: MAU });
  const ds2 = Object.values((await doc('aiDataTest/proposals')) || {});
  check('luu lai: khong de xuat trung', !r2.isError && ds2.length === 4 && ds2.filter((p: any) => p.status === 'cho').length === 4, `${ds2.length} ${r2.text.slice(0, 300)}`);
  check('luu lai: bao bo qua', (r2.json?.deXuatBoQua || []).length === 4, r2.text.slice(0, 300));

  // Bản mới: ăn hỏi giảm 30% -> tổng đổi -> đề xuất doanh thu được THAY, việc nhắc không thêm
  const moi = JSON.parse(JSON.stringify(MAU));
  moi.buoi[0].uuDaiPhanTram = 30; moi.buoi[0].giaSauUuDai = 12600000;
  moi.tongSauUuDai = 12600000 + 28405000; moi.tietKiem = 47900000 - moi.tongSauUuDai;
  const r3 = await callTool('save_quote', { lead: 'L1', baoGia: moi });
  const ds3 = Object.values((await doc('aiDataTest/proposals')) || {}) as any[];
  const dtCho = ds3.filter((p) => p.field === 'revenueExpected' && p.status === 'cho');
  check('ban moi: 1 de xuat doanh thu dang cho voi tong moi', dtCho.length === 1 && dtCho[0].newValue === moi.tongSauUuDai, JSON.stringify(dtCho));
  check('ban moi: viec nhac khong trung', ds3.filter((p) => p.type === 'todo').length === 1);

  console.log('\n>> get_lead / lead_context');
  const g = await callTool('get_lead', { lead: 'L1' });
  check('get_lead: baoGiaMoiNhat la ban moi', g.json?.baoGiaMoiNhat?.id === r3.json?.baoGiaId && g.json?.soBanBaoGia === 3, g.text.slice(0, 300));
  check('get_lead: khong tra baoGia tho', g.json && !('baoGia' in g.json));
  const c = await callTool('lead_context', { lead: 'L1' });
  check('lead_context: co baoGiaMoiNhat', c.json?.baoGiaMoiNhat?.tongSauUuDai === moi.tongSauUuDai, c.text.slice(0, 300));
} finally {
  console.log('\n>> Don sandbox');
  await db('crmDataTest', { method: 'DELETE' });
  await db('zaloTest', { method: 'DELETE' });
  await db('aiDataTest', { method: 'DELETE' });
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
