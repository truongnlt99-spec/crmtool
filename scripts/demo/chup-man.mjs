// Chụp mọi màn của app (bản demo dữ liệu giả) ở đúng kích thước máy tính và điện thoại,
// rồi dựng một trang xem tất cả: ban-phat-hanh/anh-giao-dien/index.html (thư mục này không commit).
// Cần server demo đang chạy: node scripts/demo/server.mjs   rồi: node scripts/demo/chup-man.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RA = path.join(GOC, 'ban-phat-hanh', 'anh-giao-dien');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEMO = process.env.DEMO_URL || 'http://localhost:5182/';
const MAY = { w: 1440, h: 900, s: 1 }, DT = { w: 390, h: 844, s: 2, mobile: true };

// [nhóm, tên file, tiêu đề, tham số, kích thước]
const MAN = [
  ['Máy tính · sáng', 'hom-nay', 'Hôm nay', '?theme=sang', MAY],
  ['Máy tính · sáng', 'lead-bang', 'Lead · Bảng', '?theme=sang&view=pipeline', MAY],
  ['Máy tính · sáng', 'lead-danh-sach', 'Lead · Danh sách', '?theme=sang&view=list', MAY],
  ['Máy tính · sáng', 'chi-tiet-dong-thoi-gian', 'Chi tiết lead · Dòng thời gian', '?theme=sang&lead=L01', MAY],
  ['Máy tính · sáng', 'chi-tiet-zalo', 'Chi tiết lead · Hội thoại Zalo', '?theme=sang&lead=L01&tab=hoithoai', MAY],
  ['Máy tính · sáng', 'chi-tiet-ho-so', 'Chi tiết lead · Hồ sơ AI', '?theme=sang&lead=L01&tab=hoso', MAY],
  ['Máy tính · sáng', 'chi-tiet-bao-gia', 'Chi tiết lead · Báo giá & sản phẩm', '?theme=sang&lead=L01&tab=baogia', MAY],
  ['Máy tính · sáng', 'chi-tiet-won', 'Chi tiết lead đã Won', '?theme=sang&lead=L09', MAY],
  ['Máy tính · sáng', 'hoi-thoai', 'Hội thoại', '?theme=sang&view=conversations&conv=c01', MAY],
  ['Máy tính · sáng', 'bao-cao', 'Báo cáo', '?theme=sang&view=dashboard', { ...MAY, h: 1500 }],
  ['Máy tính · sáng', 'venue', 'Venue · thẻ', '?theme=sang&view=venue', MAY],
  ['Máy tính · sáng', 'venue-san-pham', 'Venue · Sản phẩm', '?theme=sang&view=venue&vtab=sp', MAY],
  ['Máy tính · sáng', 'venue-thong-ke', 'Venue · Thống kê link', '?theme=sang&view=venue&vtab=thongke', MAY],
  ['Máy tính · sáng', 'them-lead', 'Thêm lead', '?theme=sang&add=1', MAY],
  ['Máy tính · sáng', 'nhac-nho', 'Nhắc nhở 7 ngày', '?theme=sang&nhacnho=1', MAY],
  ['Máy tính · sáng', 'de-xuat', 'Đề xuất chờ duyệt', '?theme=sang&dexuat=1', MAY],
  ['Máy tính · sáng', 'dang-nhap', 'Đăng nhập', '?theme=sang&lock=1', MAY],
  ['Máy tính · tối', 'toi-hom-nay', 'Hôm nay (tối)', '?theme=toi', MAY],
  ['Máy tính · tối', 'toi-lead-bang', 'Lead · Bảng (tối)', '?theme=toi&view=pipeline', MAY],
  ['Máy tính · tối', 'toi-chi-tiet', 'Chi tiết lead (tối)', '?theme=toi&lead=L01', MAY],
  ['Máy tính · tối', 'toi-hoi-thoai', 'Hội thoại (tối)', '?theme=toi&view=conversations&conv=c01', MAY],
  ['Máy tính · tối', 'toi-bao-cao', 'Báo cáo (tối)', '?theme=toi&view=dashboard', MAY],
  ['Điện thoại', 'dt-hom-nay', 'Hôm nay', '?theme=sang', DT],
  ['Điện thoại', 'dt-lead', 'Lead', '?theme=sang&view=pipeline', DT],
  ['Điện thoại', 'dt-chi-tiet', 'Chi tiết lead', '?theme=sang&lead=L01', DT],
  ['Điện thoại', 'dt-hoi-thoai', 'Hội thoại', '?theme=sang&view=conversations&conv=c01', DT],
  ['Điện thoại', 'dt-bao-cao', 'Báo cáo', '?theme=sang&view=dashboard', DT],
  ['Điện thoại', 'dt-venue', 'Venue', '?theme=sang&view=venue', DT],
  ['Điện thoại', 'dt-toi-hom-nay', 'Hôm nay (tối)', '?theme=toi', DT],
];

