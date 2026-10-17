// Kiem tra cu phap moi khoi <script> noi tuyen (khong src) trong index.html bang `node --check`.
// Khong cham mang, khong cham Firebase.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-tinh-'));
const loi: string[] = [];
let soKhoi = 0;
try {
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    i++;
    if (/\bsrc\s*=/.test(attrs)) continue;
    const loai = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (loai && loai !== 'module' && loai !== 'text/javascript') continue; // json, importmap...
    const isModule = loai === 'module';
    const file = path.join(tmp, `khoi-${i}${isModule ? '.mjs' : '.js'}`);
    fs.writeFileSync(file, m[2]);
    soKhoi++;
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) loi.push(`Khoi script #${i} (${isModule ? 'module' : 'co dien'}): ${(r.stderr || '').trim()}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (!soKhoi) { console.error('Khong tim thay khoi <script> noi tuyen nao'); process.exit(1); }
if (loi.length) { console.error(loi.join('\n\n')); console.error(`\nFAIL: ${loi.length}/${soKhoi} khoi loi cu phap`); process.exit(1); }
console.log(`OK: ${soKhoi} khoi <script> noi tuyen trong index.html deu hop le cu phap`);
