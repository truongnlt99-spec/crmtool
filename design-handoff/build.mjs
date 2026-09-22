/**
 * Dựng bộ bàn giao thiết kế (design handoff) từ code thật hiện tại:
 *   dist/crm-demo.html          — CRM chạy offline với dữ liệu giả (không Firebase, không đăng nhập)
 *   dist/trang-chia-se-demo.html — trang chỉ xem cho sếp, dữ liệu sinh bằng chính server thật
 *   dist/zalo-thanh-ben/         — thanh bên extension Zalo, giả lập chrome.*
 *   dist/anh-chup/               — ảnh chụp mọi màn hình (sáng/tối, máy tính/điện thoại)
 *
 * Chạy: node design-handoff/build.mjs   (cần Google Chrome cài ở đường dẫn mặc định)
 * Không đọc/ghi Firebase thật: mọi truy cập DB đều bị chặn và trả dữ liệu giả.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(HERE, 'dist');
const SHOTS = path.join(DIST, 'anh-chup');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
const DATA_SRC = fs.readFileSync(path.join(HERE, 'du-lieu-gia.js'), 'utf8');
const taoDuLieuGia = new Function(DATA_SRC + '\nreturn taoDuLieuGia;')();
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');   // an toàn khi nhúng vào <script>

function thay(s, cu, moi, ten) {
  const n = s.split(cu).length - 1;
  if (n !== 1) throw new Error(`[${ten}] mốc xuất hiện ${n} lần: ${cu.slice(0, 60)}`);
  return s.replace(cu, () => moi);
}

// Xoá NỘI DUNG dist (không xoá chính thư mục: có thể đang bị terminal/server khác giữ)
fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

/* ============ 1. zalo-map.js dạng script thường (bỏ export) ============ */
const zaloMapSrc = read('extension/lib/zalo-map.js');
const zaloNames = [...zaloMapSrc.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1]);
// Bọc trong hàm tự gọi: nhúng thẳng thì hằng STAGES… trùng tên với biến toàn cục của app
const zaloMapInline = `(function(){\n${zaloMapSrc.replace(/^export /gm, '')}\nwindow.ZaloMap = { ${zaloNames.join(', ')} };\n})();\n`;

/* ============ 2. crm-demo.html ============ */
const MOCK_FIREBASE = `<script type="module">
// ===== BẢN DEMO GIAO DIỆN: không kết nối Firebase, dữ liệu giả sinh lúc mở trang =====
${DATA_SRC}
const P = new URLSearchParams(location.search);
const tree = taoDuLieuGia(new Date());
const USER = { uid: 'demo', email: 'huyentran@hayday.vn' };
const parts = (p) => String(p || '').split('/').filter(Boolean);
const read = (p) => parts(p).reduce((n, k) => (n == null ? undefined : n[k]), tree);
function write(p, v) {
  const ks = parts(p); let n = tree;
  for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
  const last = ks[ks.length - 1];
  if (v === null) delete n[last]; else n[last] = JSON.parse(JSON.stringify(v));
}
const cut = (v, limit) => {
  if (!limit || !v || typeof v !== 'object') return v;
  const ks = Object.keys(v).sort();
  return Object.fromEntries(ks.slice(-limit).map((k) => [k, v[k]]));
};
const snap = (v) => ({ exists: () => v !== undefined && v !== null, val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) });
const nghe = [];
const bao = () => nghe.forEach((l) => l.cb(snap(cut(read(l.path), l.limit))));
window.__firebase = {
  db: {}, auth: { currentUser: USER }, persistenceOk: true,
  userDataRef: () => ({ path: 'crmData' }),
  refAt: (p) => ({ path: p }),
  appConfigBase: () => 'appConfig', shareLogBase: () => 'shareLog', currentUid: () => USER.uid, zaloBase: () => 'zalo',
  query: (r, c) => ({ path: r.path, limit: c && c.limit }),
  limitToLast: (n) => ({ limit: n }),
  get: async (r) => snap(read(r.path)),
  set: async (r, v) => { write(r.path, v); bao(); },
  update: async (r, vals) => { for (const [k, v] of Object.entries(vals)) write(r.path + '/' + k, v); bao(); },
  onValue: (r, cb) => {
    const l = { path: r.path, limit: r.limit, cb }; nghe.push(l);
    setTimeout(() => cb(snap(cut(read(r.path), r.limit))), 0);
    return () => { const i = nghe.indexOf(l); if (i >= 0) nghe.splice(i, 1); };
  },
  logLogin: async () => {}, signIn: async () => {}, signOut: async () => { location.search = '?lock=1'; },
};
const khoa = !!P.get('lock');
window.__authUser = khoa ? null : USER;
window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: khoa ? null : USER } }));
// Mở đúng màn hình theo tham số: ?view=dashboard|conversations  &conv=c01  &lead=L01  &add=1
setTimeout(() => {
  if (khoa) return;
  if (P.get('view')) setView(P.get('view'));
  if (P.get('conv')) openConversation(P.get('conv'));
  if (P.get('lead')) openLead(P.get('lead'));
  if (P.get('add')) openAddLead();
}, 500);
</script>`;