fs.mkdirSync(RA, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chup-man-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank']);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('Chrome không mở cổng DevTools')), 30000);
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const cho = new Map();
ws.addEventListener('message', e => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && cho.has(msg.id)) { const { resolve, reject } = cho.get(msg.id); cho.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
});
const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; cho.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const ngu = ms => new Promise(r => setTimeout(r, ms));

try {
  for (const [, ten, , q, k] of MAN) {
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Emulation.setDeviceMetricsOverride', { width: k.w, height: k.h, deviceScaleFactor: k.s, mobile: !!k.mobile }, sessionId);
    if (k.mobile) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await cdp('Page.enable', {}, sessionId);
    await cdp('Page.navigate', { url: DEMO + q }, sessionId);
    await ngu(2600);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(path.join(RA, ten + '.png'), Buffer.from(data, 'base64'));
    await cdp('Target.closeTarget', { targetId });
    console.log('✓', ten);
  }
} finally {
  ws.close(); chrome.kill();
}

// Trang xem tất cả
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nhom = [...new Set(MAN.map(m => m[0]))];
const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CRM của Trân — tất cả màn (giao diện mới)</title>
<style>
*{box-sizing:border-box} body{margin:0; font-family:system-ui,'Segoe UI',sans-serif; background:#EFEBE4; color:#2A2622}
header{position:sticky; top:0; z-index:5; background:rgba(239,235,228,.95); backdrop-filter:blur(8px); border-bottom:1px solid #DDD5C8}
.in{max-width:1500px; margin:0 auto; padding:12px 24px; display:flex; gap:14px; align-items:center; flex-wrap:wrap}
header b{font-size:15px} header nav{display:flex; gap:4px; margin-left:auto; flex-wrap:wrap}
header a{color:#5C544C; text-decoration:none; font-size:13px; padding:5px 11px; border-radius:999px} header a:hover{background:#E2DBCF}
main{max-width:1500px; margin:0 auto; padding:20px 24px 60px}
h2{font-size:20px; margin:28px 0 12px; scroll-margin-top:64px}
.luoi{display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px}
.luoi.dt{grid-template-columns:repeat(auto-fill, minmax(230px, 1fr))}
figure{margin:0; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 10px 30px -18px rgba(0,0,0,.4)}
figure a{display:block} img{display:block; width:100%; height:auto}
figcaption{padding:9px 12px; font-size:13px; font-weight:600}
p.ghi{color:#5C544C; font-size:14px; margin:0}
@media (max-width:900px){ .luoi{grid-template-columns:1fr} }
</style></head><body>
<header><div class="in"><b>CRM của Trân · tất cả màn</b><span style="color:#958A7E; font-size:13px">kiểu trộn Notion + Editorial · dữ liệu giả</span>
<nav>${nhom.map((n, i) => `<a href="#n${i}">${esc(n)}</a>`).join('')}</nav></div></header>
<main><p class="ghi">Bấm vào ảnh để xem cỡ thật. Ảnh chụp từ app thật (PR #41) chạy với dữ liệu giả, không phải bản vẽ.</p>
${nhom.map((n, i) => `<h2 id="n${i}">${esc(n)}</h2><div class="luoi${n === 'Điện thoại' ? ' dt' : ''}">${MAN.filter(m => m[0] === n).map(m =>
  `<figure><a href="${m[1]}.png" target="_blank" rel="noopener"><img src="${m[1]}.png" alt="${esc(m[2])}" loading="lazy"></a><figcaption>${esc(m[2])}</figcaption></figure>`).join('')}</div>`).join('')}
</main></body></html>`;
fs.writeFileSync(path.join(RA, 'index.html'), html);
console.log('Trang xem:', path.join(RA, 'index.html'));
