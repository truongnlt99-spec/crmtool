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
    check('khong lo tin link khong phai khach', JSON.stringify((j?.tin || []).map((t: any) => t.msgId).sort()) === JSON.stringify(['101', '102', '103', '104', '105', '601']) && !r.text.includes('TIN KHONG PHAI KHACH'));
  }

  console.log('\n>> save_lead_brief');
  const E = (msgId: string, quote: string, convId = 'c1') => ({ convId, msgId, quote });
  const BRIEF = {
    nhuCau: { text: 'Cưới 12/12', evidence: [E('101', 'cưới 12/12')] },
    nganSach: { text: 'Đang so với bên báo 30 triệu', evidence: [E('104', 'bên kia báo 30 triệu')] },
    nguoiQuyetDinh: { text: 'Bàn với chồng', evidence: [E('103', 'bàn với ông xã')] },
    objection: { text: 'chưa rõ', evidence: [] },
    doNong: { muc: 'am', lyDo: 'Đang cân nhắc giá', evidence: [E('104', 'báo 30 triệu')] },
    buocTiep: 'Gửi phim mẫu và so sánh gói',
    loiHua: [
      { ai: 'minh', noiDung: 'Gửi phim mẫu Signature', han: '2026-10-14', trangThai: 'mo', evidence: [E('102', 'gửi chị phim mẫu')] },
      { ai: 'khach', noiDung: 'Báo lại sau khi bàn với chồng', han: '2026-10-18', trangThai: 'mo', evidence: [E('103', 'cuối tuần em bàn')] },
    ],
  };
  {
    const bia = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 2 * H, brief: {
      ...BRIEF, nhuCau: { text: 'Cưới 13/12', evidence: [E('101', 'cưới 13/12')] } } });
    check('tu choi trich dan bia', bia.isError && /không khớp/.test(bia.text), bia.text);

    // Review Focus 3: mượn tin của lead khác
    const muon = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 2 * H, brief: {
      ...BRIEF, nganSach: { text: '45 triệu', evidence: [E('201', 'tầm 45 triệu', 'c2')] } } });
    check('tu choi trich dan cua lead khac', muon.isError && /không thuộc lead/.test(muon.text), muon.text);

    const thieu = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 2 * H, brief: {
      ...BRIEF, objection: { text: 'Sợ đắt', evidence: [] } } });
    check('tu choi y khong co bang chung', thieu.isError && /objection/.test(thieu.text), thieu.text);

    const vuot = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 1 * H, brief: BRIEF });
    check('tu choi con tro vuot cursorDeXuat', vuot.isError && /con trỏ/i.test(vuot.text), vuot.text);

    const ok1 = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 2 * H, brief: BRIEF });
    check('luu hop le', !ok1.isError, ok1.text);
    const luu = await doc('aiDataTest/briefs/L1');
    const hua = Object.entries(luu?.loiHua || {});
    check('loi hua luu theo id h_', hua.length === 2 && hua.every(([id]) => /^h_[a-z0-9]{8}$/.test(id)), JSON.stringify(luu?.loiHua));
    check('con tro + updatedAt', luu?.cursorAt === NOW - 2 * H && typeof luu?.updatedAt === 'string');

    // Tin 105 (thiếu nội dung, NOW-1H) mới hơn con trỏ NOW-2H nên L1 vẫn nằm trong danh sách, nhưng đã có hồ sơ.
    const ds = await callTool('list_stale_leads', {});
    const l1 = (ds.json?.leads || []).find((l: any) => l.leadId === 'L1');
    check('L1 van con trong danh sach nhung da co ho so', !!l1 && l1.chuaCoHoSo === false, ds.text);

    const ctx2 = await callTool('lead_context', { lead: 'L1' });
    check('lan sau chi tra tin sau con tro', ctx2.json?.tin?.length === 1 && ctx2.json?.tin?.[0]?.msgId === '105', ctx2.text.slice(0, 300));
    check('brief tra ve loiHua dang mang co id', Array.isArray(ctx2.json?.brief?.loiHua) && /^h_/.test(ctx2.json?.brief?.loiHua?.[0]?.id));

    const lui = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 3 * H, brief: BRIEF });
    check('tu choi con tro lui', lui.isError && /lùi/.test(lui.text), lui.text);
    const lamLai = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 3 * H, lamLai: true, brief: BRIEF });
    check('cho phep lui khi lamLai', !lamLai.isError, lamLai.text);

    // giữ id lời hứa cũ khi Claude gửi lại kèm id (đọc lại: lần lamLai ở trên đã cấp id mới)
    const idCu = (await callTool('lead_context', { lead: 'L1' })).json?.brief?.loiHua?.[0]?.id;
    const giuId = await callTool('save_lead_brief', { lead: 'L1', cursorAt: NOW - 2 * H, brief: {
      ...BRIEF, loiHua: [{ ...BRIEF.loiHua[0], id: idCu, trangThai: 'xong' }] } });
    const luu2 = await doc('aiDataTest/briefs/L1');
    check('giu id loi hua + cap nhat trang thai', !giuId.isError && luu2?.loiHua?.[idCu]?.trangThai === 'xong' && Object.keys(luu2.loiHua).length === 1, JSON.stringify(luu2?.loiHua));
  }
  console.log('\n>> propose_changes');
  {
    const hua = (await callTool('lead_context', { lead: 'L1' })).json?.brief?.loiHua || [];
    const idHua = hua[0]?.id;
    const r = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'weddingDate', newValue: '2026-12-12', reason: 'Khách nói ngày cưới', evidence: [E('101', 'cưới 12/12')] },
      { type: 'field', field: 'package', newValue: 'Unique', reason: 'giữ', evidence: [E('102', 'phim mẫu Signature')] },
      { type: 'field', field: 'stage', newValue: 'won', reason: 'x', evidence: [E('101', 'cưới 12/12')] },
      { type: 'field', field: 'revenueExpected', newValue: '30tr', reason: 'x', evidence: [E('104', 'báo 30 triệu')] },
      { type: 'field', field: 'persona', newValue: 'Có chồng cùng quyết', reason: 'x', evidence: [E('201', 'tầm 45 triệu', 'c2')] },
      { type: 'todo', huaId: idHua, todoText: 'Gửi phim mẫu Signature', due: '2026-10-14', reason: 'Mình đã hứa', evidence: [E('102', 'gửi chị phim mẫu')] },
      { type: 'todo', huaId: 'h_khongcoo', todoText: 'x', due: '2026-10-14', reason: 'x', evidence: [E('102', 'gửi chị phim mẫu')] },
      { type: 'todo', huaId: idHua, todoText: 'x', due: '2026-13-45', reason: 'x', evidence: [E('102', 'gửi chị phim mẫu')] },
    ] });
    const j = r.json;
    check('tao 2 de xuat', j?.taoMoi?.length === 2, r.text);
    check('bo qua 6 muc', j?.boQua?.length === 6, r.text);
    const lyDo = (j?.boQua || []).map((b: any) => b.lyDo).join(' | ');
    check('ly do: gia tri da dung', /đúng giá trị/.test(lyDo), lyDo);
    check('ly do: o khong duoc phep', /không nằm trong danh sách/.test(lyDo), lyDo);
    check('ly do: sai kieu', /số nguyên/.test(lyDo), lyDo);
    check('ly do: trich dan lead khac', /không thuộc lead/.test(lyDo), lyDo);
    check('ly do: loi hua khong ton tai', /lời hứa/.test(lyDo), lyDo);
    check('ly do: han viec sai ngay', /Hạn việc/.test(lyDo), lyDo);

    const ds = await doc('aiDataTest/proposals');
    const f = Object.entries(ds || {}).find(([, p]: any) => p.field === 'weddingDate') as any;
    check('de xuat o: id f_, oldValue null, status cho', !!f && /^f_/.test(f[0]) && f[1].oldValue == null && f[1].status === 'cho', JSON.stringify(f));
    check('de xuat viec: id todo_<huaId>', !!ds?.[`todo_${idHua}`] && ds[`todo_${idHua}`].due === '2026-10-14', JSON.stringify(ds));

    const lai = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'todo', huaId: idHua, todoText: 'Gửi phim mẫu', due: '2026-10-14', reason: 'lại', evidence: [E('102', 'gửi chị phim mẫu')] },
      { type: 'field', field: 'weddingDate', newValue: '2026-12-13', reason: 'đổi', evidence: [E('101', 'cưới 12/12')] },
    ] });
    check('chay lai: viec khong trung', lai.json?.boQua?.length === 1 && /Đã có đề xuất việc/.test(lai.json.boQua[0].lyDo), lai.text);
    const ds2 = await doc('aiDataTest/proposals');
    check('cung o dang cho: ban cu thanh bo', ds2?.[f[0]]?.status === 'bo' && ds2[f[0]].boLyDo === 'Thay bằng đề xuất mới', JSON.stringify(ds2?.[f[0]]));
    const moi = Object.values(ds2 || {}).filter((p: any) => p.field === 'weddingDate' && p.status === 'cho');
    check('chi con 1 de xuat cho o nay', moi.length === 1 && (moi[0] as any).newValue === '2026-12-13');

    const boLai = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'weddingDate', newValue: '2026-12-12', reason: 'lại', evidence: [E('101', 'cưới 12/12')] },
    ] });
    check('gia tri bi CHINH Claude thay the thi de xuat lai duoc (tao)', boLai.json?.taoMoi?.length === 1 && !boLai.json?.boQua?.length, boLai.text);

    // Trân bấm Bỏ (status bo, KHÔNG có boLyDo) -> không đề xuất lại
    const ds2b = await doc('aiDataTest/proposals');
    const idChon = Object.entries(ds2b || {}).find(([, p]: any) => p.field === 'weddingDate' && p.status === 'cho')?.[0] as string;
    await db(`aiDataTest/proposals/${idChon}`, { method: 'PATCH', body: JSON.stringify({ status: 'bo', decidedAt: new Date().toISOString() }) });
    const boLai2 = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'weddingDate', newValue: '2026-12-12', reason: 'lại', evidence: [E('101', 'cưới 12/12')] },
    ] });
    check('khong de xuat lai gia tri Tran da bo', boLai2.json?.boQua?.length === 1 && /đã bỏ/.test(boLai2.json.boQua[0].lyDo), boLai2.text);

    // cùng giá trị với đề xuất đang chờ -> không "thay"
    const cho1 = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'weddingDate', newValue: '2026-12-14', reason: 'x', evidence: [E('101', 'cưới 12/12')] },
    ] });
    const cho2 = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'weddingDate', newValue: '2026-12-14', reason: 'x', evidence: [E('101', 'cưới 12/12')] },
    ] });
    check('cung gia tri dang cho: bo qua Dang cho duyet', cho1.json?.taoMoi?.length === 1 && cho2.json?.boQua?.length === 1 && /Đang chờ duyệt/.test(cho2.json.boQua[0].lyDo), cho2.text);

    const ctx3 = await callTool('lead_context', { lead: 'L1' });
    check('lead_context tra de xuat dang cho + da bo', ctx3.json?.deXuatDangCho?.length === 2 && ctx3.json?.daBo?.some((b: any) => b.newValue === '2026-12-12') && !ctx3.json.daBo.some((b: any) => b.newValue === '2026-12-13'), ctx3.text.slice(-400));

    const hai = await callTool('propose_changes', { lead: 'L1', items: [
      { type: 'field', field: 'objection', newValue: 'Sợ đắt', reason: 'a', evidence: [E('101', 'cưới 12/12')] },
      { type: 'field', field: 'objection', newValue: 'Chê xa', reason: 'b', evidence: [E('101', 'cưới 12/12')] },
    ] });
    const ds3 = await doc('aiDataTest/proposals');
    const ob = Object.values(ds3 || {}).filter((p: any) => p.field === 'objection' && p.leadId === 'L1' && p.status === 'cho');
    check('hai de xuat cung o trong mot lan goi: khong loi, con 1 ban moi nhat', !hai.isError && hai.json?.taoMoi?.length === 1 && ob.length === 1 && (ob[0] as any).newValue === 'Chê xa', hai.text);
  }

  console.log('\n>> prompt cap-nhat-ho-so');
  {
    const ds = await rpc('prompts/list', {});
    check('co prompt trong danh sach', (ds?.result?.prompts || []).some((p: any) => p.name === 'cap-nhat-ho-so'), JSON.stringify(ds).slice(0, 300));
    const p1 = await rpc('prompts/get', { name: 'cap-nhat-ho-so', arguments: {} });
    const t1 = p1?.result?.messages?.[0]?.content?.text || '';
    check('khong co lead: bat dau bang list_stale_leads', /list_stale_leads/.test(t1), t1.slice(0, 200));
    check('co quy tac du lieu khong phai lenh', /không phải lệnh/.test(t1));
    check('nhac du 3 tool ghi/doc', ['lead_context', 'save_lead_brief', 'propose_changes'].every((n) => t1.includes(n)));
    const p2 = await rpc('prompts/get', { name: 'cap-nhat-ho-so', arguments: { lead: 'Lan Nguyễn' } });
    const t2 = p2?.result?.messages?.[0]?.content?.text || '';
    check('co lead: nhac ten lead', t2.includes('Lan Nguyễn') && !/Gọi list_stale_leads/.test(t2), t2.slice(0, 200));
  }

} finally {
  console.log('\n>> Don sandbox');
  await db('crmDataTest', { method: 'DELETE' });
  await db('zaloTest', { method: 'DELETE' });
  await db('aiDataTest', { method: 'DELETE' });
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