const THEME_PRESET = `<script>
// Demo: ?theme=sang|toi ép giao diện (chạy trước đoạn chọn giao diện của app)
(function(){ var t = new URLSearchParams(location.search).get('theme');
  if (t) try { localStorage.setItem('cheDoGiaoDien', t === 'toi' ? 'toi' : 'sang'); } catch(e){} })();
</script>
`;

let crm = read('index.html');
const iMod1 = crm.indexOf('<script type="module">');
const jMod1 = crm.indexOf('</script>', iMod1) + '</script>'.length;
if (!crm.slice(iMod1, jMod1).includes('firebase-app.js')) throw new Error('Không thấy khối module Firebase');
crm = crm.slice(0, iMod1) + MOCK_FIREBASE + crm.slice(jMod1);
const iMod2 = crm.indexOf('<script type="module">', crm.indexOf(MOCK_FIREBASE) + MOCK_FIREBASE.length);
const jMod2 = crm.indexOf('</script>', iMod2) + '</script>'.length;
if (!crm.slice(iMod2, jMod2).includes('import * as ZaloMap')) throw new Error('Không thấy khối nạp ZaloMap');
crm = crm.slice(0, iMod2) + `<script>\n${zaloMapInline}</script>` + crm.slice(jMod2);
crm = thay(crm, '<script>\n/* Chạy NGAY trong <head>', THEME_PRESET + '<script>\n/* Chạy NGAY trong <head>', 'theme');
crm = thay(crm, '<title>CRM của Huyền Trân</title>', '<title>CRM của Huyền Trân (bản demo giao diện)</title>', 'title');
fs.writeFileSync(path.join(DIST, 'crm-demo.html'), crm);
console.log('✓ crm-demo.html');

