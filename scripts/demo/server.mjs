// Server xem giao diện với DỮ LIỆU GIẢ: phục vụ index.html thật nhưng thay khối module Firebase
// bằng bản giả lập trong bộ nhớ (scripts/demo/du-lieu-gia.js). Không đăng nhập, không chạm Firebase.
// Chạy: node scripts/demo/server.mjs  ->  http://localhost:5182  (?view=dashboard, &lead=L01, &conv=c01, &theme=toi, ?lock=1)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT) || 5182;
const LOAI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function mock() {
  const duLieu = fs.readFileSync(path.join(GOC, 'scripts/demo/du-lieu-gia.js'), 'utf8');
  return `<script type="module">
import * as PhanQuyen from './web/phan-quyen.js';
window.PhanQuyen = PhanQuyen;
${duLieu}
const P = new URLSearchParams(location.search);
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
const g = taoDuLieuGia(new Date());
// Cây giống Firebase thật: kho chủ cũ dùng các nhánh gốc
const tree = { crmData: g.crmData, zalo: g.zalo, aiData: g.aiData || {}, appConfig: {}, taiKhoan: {}, quyenXem: {} };
const USER = { uid: OWNER, email: 'huyentran@hayday.vn' };
const parts = p => String(p || '').split('/').filter(Boolean);
const read = p => parts(p).reduce((n, k) => (n == null ? undefined : n[k]), tree);
function write(p, v) {
  const ks = parts(p); let n = tree;
  for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
  const last = ks[ks.length - 1];
  if (v === null) delete n[last]; else n[last] = JSON.parse(JSON.stringify(v));
}
function locQuery(r, v) {
  if (!v || typeof v !== 'object') return v;
  let ks = Object.keys(v).sort();
  if (r.orderBy && 'eq' in r) ks = ks.filter(k => v[k] && v[k][r.orderBy] === r.eq);
  if (r.limit) ks = ks.slice(-r.limit);
  return Object.fromEntries(ks.map(k => [k, v[k]]));
}
const snap = v => ({ exists: () => v !== undefined && v !== null, val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) });
const nghe = [];
const bao = () => nghe.forEach(l => l.cb(snap(locQuery(l.r, read(l.r.path)))));
const inc = v => (v && typeof v === 'object' && v['.sv']) ? null : v;
window.__demo = { tree };
window.__firebase = {
  db: {}, auth: { currentUser: USER }, persistenceOk: true, logLogin: async () => {},
  userDataRef: () => ({ path: 'crmData' }),
  refAt: p => ({ path: p }),
  appConfigBase: () => 'appConfig', currentUid: () => OWNER, zaloBase: () => 'zalo', aiBase: () => 'aiData',
  ownerUid: OWNER, khoUid: () => OWNER, kho: () => null, dsKho: () => [], chuyenKho: () => location.reload(), datKhoDangXem: () => {},
  query: (r, ...c) => Object.assign({ path: r.path }, ...c),
  limitToLast: n => ({ limit: n }), orderByChild: k => ({ orderBy: k }), equalTo: v => ({ eq: v }),
  get: async r => snap(locQuery(r, read(r.path))),
  set: async (r, v) => { write(r.path, v); bao(); },
  update: async (r, vals) => { for (const [k, v] of Object.entries(vals)) write(r.path + '/' + k, inc(v)); bao(); },
  onValue: (r, cb) => {
    const l = { r, cb }; nghe.push(l);
    setTimeout(() => cb(snap(locQuery(r, read(r.path)))), 0);
    return () => { const i = nghe.indexOf(l); if (i >= 0) nghe.splice(i, 1); };
  },
  signIn: async () => {}, signOut: async () => { location.search = '?lock=1'; },
};
const khoa = !!P.get('lock');
window.__authUser = khoa ? null : USER;
window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: khoa ? null : USER } }));
setTimeout(() => {
  if (khoa) return;
  if (P.get('view') && window.setView) setView(P.get('view'));
  if (P.get('conv') && window.openConversation) openConversation(P.get('conv'));
  if (P.get('lead') && window.openLead) openLead(P.get('lead'));
  if (P.get('add') && window.openAddLead) openAddLead();
}, 600);
</script>
<script>
(function(){ var t = new URLSearchParams(location.search).get('theme');
  if (t) try { localStorage.setItem('cheDoGiaoDien', t === 'toi' ? 'toi' : 'sang'); } catch(e){} })();
</script>`;
}

function trangDemo() {
  let s = fs.readFileSync(path.join(GOC, 'index.html'), 'utf8');
  const i = s.indexOf('<script type="module">');
  const j = s.indexOf('</script>', i) + '</script>'.length;
  if (!s.slice(i, j).includes('firebase-app.js')) throw new Error('Không thấy khối module Firebase');
  return s.slice(0, i) + mock() + s.slice(j);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': LOAI['.html'], 'Cache-Control': 'no-store' });
      return res.end(trangDemo());
    }
    const file = path.resolve(GOC, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(GOC + path.sep) || path.relative(GOC, file).split(path.sep).some(s => s.startsWith('.'))
      || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Khong co'); }
    res.writeHead(200, { 'Content-Type': LOAI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, '127.0.0.1', () => console.log('Demo giao dien: http://localhost:' + PORT));
