/**
 * Test đồng bộ giữa app web và Claude (MCP) khi cả hai cùng ghi.
 *
 * Chạy ĐÚNG đoạn CLOUD SYNC trong index.html (bóc ra, chạy trong node:vm) và ĐÚNG các
 * tool ghi trong api/mcp.ts, nối vào cùng một Firebase giả lập trong bộ nhớ.
 * Không gọi mạng, không cần service account, không đụng crmData.
 *
 * Firebase giả bắt chước những hành vi của bản thật mà lỗi đồng bộ phụ thuộc vào:
 *  - update() của SDK bắn sự kiện onValue NGAY trong lời gọi, với dữ liệu vừa ghi
 *  - máy chủ bỏ mảng rỗng / null, trả key theo thứ tự sắp xếp, object key số -> mảng
 *  - update() từ chối khi hai đường dẫn lồng nhau (vd leads/X và leads/X/ownerUid)
 */
import fs from 'node:fs';
import vm from 'node:vm';

// Chặn mọi đường ra mạng thật: không có service account -> MCP không xin token,
// không có MCP_SECRET -> handler không đọc khoá; fetch bên dưới chỉ trả lời Firebase giả.
delete process.env.FIREBASE_SERVICE_ACCOUNT;
delete process.env.MCP_SECRET;
delete process.env.FIREBASE_DB_URL;
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';
const ROOT = 'crmDataTest';
const DB_URL = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

/* ===================== Firebase giả ===================== */

let mayChu: any = {};
const nguoiNghe: Array<(s: any) => void> = [];
const lichSuGhi: string[][] = [];   // các đường dẫn app ghi trong từng lần update()
let tuChoiLanGhiToi = false;

const saoChep = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const tach = (p: string) => p.split('/').filter(Boolean);

function chuanHoa(v: any): any {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const a = v.map(chuanHoa);
    return a.some((x) => x !== undefined) ? a : undefined;
  }
  if (typeof v === 'object') {
    const o: any = {};
    for (const k of Object.keys(v).sort()) {
      const c = chuanHoa(v[k]);
      if (c !== undefined) o[k] = c;
    }
    const keys = Object.keys(o);
    if (!keys.length) return undefined;
    // Firebase trả object toàn key số (0,1,2...) về dạng mảng
    if (keys.every((k) => /^\d+$/.test(k)) && Math.max(...keys.map(Number)) < keys.length * 2) {
      const a: any[] = [];
      for (const k of keys) a[Number(k)] = o[k];
      return a;
    }
    return o;
  }
  return v;
}

function docTai(parts: string[]) {
  let n = mayChu;
  for (const p of parts) { if (n == null) return undefined; n = n[p]; }
  return n;
}

function ghiTai(parts: string[], value: any) {
  let n = mayChu;
  for (const p of parts.slice(0, -1)) {
    if (n[p] == null || typeof n[p] !== 'object') n[p] = {};
    n = n[p];
  }
  const k = parts[parts.length - 1];
  if (value === null) delete n[k]; else n[k] = saoChep(value);
}

const anhChup = (v: any) => ({ exists: () => v !== undefined, val: () => (v === undefined ? null : saoChep(v)) });

function sauKhiGhi() {
  mayChu = chuanHoa(mayChu) ?? {};
  const v = docTai([ROOT]);
  for (const cb of [...nguoiNghe]) cb(anhChup(v));
}

// Phía app: giả SDK Firebase (get / onValue / update)
const firebaseGia = {
  dataRef: { path: ROOT },
  get: async () => anhChup(docTai([ROOT])),
  onValue: (_ref: any, cb: (s: any) => void) => {
    nguoiNghe.push(cb);
    cb(anhChup(docTai([ROOT])));
    return () => {};
  },
  update: (_ref: any, values: Record<string, any>) => {
    const keys = Object.keys(values);
    for (const a of keys) for (const b of keys) {
      if (a !== b && b.startsWith(a + '/')) throw new Error(`update(): duong dan long nhau ${a} va ${b}`);
    }
    lichSuGhi.push(keys);
    if (tuChoiLanGhiToi) {
      tuChoiLanGhiToi = false;
      return Promise.reject(new Error('PERMISSION_DENIED (gia lap)'));
    }
    for (const [p, v] of Object.entries(values)) ghiTai([ROOT, ...tach(p)], v);
    sauKhiGhi();   // SDK thật bắn sự kiện cục bộ ngay trong lời gọi update()
    return Promise.resolve();
  },
};