/* ============ 3. trang-chia-se-demo.html (dữ liệu sinh bằng server thật) ============ */
delete process.env.FIREBASE_SERVICE_ACCOUNT;          // không bao giờ chạm Firebase thật
process.env.FIREBASE_DATA_ROOT = 'crmData';
const tree = taoDuLieuGia(new Date());
tree.appConfig.share = {
  token: 'demo', salt: 's', passHash: createHash('sha256').update('s:demo').digest('hex'),
  enabled: true, createdAt: new Date().toISOString(), failCount: 0, lockedUntil: 0,
};
const DB_URL = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const tach = (p) => p.split('/').filter(Boolean);
const doc = (ps) => ps.reduce((n, k) => (n == null ? undefined : n[k]), tree);
function ghi(ps, v) {
  let n = tree; for (const k of ps.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
  if (v === null) delete n[ps[ps.length - 1]]; else n[ps[ps.length - 1]] = v;
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== DB_URL) throw new Error('build.mjs chặn truy cập mạng: ' + url.href);
  const ps = tach(decodeURIComponent(url.pathname).replace(/\.json$/, ''));
  const m = String(init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  if (m === 'PATCH') for (const [k, v] of Object.entries(body || {})) ghi([...ps, ...tach(k)], v);
  else if (m === 'PUT') ghi(ps, body);
  return new Response(JSON.stringify(m === 'GET' ? doc(ps) ?? null : body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const handler = (await import(pathToFileURL(path.join(ROOT, 'api/mcp.ts')).href)).default;
const goiShare = async (b) => (await handler.fetch(new Request('http://x/api/mcp?mode=share', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': 'build-demo' }, body: JSON.stringify(b),
}))).json();
const MAIN = await goiShare({ token: 'demo', passcode: 'demo' });
if (!MAIN.ok) throw new Error('Server không trả dữ liệu chia sẻ: ' + JSON.stringify(MAIN).slice(0, 200));
const CHAT = {};
for (const l of MAIN.leads.filter((x) => x.coHoiThoaiZalo)) {
  CHAT[l.id] = await goiShare({ token: 'demo', session: MAIN.session, loai: 'chat', leadId: l.id });
}
const XEM_STUB = `<script>
// ===== BẢN DEMO: trả dữ liệu mẫu thay cho /api/share. Mật khẩu nhập gì cũng được. =====
(function(){
  var p = new URLSearchParams(location.search);
  if (!p.get('t')) { p.set('t', 'demo'); history.replaceState(null, '', location.pathname + '?' + p.toString()); }
  var MAIN = ${json(MAIN)}, CHAT = ${json(CHAT)};
  var goc = window.fetch;
  window.fetch = function(url, init){
    if (String(url).indexOf('/api/share') >= 0) {
      var b = {}; try { b = JSON.parse((init && init.body) || '{}'); } catch(e){}
      var data = b.loai === 'chat' ? (CHAT[b.leadId] || { ok: true, hoiThoai: [] }) : MAIN;
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return goc.apply(this, arguments);
  };
  // ?auto=1 tự mở báo cáo; &lead=L01 mở luôn chi tiết deal
  if (p.get('auto')) window.addEventListener('load', function(){
    setTimeout(function(){
      var i = document.getElementById('pass'), b = document.getElementById('btn');
      if (i && b) { i.value = 'demo'; b.click(); }
      if (p.get('lead')) setTimeout(function(){ window.XEM && XEM.moLead(p.get('lead')); }, 600);
    }, 200);
  });
})();
</script>
`;
let xem = read('xem.html');
xem = thay(xem, '<head>', '<head>\n' + XEM_STUB, 'xem-head');
fs.writeFileSync(path.join(DIST, 'trang-chia-se-demo.html'), xem);
console.log('✓ trang-chia-se-demo.html');

/* ============ 4. zalo-thanh-ben/ (thanh bên extension) ============ */
const TB = path.join(DIST, 'zalo-thanh-ben');
fs.mkdirSync(path.join(TB, 'lib'), { recursive: true });
for (const f of ['sidepanel.css', 'sidepanel.js', 'lib/zalo-map.js', 'lib/config.js']) {
  fs.writeFileSync(path.join(TB, f), read('extension/' + f));
}
const CHROME_STUB = `<script>
// ===== BẢN DEMO: giả lập chrome.* để xem giao diện thanh bên ngoài extension =====
// ?state=login | none | unlinked | create | attach | linked | ignored
${DATA_SRC}
(function(){
  var S = new URLSearchParams(location.search).get('state') || 'linked';
  var D = taoDuLieuGia(new Date());
  var leads = Object.keys(D.crmData.leads).map(function(k){ return D.crmData.leads[k]; });
  var links = Object.assign({}, D.zalo.links);
  var conv = (S === 'login' || S === 'none') ? null
    : S === 'linked' ? { convId: 'c01', name: 'Lan Nguyễn', isGroup: false }
    : { convId: 'c77', name: 'Ngọc Hân', isGroup: false };
  if (S === 'ignored') links.c77 = { status: 'ignored', leadId: null, name: 'Ngọc Hân', isGroup: false };
  function tl(m){
    switch (m.type) {
      case 'whoami': return { ok: true, user: S === 'login' ? null : { uid: 'demo', email: 'huyentran@hayday.vn' } };
      case 'loadLeads': return { ok: true, leads: leads };
      case 'getLead': return { ok: true, lead: D.crmData.leads[m.leadId], metas: [D.zalo.meta.c01, D.zalo.meta.g01] };
      default: return { ok: true, lead: D.crmData.leads.L01 };
    }
  }
  window.chrome = {
    runtime: { sendMessage: function(m){ return Promise.resolve(tl(m)); } },
    storage: {
      session: { get: function(){ return Promise.resolve({ activeConv: conv, status: { lastSyncAt: Date.now() - 60000 } }); } },
      local: { get: function(){ return Promise.resolve({ links: links }); } },
      onChanged: { addListener: function(){} },
    },
  };
  if (S === 'create' || S === 'attach') window.addEventListener('load', function(){
    setTimeout(function(){ var b = document.querySelector('[data-act="' + S + '"]'); if (b) b.click(); }, 300);
  });
})();
</script>
`;
let tb = read('extension/sidepanel.html');
tb = thay(tb, '<script type="module" src="sidepanel.js"></script>', CHROME_STUB + '<script type="module" src="sidepanel.js"></script>', 'sidepanel');
fs.writeFileSync(path.join(TB, 'index.html'), tb);
console.log('✓ zalo-thanh-ben/');

/* ============ 5. Chụp màn hình bằng Chrome chạy ngầm ============ */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const MAY = { w: 1440, h: 900, s: 1 }, DT = { w: 390, h: 844, s: 2 }, TBEN = { w: 380, h: 780, s: 2 };
const shots = [];
for (const [theme, ten] of [['sang', 'sang'], ['toi', 'toi']]) {
  const q = (x) => `crm-demo.html?theme=${theme}${x}`;
  shots.push(
    [`crm/may-tinh/${ten}/01-dang-nhap.png`, q('&lock=1'), MAY],
    [`crm/may-tinh/${ten}/02-pipeline.png`, q(''), MAY],
    [`crm/may-tinh/${ten}/03-dashboard.png`, q('&view=dashboard'), { ...MAY, h: 2000 }],
    [`crm/may-tinh/${ten}/04-hoi-thoai.png`, q('&view=conversations&conv=c01'), MAY],
    [`crm/may-tinh/${ten}/05-chi-tiet-lead.png`, q('&lead=L01'), { ...MAY, h: 1500 }],
    [`crm/may-tinh/${ten}/06-them-lead.png`, q('&add=1'), MAY],
    [`crm/dien-thoai/${ten}/01-dang-nhap.png`, q('&lock=1'), DT],
    [`crm/dien-thoai/${ten}/02-pipeline.png`, q(''), DT],
    [`crm/dien-thoai/${ten}/03-dashboard.png`, q('&view=dashboard'), { ...DT, h: 2400 }],
    [`crm/dien-thoai/${ten}/04-hoi-thoai-danh-sach.png`, q('&view=conversations'), DT],
    [`crm/dien-thoai/${ten}/05-hoi-thoai-chat.png`, q('&view=conversations&conv=c01'), DT],
    [`crm/dien-thoai/${ten}/06-chi-tiet-lead.png`, q('&lead=L01'), { ...DT, h: 2400 }],
  );
  const dark = theme === 'toi';
  shots.push(
    [`trang-chia-se/${ten}/01-nhap-mat-khau.png`, 'trang-chia-se-demo.html', MAY, dark],
    [`trang-chia-se/${ten}/02-bao-cao.png`, 'trang-chia-se-demo.html?auto=1', { ...MAY, h: 2200 }, dark],
    [`trang-chia-se/${ten}/03-chi-tiet-deal.png`, 'trang-chia-se-demo.html?auto=1&lead=L01', { ...MAY, h: 1400 }, dark],
    [`trang-chia-se/${ten}/04-bao-cao-dien-thoai.png`, 'trang-chia-se-demo.html?auto=1', { ...DT, h: 2400 }, dark],
  );
  for (const st of ['login', 'none', 'unlinked', 'create', 'attach', 'linked', 'ignored']) {
    shots.push([`zalo-thanh-ben/${ten}/${st}.png`, `zalo-thanh-ben/index.html?state=${st}`, TBEN, dark]);
  }
}

// Chụp qua DevTools Protocol: giả lập đúng khổ màn hình (Chrome trên Windows không cho cửa sổ
// hẹp hơn ~500px nên --window-size không dùng được cho khổ điện thoại 390px).
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hayday-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
]);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const hetGio = setTimeout(() => reject(new Error('Chrome không mở cổng DevTools')), 30000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(hetGio); resolve(m[1]); }
  });
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const cho = new Map(), suKien = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && cho.has(msg.id)) { const { resolve, reject } = cho.get(msg.id); cho.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  else if (msg.method) suKien.forEach((f) => f(msg));
});
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq; cho.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
await cdp('Page.enable', {}, sessionId);
const choTai = () => new Promise((resolve) => {
  const f = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { suKien.splice(suKien.indexOf(f), 1); resolve(); } };
  suKien.push(f);
  setTimeout(resolve, 15000);
});
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

let loi = 0;
for (const [file, url, vp, dark] of shots) {
  const out = path.join(SHOTS, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    await cdp('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.s, mobile: vp.w < 500 }, sessionId);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, sessionId);
    const tai = choTai();
    await cdp('Page.navigate', { url: `${BASE}/${url}` }, sessionId);
    await tai;
    await ngu(2500);   // chờ app vẽ xong + các bước tự mở màn hình (setTimeout trong bản demo)
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
  } catch (e) {
    loi++; console.log('✗', file, e.message);
  }
}
ws.close();
chrome.kill();
server.close();
await ngu(500);
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
console.log(`✓ ảnh chụp: ${shots.length - loi}/${shots.length}`);

/* ============ 6. BRIEF ============ */
fs.copyFileSync(path.join(HERE, 'BRIEF.md'), path.join(DIST, 'BRIEF.md'));
console.log('✓ BRIEF.md');
if (loi) process.exitCode = 1;
