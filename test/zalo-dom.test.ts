/**
 * Chạy test đọc DOM Zalo (test/zalo-dom.test.html) trong Chrome ngầm.
 * Phần này bắt buộc phải chạy trong trình duyệt thật vì dùng DOM + TreeWalker.
 * Không cần mạng, không chạm Firebase.
 *
 * Chạy: node test/zalo-dom.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  console.error('Khong tim thay Chrome: ' + CHROME + ' (dat bien CHROME_PATH neu cai cho khac)');
  process.exit(1);
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url || '/', 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const PORT = (server.address() as { port: number }).port;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-dom-test-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
]);
const wsUrl = await new Promise<string>((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('Chrome khong mo cong DevTools')), 30000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(t); resolve(m[1]); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r as any, { once: true }));
let seq = 0;
const cho = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
ws.addEventListener('message', (e: MessageEvent) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && cho.has(msg.id)) {
    const { resolve, reject } = cho.get(msg.id)!;
    cho.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const cdp = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
  const id = ++seq; cho.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

let pass = 0, fail = 0;
try {
  const { targetId } = await cdp('Target.createTarget', { url: `http://127.0.0.1:${PORT}/test/zalo-dom.test.html` });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);

  // Chờ fixture chạy xong (module load + dựng DOM)
  let ket: any[] | null = null;
  for (let i = 0; i < 40 && !ket; i++) {
    const r = await cdp('Runtime.evaluate', { expression: 'JSON.stringify(window.__ketQua || null)', returnByValue: true }, sessionId);
    const v = r.result?.value;
    if (v && v !== 'null') ket = JSON.parse(v);
    else await new Promise((s) => setTimeout(s, 250));
  }
  if (!ket) throw new Error('Trang test khong tra ve ket qua (loi nap module?)');

  for (const k of ket) {
    if (k.ok) { pass++; console.log(`  OK   ${k.ten}`); }
    else { fail++; console.log(`  FAIL ${k.ten} -> ${k.chiTiet}`); }
  }
} catch (e: any) {
  fail++; console.log('\nNGOAI LE: ' + e.message);
} finally {
  ws.close();
  chrome.kill();
  server.close();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
  if (fail) process.exitCode = 1;
}