// Phía MCP: giả Firebase REST bằng cách chặn fetch
const traJson = (v: any) =>
  new Response(JSON.stringify(v ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== DB_URL) throw new Error('Test chan truy cap mang that: ' + url.href);
  const parts = tach(decodeURIComponent(url.pathname).replace(/\.json$/, ''));
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET') return traJson(saoChep(docTai(parts)));
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (method === 'PATCH') for (const [k, v] of Object.entries(body || {})) ghiTai([...parts, ...tach(k)], v);
  else if (method === 'PUT') ghiTai(parts, body);
  else if (method === 'DELETE') ghiTai(parts, null);
  sauKhiGhi();   // app đang mở nhận được sự kiện realtime
  return traJson(body);
}) as any;

/* ===================== MCP thật ===================== */

const handler = ((await import('../api/mcp.ts')) as any).default;

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await handler.fetch(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
    })
  );
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const body = JSON.parse(line ? line.slice(5).trim() : text);
  if (body?.error) return { error: JSON.stringify(body.error), isError: true, text: '' };
  return { text: body?.result?.content?.[0]?.text ?? '', isError: !!body?.result?.isError, error: '' };
}

/* ===================== App thật (đoạn CLOUD SYNC của index.html) ===================== */

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DAU = '/* ======================= CLOUD SYNC';
const CUOI = '// Khởi động app sau khi đã đăng nhập';
const iDau = html.indexOf(DAU), iCuoi = html.indexOf(CUOI);
if (iDau < 0 || iCuoi < iDau) {
  console.error('Khong tim thay doan CLOUD SYNC trong index.html — cap nhat moc DAU/CUOI trong test.');
  process.exit(1);
}
const MA_DONG_BO = html.slice(iDau, iCuoi);

function moApp() {
  nguoiNghe.length = 0;
  const ui = { drawerMo: false, trangThai: '' };

  // Đồng hồ giả: điều khiển được mốc 700ms của scheduleSave và 1500ms của flushPendingRemote
  let bayGio = 0, idKe = 1;
  const hen = new Map<number, { luc: number; fn: () => void; lap: number }>();

  const ctx: any = {
    console: {
      log() {}, info() {}, warn() {},
      error: (...a: any[]) => console.log('   [app console.error]', ...a.map(String)),
    },
    window: { __firebase: firebaseGia, __authUser: { uid: 'UID_VO' } },
    document: {
      activeElement: null,
      querySelector: () => null,
      getElementById: (id: string) =>
        id === 'drawer' ? { classList: { contains: (c: string) => c === 'open' && ui.drawerMo } }
        : id === 'syncStatus' ? { set className(v: string) { ui.trangThai = v.replace('sync-status ', ''); }, innerHTML: '' }
        : null,
    },
    setTimeout: (fn: () => void, ms = 0) => { const id = idKe++; hen.set(id, { luc: bayGio + ms, fn, lap: 0 }); return id; },
    clearTimeout: (id: number) => { hen.delete(id); },
    setInterval: (fn: () => void, ms: number) => { const id = idKe++; hen.set(id, { luc: bayGio + ms, fn, lap: ms }); return id; },
    alert: (m: string) => console.log('   [app alert] ' + m),
    renderAll: () => {},
    nowLabel: () => '12/09/2026, 10:00',
  };
  vm.createContext(ctx);
  // Các biến state này khai báo ở phần khác của index.html
  vm.runInContext('let leads = []; let dailyTodos = []; let planRevenue = 100000000; let planLeads = 10;', ctx);
  vm.runInContext(MA_DONG_BO, ctx, { filename: 'index.html#cloud-sync' });

  const chay = (code: string) => vm.runInContext(code, ctx);
  const nhuong = () => new Promise((r) => setImmediate(r));

  async function troiQua(ms: number) {
    const dich = bayGio + ms;
    for (;;) {
      let ke: [number, { luc: number; fn: () => void; lap: number }] | null = null;
      for (const e of hen) if (e[1].luc <= dich && (!ke || e[1].luc < ke[1].luc)) ke = e;
      if (!ke) break;
      const [id, h] = ke;
      bayGio = h.luc;
      if (h.lap) h.luc += h.lap; else hen.delete(id);
      h.fn();
      await nhuong();
    }
    bayGio = dich;
    await nhuong();
  }

  const leadCucBo = (id: string) =>
    chay(`JSON.parse(JSON.stringify(leads.find(l => l.id === ${JSON.stringify(id)}) || null))`);

  // Giống saveNote() trong drawer: thêm ghi chú vào lead rồi hẹn lưu
  const goGhiChu = (id: string, text: string) =>
    chay(`(() => {
      const lead = leads.find(l => l.id === ${JSON.stringify(id)});
      lead.notesList = lead.notesList || [];
      lead.notesList.push({ id: 'n' + Date.now() + Math.random(), text: ${JSON.stringify(text)}, createdAt: nowLabel(), updatedAt: nowLabel() });
      scheduleSave();
    })()`);

  return { ui, chay, troiQua, leadCucBo, goGhiChu, khoiDong: () => chay('initCloudSync()') };
}

