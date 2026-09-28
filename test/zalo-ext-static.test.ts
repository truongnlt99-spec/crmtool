/**
 * Kiểm tra tĩnh các file của extension — bắt những lỗi mà test logic không thấy được,
 * ví dụ: dùng một module nhưng QUÊN dòng nạp nó (lỗi thật ngày 2026-09-28: thiếu
 * `const D = await import(... 'lib/dom-text.js')` -> domText ném lỗi với mọi tin).
 * Không cần mạng, không cần trình duyệt.
 *
 * Chạy: node test/zalo-ext-static.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const manifest = JSON.parse(doc('extension/manifest.json'));
const content = doc('extension/content.js');
const background = doc('extension/background.js');
const sidepanel = doc('extension/sidepanel.js');

console.log('\n>> Module nap dong trong content script');
const napDong = [...content.matchAll(/const (\w+) = await import\(chrome\.runtime\.getURL\('([^']+)'\)\)/g)]
  .map((m) => ({ ten: m[1], file: m[2] }));
check('co nap module', napDong.length > 0, String(napDong.length));

const war = (manifest.web_accessible_resources || []).flatMap((w: any) => w.resources || []);
for (const m of napDong) {
  check(`${m.file} co trong web_accessible_resources`, war.includes(m.file), JSON.stringify(war));
  check(`${m.file} ton tai tren dia`, fs.existsSync(path.join(ROOT, 'extension', m.file)));
}

// Mọi tiền tố kiểu `D.` / `M.` dùng trong content.js phải có dòng nạp tương ứng
console.log('\n>> Moi module duoc dung deu phai duoc nap');
const thanTiM = new Set(napDong.map((m) => m.ten));
const dungTien = new Set(
  [...content.matchAll(/\b([A-Z])\.[a-zA-Z]/g)].map((m) => m[1]).filter((x) => !['JSON', 'Object', 'Array', 'Math', 'Promise', 'Number', 'String', 'Date', 'Node', 'NodeFilter', 'IDBKeyRange'].includes(x))
);
for (const t of dungTien) check(`dung "${t}." thi phai co dong nap "${t}"`, thanTiM.has(t), 'da nap: ' + [...thanTiM].join(','));

console.log('\n>> Ham xuat ra tu module deu ton tai');
const domText = doc('extension/lib/dom-text.js');
const zaloMap = doc('extension/lib/zalo-map.js');
const xuat = (src: string) => new Set([...src.matchAll(/export (?:function|const|class) (\w+)/g)].map((m) => m[1]));
const xuatDom = xuat(domText), xuatMap = xuat(zaloMap);
for (const m of [...content.matchAll(/\bD\.(\w+)\(/g)]) check(`dom-text.js co ham ${m[1]}()`, xuatDom.has(m[1]), [...xuatDom].join(','));
for (const m of [...content.matchAll(/\bM\.(\w+)\(/g)]) check(`zalo-map.js co ham ${m[1]}()`, xuatMap.has(m[1]), [...xuatMap].join(','));
for (const m of [...background.matchAll(/^import \{([^}]+)\} from '\.\/lib\/zalo-map\.js'/gms)]) {
  for (const ten of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
    check(`background nhap ${ten} -> zalo-map.js co xuat`, xuatMap.has(ten), [...xuatMap].join(','));
  }
}

console.log('\n>> Phien ban va cac file bat buoc');
check('manifest co version', /^\d+\.\d+\.\d+$/.test(manifest.version), manifest.version);
for (const f of ['extension/background.js', 'extension/content.js', 'extension/sidepanel.html', 'extension/sidepanel.js', 'extension/sidepanel.css', 'extension/lib/config.js', 'extension/lib/fb.js']) {
  check(`${f} ton tai`, fs.existsSync(path.join(ROOT, f)));
}
check('sidepanel.js nap module bang duong dan tuong doi', /from '\.\/lib\//.test(sidepanel));

// Ký tự Unicode "không phải ký tự" từng làm Chrome từ chối cả extension (lỗi 2026-09-22)
console.log('\n>> Khong co ky tu la trong file JS');
for (const f of ['extension/content.js', 'extension/background.js', 'extension/sidepanel.js', 'extension/lib/dom-text.js', 'extension/lib/zalo-map.js', 'extension/lib/fb.js', 'extension/lib/config.js']) {
  const s = doc(f);
  let xau = 0;
  for (const ch of s) { const c = ch.codePointAt(0)!; if ((c & 0xFFFE) === 0xFFFE || (c >= 0xFDD0 && c <= 0xFDEF)) xau++; }
  check(`${f} sach ky tu la`, xau === 0, String(xau));
}

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exitCode = 1;
