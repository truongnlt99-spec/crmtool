/**
 * Đóng gói Chrome extension thành file ZIP để gửi cho người dùng cài (unpacked).
 *
 *   npm run dong-goi
 *
 * Kết quả: ban-phat-hanh/HayDay-CRM-Zalo-v<phiên bản>.zip
 * Trong ZIP có sẵn thư mục HayDay-CRM-Zalo/ + HUONG-DAN-CAI-DAT.txt, giải nén ra là cài được ngay.
 *
 * KHÔNG ghi ra Desktop hay bất kỳ chỗ nào ngoài project.
 * Thư mục ban-phat-hanh/ nằm trong .gitignore (file ZIP không lên GitHub).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NGUON = path.join(ROOT, 'extension');
const DICH = path.join(ROOT, 'ban-phat-hanh');

const manifest = JSON.parse(fs.readFileSync(path.join(NGUON, 'manifest.json'), 'utf8'));
const ten = `HayDay-CRM-Zalo-v${manifest.version}.zip`;
const zip = path.join(DICH, ten);

fs.mkdirSync(DICH, { recursive: true });

// Dựng thư mục tạm có đúng cấu trúc muốn thấy sau khi giải nén
const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'hayday-dong-goi-'));
const stage = path.join(tam, 'HayDay-CRM-Zalo');
fs.cpSync(NGUON, stage, { recursive: true });

if (fs.existsSync(zip)) fs.rmSync(zip);
const ps = spawnSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  `Compress-Archive -Path '${stage.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`,
], { encoding: 'utf8' });
if (ps.status !== 0 || !fs.existsSync(zip)) {
  console.error('Không tạo được ZIP:', ps.stderr || ps.stdout);
  process.exit(1);
}
fs.rmSync(tam, { recursive: true, force: true });

// Bản cũ dồn vào ban-phat-hanh/cu/ cho gọn
const cu = path.join(DICH, 'cu');
fs.mkdirSync(cu, { recursive: true });
for (const f of fs.readdirSync(DICH)) {
  if (f.endsWith('.zip') && f !== ten) fs.renameSync(path.join(DICH, f), path.join(cu, f));
}

const kb = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`✓ ${path.relative(ROOT, zip)}  (${kb} KB, extension v${manifest.version})`);
console.log('  Gửi file này cho người dùng: giải nén rồi Load unpacked thư mục HayDay-CRM-Zalo.');