/* ===================== Dữ liệu mẫu ===================== */

function napMayChu() {
  mayChu = {};
  ghiTai([ROOT], {
    leads: {
      LA: {
        id: 'LA', ownerUid: 'UID_VO', name: 'Chi Lan', stage: 'baogia', leadType: 'Lead công ty',
        package: 'Signature', revenueExpected: 50000000, deadline: '2026-09-20', createdAt: '2026-09-01',
        tags: [], todos: [], notesList: [],
        activityLog: [{ time: '01/09/2026, 09:00', text: 'Lead được tạo' }],
      },
      LB: {
        id: 'LB', ownerUid: 'UID_VO', name: 'Anh Minh', stage: 'follow1', leadType: 'Lead công ty',
        package: 'Signature', revenueExpected: 30000000, deadline: '2026-09-25', createdAt: '2026-09-02',
        tags: [], notesList: [],
        // Việc cũ chưa có id/dueDate: app tự bù khi nạp (migrateLead) — KHÔNG phải người dùng sửa
        todos: [{ text: 'Goi lai', done: false }],
        activityLog: [{ time: '02/09/2026, 09:00', text: 'Lead được tạo' }],
      },
    },
    dailyTodos: { t0: { text: 'Tong ket tuan', done: false } },
    planRevenue: 100000000,
    planLeads: 10,
  });
  mayChu = chuanHoa(mayChu);
  lichSuGhi.length = 0;
  tuChoiLanGhiToi = false;
}

const leadMayChu = (id: string) => docTai([ROOT, 'leads', id]);
const coGhiChu = (lead: any, text: string) => (lead?.notesList || []).some((n: any) => n.text === text);
const timTheoTen = (ten: string) =>
  Object.values<any>(docTai([ROOT, 'leads']) || {}).find((l) => l.name === ten);

/* ===================== Kịch bản ===================== */

try {
  console.log('\n>> (b) Dang mo drawer, Claude tao lead moi, roi go ghi chu trong app');
  {
    napMayChu();
    const app = moApp();
    await app.khoiDong();
    app.ui.drawerMo = true;

    const r = await callTool('create_lead', { name: 'Khach Claude Tao', phone: '0900000009' });
    check('create_lead chay duoc', !r.isError, r.error || r.text);
    const idMoi = timTheoTen('Khach Claude Tao')?.id;
    check('lead moi co tren may chu ngay sau khi Claude tao', !!idMoi);

    app.goGhiChu('LA', 'Khach hen thu 5');
    await app.troiQua(1000);   // qua mốc 700ms -> app lưu

    check('lead Claude tao VAN CON sau khi app luu', !!leadMayChu(idMoi), 'lead da bi xoa!');
    check('ghi chu go trong app da len may chu', coGhiChu(leadMayChu('LA'), 'Khach hen thu 5'));

    app.ui.drawerMo = false;
    await app.troiQua(2000);   // đóng drawer -> app áp cập nhật đang chờ
    check('dong drawer xong app hien lead Claude tao', !!app.leadCucBo(idMoi));
    check('ghi chu vua go van con trong app', coGhiChu(app.leadCucBo('LA'), 'Khach hen thu 5'));

    app.goGhiChu('LA', 'Ghi chu lan 2');
    await app.troiQua(1000);
    check('lan luu tiep theo cung khong xoa lead Claude tao', !!leadMayChu(idMoi));
  }

  console.log('\n>> (a) Dang mo drawer, Claude sua lead KHAC, roi go ghi chu trong app');
  {
    napMayChu();
    const app = moApp();
    await app.khoiDong();
    app.ui.drawerMo = true;

    const r1 = await callTool('update_lead', { lead: 'LB', revenueExpected: 99000000, markPotential: true });
    const r2 = await callTool('add_note', { lead: 'LB', text: 'Claude ghi: khach chot thang 10' });
    check('tool Claude chay duoc', !r1.isError && !r2.isError, r1.error + r2.error);

    app.goGhiChu('LA', 'Sua trong app');
    await app.troiQua(1000);

    const lb = leadMayChu('LB');
    check('doanh thu Claude sua van con', lb?.revenueExpected === 99000000, String(lb?.revenueExpected));
    check('nhan Tiem nang Claude gan van con', (lb?.tags || []).includes('Tiềm năng'), JSON.stringify(lb?.tags));
    check('ghi chu Claude them van con', coGhiChu(lb, 'Claude ghi: khach chot thang 10'));
    check('ghi chu go trong app da len may chu', coGhiChu(leadMayChu('LA'), 'Sua trong app'));
    const ghi = [...(lichSuGhi.at(-1) || [])].sort();
    check('lan luu CHI ghi lead nguoi dung sua', JSON.stringify(ghi) === '["leads/LA","updatedAt"]', JSON.stringify(ghi));

    app.ui.drawerMo = false;
    await app.troiQua(2000);
    check('dong drawer xong app hien doanh thu Claude sua', app.leadCucBo('LB')?.revenueExpected === 99000000,
      String(app.leadCucBo('LB')?.revenueExpected));
  }

  console.log('\n>> (a2) Khong mo drawer: vua sua trong app, Claude ghi chen vao truoc moc luu 0,7s');
  {
    napMayChu();
    const app = moApp();
    await app.khoiDong();

    app.goGhiChu('LA', 'Go nhanh');
    await callTool('update_lead', { lead: 'LB', revenueExpected: 77000000 });
    await app.troiQua(1000);

    check('doanh thu Claude sua van con', leadMayChu('LB')?.revenueExpected === 77000000,
      String(leadMayChu('LB')?.revenueExpected));
    check('ghi chu go trong app da len may chu', coGhiChu(leadMayChu('LA'), 'Go nhanh'));
    await app.troiQua(2000);
    check('app hien doanh thu Claude sua', app.leadCucBo('LB')?.revenueExpected === 77000000,
      String(app.leadCucBo('LB')?.revenueExpected));
  }

  console.log('\n>> (c) Luu bi tu choi, Claude ghi luc app ranh: sua do dang trong app khong mat');
  {
    napMayChu();
    const app = moApp();
    await app.khoiDong();

    tuChoiLanGhiToi = true;
    app.goGhiChu('LA', 'Chua luu duoc');
    await app.troiQua(1000);
    check('app bao loi luu', app.ui.trangThai === 'error', app.ui.trangThai);

    await callTool('update_lead', { lead: 'LB', revenueExpected: 66000000 });
    check('app nhan ngay thay doi cua Claude o LB', app.leadCucBo('LB')?.revenueExpected === 66000000,
      String(app.leadCucBo('LB')?.revenueExpected));
    check('ghi chu chua luu duoc o LA van con trong app', coGhiChu(app.leadCucBo('LA'), 'Chua luu duoc'));

    app.goGhiChu('LA', 'Thu lai');
    await app.troiQua(1000);
    const la = leadMayChu('LA');
    check('lan luu sau dua ca hai ghi chu LA len', coGhiChu(la, 'Chua luu duoc') && coGhiChu(la, 'Thu lai'));
    check('LB van giu doanh thu Claude sua', leadMayChu('LB')?.revenueExpected === 66000000,
      String(leadMayChu('LB')?.revenueExpected));
  }

  console.log('\n>> (d) Lead cu chua co chu: app van ghi ownerUid, khong de thay doi cua Claude');
  {
    napMayChu();
    delete mayChu[ROOT].leads.LB.ownerUid;
    const app = moApp();
    await app.khoiDong();      // migrateLead gắn ownerUid -> hẹn lưu
    await callTool('update_lead', { lead: 'LB', revenueExpected: 55000000 });   // chen vào trước mốc 0,7s
    await app.troiQua(1000);

    check('ownerUid da ghi xuong LB', leadMayChu('LB')?.ownerUid === 'UID_VO', String(leadMayChu('LB')?.ownerUid));
    check('doanh thu Claude sua o LB khong bi de', leadMayChu('LB')?.revenueExpected === 55000000,
      String(leadMayChu('LB')?.revenueExpected));
    check('app khong bao loi', app.ui.trangThai === 'saved', app.ui.trangThai);
  }

  console.log('\n>> (e) Xoa lead + sua ke hoach trong app trong luc Claude tao lead');
  {
    napMayChu();
    const app = moApp();
    await app.khoiDong();
    app.ui.drawerMo = true;

    await callTool('create_lead', { name: 'Lead Moi 2' });
    // Giống deleteCurrentLead() + updatePlan()
    app.chay(`leads = leads.filter(l => l.id !== 'LA'); planRevenue = 123000000; scheduleSave();`);
    await app.troiQua(1000);

    check('lead xoa trong app da bi xoa tren may chu', !leadMayChu('LA'));
    check('lead Claude tao van con', !!timTheoTen('Lead Moi 2'));
    check('LB khong bi dung toi', leadMayChu('LB')?.revenueExpected === 30000000);
    check('ke hoach doanh thu da luu', docTai([ROOT, 'planRevenue']) === 123000000, String(docTai([ROOT, 'planRevenue'])));

    app.ui.drawerMo = false;
    await app.troiQua(2000);
    check('app khong hien lai lead da xoa', !app.leadCucBo('LA'));
    check('app giu ke hoach vua sua', app.chay('planRevenue') === 123000000);
  }
} catch (e: any) {
  fail++;
  console.log('\nNGOAI LE: ' + e.message + '\n' + e.stack);
}

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exit(1);
