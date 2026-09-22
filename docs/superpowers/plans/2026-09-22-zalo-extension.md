# Extension Zalo web → HayDay CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome extension (MV3, unpacked) chạy trên chat.zalo.me: thanh bên hiện lead của hội thoại đang mở (gắn lead / đổi giai đoạn / ghi chú), đồng bộ tin nhắn của hội thoại đã gắn lead vào Firebase; CRM hiện hội thoại + chip "khách chờ trả lời"; trang chia sẻ cho sếp xem được chat.

**Architecture:** `content.js` đọc siêu dữ liệu tin từ IndexedDB của Zalo web (mọi hội thoại đã gắn) và chữ từ DOM (hội thoại đang mở), nối nhau qua `cliMsgId`, gửi cho `background.js` (service worker) — nơi giữ token Firebase, hàng đợi ghi và gọi Firebase REST bằng multi-path PATCH. Thanh bên (`sidepanel.*`) chỉ nói chuyện với background. Dữ liệu nằm ở `zalo` / `zalo_users/<uid>` (ngoài `crmData`). Logic thuần nằm ở `extension/lib/zalo-map.js`, dùng chung cho extension, CRM (`<script type="module">`) và test Node.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension MV3 (`sidePanel`, `storage`, `alarms`), Firebase Realtime Database REST + Identity Toolkit REST, Firebase JS SDK 12.17.0 (đã có trong `index.html`), Node ≥ 22 chạy test `.ts` trực tiếp (máy hiện có Node 24).

**Spec:** `docs/superpowers/specs/2026-09-22-zalo-extension-design.md`

## Global Constraints

- Chủ cũ `OWNER_UID = '7ePgCPmzxHdEAEazHo9IkyKf2rw2'` → nhánh `crmData` / `zalo`; tài khoản khác → `crmData_users/<uid>` / `zalo_users/<uid>`. Hằng này sẽ có thêm chỗ thứ 4: `extension/lib/config.js` (ghi vào CLAUDE.md ở Task 8).
- Ghi Firebase luôn bằng PATCH (merge), không PUT đè nhánh có sẵn.
- Không tải code từ ngoài trong extension (MV3); không có inline script / inline event handler trong trang extension (CSP MV3).
- Không tự mở hội thoại Zalo; chỉ hội thoại `links/{convId}.status === 'lead'` được tải lên.
- Không lưu mật khẩu; chỉ lưu `refreshToken`, `idToken`, `uid`, `email` trong `chrome.storage.local`.
- Câu chữ activityLog khi đổi giai đoạn phải đúng dạng app: `Chuyển từ "<tên cũ>" sang "<tên mới>"`; nhãn thời gian đúng công thức `nowLabel()` của app.
- Commit message tiếng Việt **không dấu**, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Chỉ commit khi Trường đã đồng ý commit trên nhánh làm việc.
- Test chạy bằng `node test/<file>.test.ts`; test gọi Firebase thật dùng nhánh sandbox (`crmDataTest`, `zaloTest`) và dọn sạch sau khi chạy.

## Trước khi bắt đầu (việc của Trường)

1. **Merge nhánh sửa lỗi ghi đè** `claude/blissful-hamilton-e8de1e` (commit `f90d8e7`) vào `main` — nếu không, đổi giai đoạn/ghi chú/tạo lead từ thanh bên có thể bị app đang mở drawer ghi đè. Không chặn Task 1–3.
2. Sau Task 3: **dán `firebase-rules-deploy.json`** vào Firebase Console → Realtime Database → Rules → Publish.

## File Structure

| File | Trách nhiệm |
|---|---|
| `extension/lib/config.js` (tạo) | Hằng công khai: apiKey, dbUrl, OWNER_UID, CRM_URL |
| `extension/lib/zalo-map.js` (tạo) | Hàm thuần: đường dẫn theo tài khoản, ánh xạ bản ghi Zalo → tin chuẩn, patch Firebase, meta, chip, tạo lead, đổi giai đoạn, ghi chú, tìm lead, gộp lô |
| `extension/lib/fb.js` (tạo) | Client Firebase REST (đăng nhập, làm mới token, get, patch, phân loại lỗi) |
| `extension/manifest.json` (tạo) | Khai báo MV3 |
| `extension/background.js` (tạo) | Service worker: xác thực, cache `links`/`meta`, hàng đợi ghi, xử lý lệnh từ content/thanh bên |
| `extension/content.js` (tạo) | Đọc IndexedDB + DOM trên chat.zalo.me, báo hội thoại đang mở |
| `extension/sidepanel.html`, `.css`, `.js` (tạo) | Giao diện thanh bên |
| `test/zalo-map.test.ts`, `test/zalo-fb.test.ts` (tạo) | Test thuần, không mạng |
| `test/zalo-rtdb.test.ts` (tạo) | Test PATCH nhiều đường dẫn trên Firebase thật (sandbox) |
| `firebase-rules.json`, `firebase-rules-deploy.json` (sửa) | Thêm `zalo`, `zalo_users` |
| `index.html` (sửa) | Bridge `zaloBase`/`query`/`limitToLast`, nạp `ZaloMap`, chip trên card, khối "Hội thoại Zalo", dọn khi xoá lead |
| `api/mcp.ts` (sửa) | `/api/share` `loai: 'chat'`, cờ `coHoiThoaiZalo` |
| `xem.html` (sửa) | Khối hội thoại chỉ xem |
| `test/share.test.ts` (sửa) | Test chat trên trang chia sẻ |
| `package.json`, `SETUP.md`, `CLAUDE.md` (sửa) | Script test, hướng dẫn cài extension, ghi chú hằng số |

---

### Task 1: Thư viện thuần `zalo-map.js` + cấu hình

**Files:**
- Create: `extension/lib/config.js`
- Create: `extension/lib/zalo-map.js`
- Create: `test/zalo-map.test.ts`
- Modify: `package.json` (thêm script)

**Interfaces:**
- Produces (dùng ở Task 2–7):
  - `config.js`: `FIREBASE = { apiKey, dbUrl }`, `OWNER_UID`, `CRM_URL`
  - `STAGES: {id,name}[]`, `OPEN_STAGES`, `PACKAGES`, `LEAD_TYPES`, `KIND_LABEL: Record<kind,string>`, `SILENT_DAYS = 3`
  - `rootsFor(uid, ownerUid) → { crm: string, zalo: string }`
  - `kindOf(originMsgType) → 'text'|'image'|'sticker'|'file'|'video'|'link'|'card'|'other'`
  - `isGroupConv(convId) → boolean`
  - `fromIdbRecord(rec, friendName='') → Msg` với `Msg = { msgId, cliMsgId, convId, at:number, fromMe:boolean, senderUid, senderName, kind, text?:string|null, quote?:{title,text}|null }`
  - `messagePatch(zroot, msg) → Record<path, value>`
  - `mergeMeta(oldMeta|null, msgs: Msg[], extra={}) → Meta` với `Meta = { firstAt, lastAt, lastCustomerAt, lastMeAt, ...extra }`
  - `waitingState(metas: Meta[], nowMs, silentDays=3) → null | { type:'waiting'|'silent', label:string }`
  - `todayISOAt(date) → 'YYYY-MM-DD'`, `nowLabelAt(date) → string` (giống `nowLabel()` của app)
  - `newLeadFromZalo(form, { uid, now: Date }) → Lead`
  - `stageChangeText(fromId, toId) → string`, `stageChangePatch(croot, lead, toId, now: Date) → patch`, `notePatch(croot, lead, text, now: Date) → patch`
  - `linkPatch(zroot, convId, { status, leadId, name, now: Date }) → patch`, `purgeConvPatch(zroot, convId) → patch`
  - `searchLeads(leads, query, limit=8) → Lead[]`
  - `takeBatch(queue: object[], maxKeys) → [mergedPatch, usedCount]`

- [ ] **Step 1: Tạo `extension/lib/config.js`**

```js
// Giá trị CÔNG KHAI (đã nằm sẵn trong index.html trên GitHub). Không đặt bí mật ở đây.
export const FIREBASE = {
  apiKey: 'AIzaSyDT8jy6J5ohBbnJxZdrOnZhyI57D2ZRDhQ',
  dbUrl: 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app',
};

// Phải khớp OWNER_UID trong api/mcp.ts, OLD_OWNER_UID trong index.html và firebase-rules*.json.
export const OWNER_UID = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';

export const CRM_URL = 'https://huyentran.vercel.app';
```

- [ ] **Step 2: Viết test thất bại `test/zalo-map.test.ts`**

```ts
/**
 * Test hàm thuần của extension Zalo. Không chạm mạng/database.
 */
import * as M from '../extension/lib/zalo-map.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
const HOUR = 3600_000, DAY = 24 * HOUR;

console.log('\n>> rootsFor');
check('chu cu -> crmData + zalo', JSON.stringify(M.rootsFor(OWNER, OWNER)) === JSON.stringify({ crm: 'crmData', zalo: 'zalo' }));
check('khong co uid -> chu cu', M.rootsFor('', OWNER).zalo === 'zalo');
check('tai khoan khac -> nhanh rieng', M.rootsFor('U1', OWNER).crm === 'crmData_users/U1' && M.rootsFor('U1', OWNER).zalo === 'zalo_users/U1');

console.log('\n>> kindOf / isGroupConv');
check('webchat -> text', M.kindOf('webchat') === 'text');
check('chat.photo -> image', M.kindOf('chat.photo') === 'image');
check('share.file -> file', M.kindOf('share.file') === 'file');
check('la -> other', M.kindOf('chat.xyz') === 'other' && M.kindOf(undefined) === 'other');
check('nhom bat dau bang g', M.isGroupConv('g123') && !M.isGroupConv('123'));

console.log('\n>> fromIdbRecord');
const recMe = { msgId: '7000000000001', cliMsgId: '1758500000000', toUid: '123456789012345678', fromUid: '0', sendDttm: '1758500000123', originMsgType: 'webchat', dName: '' };
const mMe = M.fromIdbRecord(recMe);
check('fromMe khi fromUid = "0"', mMe.fromMe === true && mMe.senderUid === '' && mMe.senderName === '');
check('at la so', mMe.at === 1758500000123);
check('convId = toUid', mMe.convId === '123456789012345678');
check('kind text', mMe.kind === 'text');
const recKh = { ...recMe, msgId: '7000000000002', fromUid: '999', dName: 'Lan (nhom)' };
check('ten tu dName', M.fromIdbRecord(recKh, 'Lan ban be').senderName === 'Lan (nhom)');
check('ten tu danh ba khi thieu dName', M.fromIdbRecord({ ...recKh, dName: '' }, 'Lan ban be').senderName === 'Lan ban be');

console.log('\n>> messagePatch');
const base = 'zalo/msgs/123456789012345678/7000000000001';
const pMeta = M.messagePatch('zalo', mMe);
check('chi sieu du lieu -> KHONG co khoa text', !(`${base}/text` in pMeta) && pMeta[`${base}/at`] === 1758500000123);
check('co fromMe, kind, cliMsgId', pMeta[`${base}/fromMe`] === true && pMeta[`${base}/kind`] === 'text' && pMeta[`${base}/cliMsgId`] === '1758500000000');
const pText = M.messagePatch('zalo', { ...mMe, text: 'Chào em', quote: { title: 'Lan', text: 'hỏi giá' } });
check('co chu -> co khoa text', pText[`${base}/text`] === 'Chào em');
check('co trich dan', pText[`${base}/quote`].text === 'hỏi giá');
check('at khong hop le -> patch rong', Object.keys(M.messagePatch('zalo', { ...mMe, at: NaN })).length === 0);

console.log('\n>> mergeMeta');
const msgs = [
  { ...mMe, at: 1000, fromMe: false }, { ...mMe, at: 3000, fromMe: true }, { ...mMe, at: 2000, fromMe: false },
];
const meta1 = M.mergeMeta(null, msgs, { leadId: 'L1' });
check('first/last', meta1.firstAt === 1000 && meta1.lastAt === 3000);
check('lastCustomerAt / lastMeAt', meta1.lastCustomerAt === 2000 && meta1.lastMeAt === 3000);
check('giu extra', meta1.leadId === 'L1');
const meta2 = M.mergeMeta(meta1, [{ ...mMe, at: 500, fromMe: true }]);
check('tin cu hon khong keo lui last', meta2.lastAt === 3000 && meta2.lastMeAt === 3000 && meta2.firstAt === 500);

console.log('\n>> waitingState');
const now = 1_760_000_000_000;
const w = M.waitingState([{ lastCustomerAt: now - 2 * HOUR, lastMeAt: now - 5 * HOUR }], now);
check('khach nhan sau cung -> cho tra loi', w?.type === 'waiting' && w.label === 'Khách chờ trả lời · 2 giờ', JSON.stringify(w));
const w2 = M.waitingState([{ lastCustomerAt: now - 5 * DAY, lastMeAt: now - 4 * DAY }], now);
check('minh nhan sau cung, qua 3 ngay -> im lang', w2?.type === 'silent' && w2.label === 'Khách im 4 ngày', JSON.stringify(w2));
check('vua tra loi -> khong chip', M.waitingState([{ lastCustomerAt: now - 5 * HOUR, lastMeAt: now - 1 * HOUR }], now) === null);
check('nhieu hoi thoai lay moi nhat', M.waitingState([{ lastCustomerAt: now - 9 * DAY, lastMeAt: now - 8 * DAY }, { lastCustomerAt: now - 10 * 60_000, lastMeAt: 0 }], now)?.label === 'Khách chờ trả lời · 10 phút');
check('khong co du lieu -> null', M.waitingState([], now) === null && M.waitingState([null], now) === null);

console.log('\n>> nhan thoi gian giong app');
const d = new Date(2026, 8, 22, 14, 5);
check('todayISOAt', M.todayISOAt(d) === '2026-09-22');
check('nowLabelAt dang "D/M/YYYY, HH:MM"', /^\d{1,2}\/\d{1,2}\/2026, \d{2}:\d{2}$/.test(M.nowLabelAt(d)), M.nowLabelAt(d));

console.log('\n>> newLeadFromZalo');
const lead = M.newLeadFromZalo({ name: '  Ngọc Hân ', phone: '0901 234 567', weddingDate: '2026-12-20', package: 'Signature', leadType: 'Lead salehunt' }, { uid: 'U9', now: d });
check('id theo thoi diem', lead.id === 'L' + d.getTime());
check('truong bat buoc cho rules', lead.name === 'Ngọc Hân' && lead.stage === 'leadin' && !!lead.id);
check('ownerUid + ngay tao + han', lead.ownerUid === 'U9' && lead.createdAt === '2026-09-22' && lead.deadline === '2026-09-22');
check('giu goi + loai hop le', lead.package === 'Signature' && lead.leadType === 'Lead salehunt');
check('activityLog ghi nguon Zalo', lead.activityLog[0].text === 'Lead được tạo (từ Zalo)' && lead.activityLog[0].isNow === true);
const lead2 = M.newLeadFromZalo({ name: 'A', package: 'xyz', leadType: 'abc' }, { uid: 'U9', now: d });
check('goi/loai la -> mac dinh', lead2.package === 'Standard' && lead2.leadType === 'Lead công ty');
let threw = false; try { M.newLeadFromZalo({ name: '  ' }, { uid: 'U9', now: d }); } catch { threw = true; }
check('thieu ten -> loi', threw);

console.log('\n>> stageChangePatch / notePatch');
const L = { id: 'L1', stage: 'leadin', activityLog: [{ time: 'x', text: 'a' }, { time: 'y', text: 'b' }] };
const sp = M.stageChangePatch('crmData', L, 'baogia', d);
check('doi stage', sp['crmData/leads/L1/stage'] === 'baogia');
check('noi activityLog dung index + cau chu app', sp['crmData/leads/L1/activityLog/2']?.text === 'Chuyển từ "Lead in" sang "Báo giá"', JSON.stringify(sp));
check('cham updatedAt', typeof sp['crmData/updatedAt'] === 'string');
threw = false; try { M.stageChangePatch('crmData', L, 'won', d); } catch { threw = true; }
check('won/lost bi chan', threw);
const np = M.notePatch('crmData', { id: 'L1' }, ' khách hẹn thứ 5 ', d);
check('ghi chu index 0 khi chua co', np['crmData/leads/L1/notesList/0']?.text === 'khách hẹn thứ 5');
check('ghi chu co id + nhan', np['crmData/leads/L1/notesList/0'].id === 'n' + d.getTime() && np['crmData/leads/L1/notesList/0'].createdAt === M.nowLabelAt(d));

console.log('\n>> linkPatch / purgeConvPatch');
const lp = M.linkPatch('zalo', 'g77', { status: 'lead', leadId: 'L1', name: 'Nhóm cưới', now: d });
check('link nhom', lp['zalo/links/g77'].isGroup === true && lp['zalo/links/g77'].leadId === 'L1' && lp['zalo/links/g77'].linkedAt === d.getTime());
const pp = M.purgeConvPatch('zalo', 'g77');
check('go sach 3 nhanh', pp['zalo/links/g77'] === null && pp['zalo/meta/g77'] === null && pp['zalo/msgs/g77'] === null);

console.log('\n>> searchLeads');
const leads = [{ id: 'L1', name: 'Lan Nguyễn', phone: '090 123 4567' }, { id: 'L2', name: 'Minh Tuấn', phone: '' }];
check('khong dau van tim duoc', M.searchLeads(leads, 'lan nguyen').map((l: any) => l.id).join() === 'L1');
check('tim theo so', M.searchLeads(leads, '1234567').map((l: any) => l.id).join() === 'L1');
check('rong -> rong', M.searchLeads(leads, '  ').length === 0);

console.log('\n>> takeBatch');
const [b1, n1] = M.takeBatch([{ a: 1, b: 2 }, { c: 3 }, { d: 4, e: 5 }], 3);
check('gop toi da 3 khoa', JSON.stringify(b1) === JSON.stringify({ a: 1, b: 2, c: 3 }) && n1 === 2);
const [b2, n2] = M.takeBatch([{ a: 1, b: 2, c: 3, d: 4 }, { e: 5 }], 3);
check('lo qua lon van lay 1', Object.keys(b2).length === 4 && n2 === 1);

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exitCode = 1;
```

- [ ] **Step 3: Thêm script vào `package.json`** (trong `"scripts"`, sau `"test:ky"`)

```json
    "test:ky": "node test/khoang-thoi-gian.test.ts",
    "test:zalo": "node test/zalo-map.test.ts && node test/zalo-fb.test.ts",
    "test:zalo-db": "node test/zalo-rtdb.test.ts"
```

- [ ] **Step 4: Chạy test, xác nhận thất bại**

Run: `node test/zalo-map.test.ts`
Expected: lỗi `Cannot find module ... extension/lib/zalo-map.js`

- [ ] **Step 5: Viết `extension/lib/zalo-map.js`**

```js
/**
 * Hàm thuần dùng chung cho extension Zalo, CRM (index.html) và test Node.
 * Không chạm DOM, mạng hay chrome.* — chỉ biến đổi dữ liệu.
 */

export const STAGES = [
  { id: 'leadin', name: 'Lead in' },
  { id: 'baogia', name: 'Báo giá' },
  { id: 'follow1', name: 'Follow up lần 1' },
  { id: 'follow2', name: 'Follow up lần 2' },
  { id: 'follow3', name: 'Follow up lần 3' },
  { id: 'nuoidaihan', name: 'Nuôi dài hạn' },
  { id: 'won', name: 'Won' },
  { id: 'lost', name: 'Lost' },
];
const STAGE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.name]));
export const OPEN_STAGES = STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost');
export const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'];
export const LEAD_TYPES = ['Lead công ty', 'Lead salehunt'];
export const SILENT_DAYS = 3;

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** Kho dữ liệu theo tài khoản — cùng quy ước với userDataRef() trong index.html. */
export function rootsFor(uid, ownerUid) {
  const owner = !uid || uid === ownerUid;
  return {
    crm: owner ? 'crmData' : `crmData_users/${uid}`,
    zalo: owner ? 'zalo' : `zalo_users/${uid}`,
  };
}

const KIND_BY_ORIGIN = {
  webchat: 'text',
  'chat.photo': 'image',
  'chat.sticker': 'sticker',
  'share.file': 'file',
  'chat.video.msg': 'video',
  'chat.webcontent': 'link',
  'chat.recommended': 'card',
};
export function kindOf(originMsgType) {
  return KIND_BY_ORIGIN[originMsgType] || 'other';
}
export const KIND_LABEL = {
  text: '', image: 'Hình ảnh', sticker: 'Sticker', file: 'File', video: 'Video',
  link: 'Liên kết', card: 'Danh thiếp', other: 'Tin nhắn đặc biệt',
};

export function isGroupConv(convId) {
  return String(convId).startsWith('g');
}

/** Bản ghi store `message` trong IndexedDB của Zalo web → tin chuẩn (chưa có chữ). */
export function fromIdbRecord(rec, friendName = '') {
  const me = String(rec.fromUid) === '0';
  return {
    msgId: String(rec.msgId),
    cliMsgId: String(rec.cliMsgId || ''),
    convId: String(rec.toUid),
    at: Number(rec.sendDttm),
    fromMe: me,
    senderUid: me ? '' : String(rec.fromUid),
    senderName: me ? '' : String(rec.dName || friendName || ''),
    kind: kindOf(rec.originMsgType),
  };
}

/**
 * Patch nhiều đường dẫn cho một tin. Ghi TỪNG TRƯỜNG để lần ghi chỉ có siêu dữ liệu
 * không xoá chữ đã ghi trước đó (chữ chỉ có khi hội thoại được mở trên Zalo web).
 */
export function messagePatch(zroot, msg) {
  if (!Number.isFinite(msg.at)) return {};
  const b = `${zroot}/msgs/${msg.convId}/${msg.msgId}`;
  const p = {
    [`${b}/at`]: msg.at,
    [`${b}/fromMe`]: !!msg.fromMe,
    [`${b}/kind`]: msg.kind,
    [`${b}/cliMsgId`]: msg.cliMsgId,
    [`${b}/senderUid`]: msg.senderUid || '',
  };
  if (msg.senderName) p[`${b}/senderName`] = msg.senderName;
  if (typeof msg.text === 'string') p[`${b}/text`] = msg.text;
  if (msg.quote) p[`${b}/quote`] = msg.quote;
  return p;
}

/** Gộp mốc thời gian theo kiểu lấy max/min — tin cũ đến sau không kéo lùi. */
export function mergeMeta(old, msgs, extra = {}) {
  const m = { firstAt: null, lastAt: null, lastCustomerAt: null, lastMeAt: null, ...(old || {}) };
  for (const x of msgs) {
    if (!Number.isFinite(x.at)) continue;
    m.firstAt = m.firstAt ? Math.min(m.firstAt, x.at) : x.at;
    m.lastAt = Math.max(m.lastAt || 0, x.at);
    if (x.fromMe) m.lastMeAt = Math.max(m.lastMeAt || 0, x.at);
    else m.lastCustomerAt = Math.max(m.lastCustomerAt || 0, x.at);
  }
  return { ...m, ...extra };
}

function khoang(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} phút`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ`;
  return `${Math.floor(ms / DAY)} ngày`;
}

/** Chip trên card/thanh bên: khách đang chờ mình, hoặc mình nhắn mà khách im lâu. */
export function waitingState(metas, nowMs, silentDays = SILENT_DAYS) {
  let lastC = 0, lastMe = 0;
  for (const m of metas || []) {
    if (!m) continue;
    lastC = Math.max(lastC, m.lastCustomerAt || 0);
    lastMe = Math.max(lastMe, m.lastMeAt || 0);
  }
  if (lastC && lastC > lastMe) {
    return { type: 'waiting', label: `Khách chờ trả lời · ${khoang(nowMs - lastC)}` };
  }
  if (lastMe && nowMs - lastMe >= silentDays * DAY) {
    return { type: 'silent', label: `Khách im ${Math.floor((nowMs - lastMe) / DAY)} ngày` };
  }
  return null;
}

export function todayISOAt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Cùng công thức với nowLabel() trong index.html: formatDate(todayISO()) + giờ:phút vi-VN. */
export function nowLabelAt(d) {
  const ngay = new Date(todayISOAt(d) + 'T00:00:00').toLocaleDateString('vi-VN');
  const gio = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${ngay}, ${gio}`;
}

/** Lead mới đúng cấu trúc submitAddLead() của app. */
export function newLeadFromZalo(form, { uid, now }) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('Thiếu tên khách hàng');
  const today = todayISOAt(now);
  return {
    id: 'L' + now.getTime(),
    ownerUid: uid || null,
    name,
    facebook: '',
    phone: String(form.phone || '').trim(),
    weddingDate: form.weddingDate || null,
    package: PACKAGES.includes(form.package) ? form.package : 'Standard',
    leadType: LEAD_TYPES.includes(form.leadType) ? form.leadType : 'Lead công ty',
    revenueExpected: 0,
    stage: 'leadin',
    deadline: today,
    expectedCloseMonth: null,
    createdAt: today,
    schedule: '', persona: '', objection: '',
    notesList: [], tags: [], todos: [],
    activityLog: [{ time: nowLabelAt(now), text: 'Lead được tạo (từ Zalo)', isNow: true }],
  };
}

export function stageChangeText(fromId, toId) {
  return `Chuyển từ "${STAGE_NAME[fromId] || fromId}" sang "${STAGE_NAME[toId] || toId}"`;
}

/** Chỉ số kế tiếp cho mảng Firebase (REST trả mảng hoặc object khoá số). */
function nextIndex(arr) {
  if (!arr) return 0;
  const ks = Object.keys(arr).map(Number).filter(Number.isInteger);
  return ks.length ? Math.max(...ks) + 1 : 0;
}

export function stageChangePatch(croot, lead, toId, now) {
  if (!OPEN_STAGES.some((s) => s.id === toId)) throw new Error('Won/Lost cần đổi trong CRM (cần doanh thu hoặc lý do).');
  const i = nextIndex(lead.activityLog);
  return {
    [`${croot}/leads/${lead.id}/stage`]: toId,
    [`${croot}/leads/${lead.id}/activityLog/${i}`]: { time: nowLabelAt(now), text: stageChangeText(lead.stage, toId), isNow: true },
    [`${croot}/updatedAt`]: now.toISOString(),
  };
}

export function notePatch(croot, lead, text, now) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Ghi chú trống');
  const label = nowLabelAt(now);
  return {
    [`${croot}/leads/${lead.id}/notesList/${nextIndex(lead.notesList)}`]: { id: 'n' + now.getTime(), text: t, createdAt: label, updatedAt: label },
    [`${croot}/updatedAt`]: now.toISOString(),
  };
}

export function linkPatch(zroot, convId, { status, leadId = null, name = '', now }) {
  return {
    [`${zroot}/links/${convId}`]: { status, leadId: status === 'lead' ? leadId : null, name, isGroup: isGroupConv(convId), linkedAt: now.getTime() },
  };
}

export function purgeConvPatch(zroot, convId) {
  return { [`${zroot}/links/${convId}`]: null, [`${zroot}/meta/${convId}`]: null, [`${zroot}/msgs/${convId}`]: null };
}

function boDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
const chuSo = (s) => String(s || '').replace(/\D/g, '');

export function searchLeads(leads, query, limit = 8) {
  const q = boDau(query), qs = chuSo(query);
  if (!q) return [];
  return (leads || [])
    .filter((l) => boDau(l.name).includes(q) || (qs.length >= 4 && chuSo(l.phone).includes(qs)))
    .slice(0, limit);
}

/** Gộp các patch đầu hàng đợi thành một lệnh PATCH ≤ maxKeys khoá (luôn lấy ít nhất 1). */
export function takeBatch(queue, maxKeys) {
  const out = {};
  let n = 0, keys = 0;
  for (const p of queue) {
    const k = Object.keys(p).length;
    if (n > 0 && keys + k > maxKeys) break;
    Object.assign(out, p);
    keys += k; n++;
  }
  return [out, n];
}
```

- [ ] **Step 6: Chạy test, xác nhận đạt**

Run: `node test/zalo-map.test.ts`
Expected: dòng cuối `KET QUA: N PASS / 0 FAIL` (không có dòng `FAIL` nào)

- [ ] **Step 7: Commit**

```bash
git add extension/lib/config.js extension/lib/zalo-map.js test/zalo-map.test.ts package.json
git commit -m "Extension Zalo: thu vien ham thuan + test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Client Firebase REST `fb.js`

**Files:**
- Create: `extension/lib/fb.js`
- Create: `test/zalo-fb.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: `class FbError extends Error { code: 'AUTH'|'PERMISSION_DENIED'|'NETWORK'|'HTTP'; status: number }`; `createFb({ apiKey, dbUrl, store, fetchImpl?, now? })` trả object `{ signIn(email, password) → {uid,email}, currentUser() → {uid,email}|null, signOut(), idToken() → string, get(path, params?) → any, patch(path, body) → any }`. `store` = `{ get(key) → Promise<any>, set(key, value) → Promise, remove(key) → Promise }`. `path` = `''` nghĩa là gốc database.

- [ ] **Step 1: Viết test thất bại `test/zalo-fb.test.ts`**

```ts
/**
 * Test client Firebase REST của extension bằng fetch giả. Không chạm mạng.
 */
import { createFb, FbError } from '../extension/lib/fb.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const DB = 'https://db.example';
const mem = new Map<string, any>();
const store = { get: async (k: string) => mem.get(k), set: async (k: string, v: any) => { mem.set(k, v); }, remove: async (k: string) => { mem.delete(k); } };
let clock = 1_000_000;
const calls: { url: string; init: any }[] = [];
let next: (url: string, init: any) => { status: number; body: any } = () => ({ status: 200, body: null });
const fetchImpl = async (url: string, init: any = {}) => {
  calls.push({ url, init });
  const r = next(url, init);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as any;
};
const fb = createFb({ apiKey: 'KEY', dbUrl: DB, store, fetchImpl, now: () => clock });

console.log('\n>> Chua dang nhap');
let err: any = null;
try { await fb.get('crmData/leads'); } catch (e) { err = e; }
check('get khi chua dang nhap -> AUTH', err instanceof FbError && err.code === 'AUTH');
check('currentUser null', (await fb.currentUser()) === null);

console.log('\n>> Dang nhap');
next = () => ({ status: 200, body: { localId: 'U1', email: 'a@b.c', idToken: 'T1', refreshToken: 'R1', expiresIn: '3600' } });
const u = await fb.signIn('a@b.c', 'mk');
check('tra uid + email', u.uid === 'U1' && u.email === 'a@b.c');
check('goi signInWithPassword kem key', calls.at(-1)!.url.includes('accounts:signInWithPassword?key=KEY'));
check('body co returnSecureToken', JSON.parse(calls.at(-1)!.init.body).returnSecureToken === true);
check('KHONG luu mat khau', !JSON.stringify([...mem.values()]).includes('"mk"'));

console.log('\n>> get / patch dung token con han');
calls.length = 0;
next = () => ({ status: 200, body: { L1: { id: 'L1' } } });
const leads = await fb.get('crmData/leads', { shallow: 'true' });
check('tra du lieu', leads.L1.id === 'L1');
check('url dung + auth', calls[0].url === `${DB}/crmData/leads.json?shallow=true&auth=T1`, calls[0].url);
check('khong goi lam moi token', calls.length === 1);
next = () => ({ status: 200, body: {} });
await fb.patch('', { 'zalo/links/1': { status: 'lead' } });
check('patch goc -> /.json', calls[1].url === `${DB}/.json?auth=T1` && calls[1].init.method === 'PATCH', calls[1].url);

console.log('\n>> Token het han -> lam moi');
clock += 3600_000;
calls.length = 0;
next = (url) => url.includes('securetoken')
  ? { status: 200, body: { id_token: 'T2', refresh_token: 'R2', user_id: 'U1', expires_in: '3600' } }
  : { status: 200, body: 1 };
await fb.get('x');
check('goi securetoken truoc', calls[0].url.includes('securetoken.googleapis.com/v1/token?key=KEY'));
check('dung refresh token cu', String(calls[0].init.body).includes('refresh_token=R1'));
check('request du lieu dung token moi', calls[1].url.endsWith('auth=T2'));

console.log('\n>> Phan loai loi');
next = () => ({ status: 401, body: { error: 'Permission denied' } });
err = null; try { await fb.get('zalo/links'); } catch (e) { err = e; }
check('Permission denied -> PERMISSION_DENIED', err?.code === 'PERMISSION_DENIED', err?.code);
next = () => ({ status: 400, body: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
err = null; try { await fb.signIn('a@b.c', 'sai'); } catch (e) { err = e; }
check('sai mat khau -> AUTH', err?.code === 'AUTH', err?.code);
next = () => { throw new TypeError('Failed to fetch'); };
err = null; try { await fb.get('x'); } catch (e) { err = e; }
check('mat mang -> NETWORK', err?.code === 'NETWORK', err?.code);

console.log('\n>> Dang xuat');
await fb.signOut();
check('xoa phien', (await fb.currentUser()) === null);

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exitCode = 1;
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `node test/zalo-fb.test.ts`
Expected: lỗi `Cannot find module ... extension/lib/fb.js`

- [ ] **Step 3: Viết `extension/lib/fb.js`**

```js
/**
 * Firebase qua REST cho extension (MV3 cấm tải SDK từ ngoài).
 * Chỉ lưu token + uid + email; KHÔNG lưu mật khẩu.
 */
export class FbError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const AUTH_CODES = /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|USER_DISABLED|TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|MISSING_PASSWORD/;

export function createFb({ apiKey, dbUrl, store, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  const KEY = 'fbAuth';

  async function call(url, init) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new FbError('NETWORK', 'Không kết nối được máy chủ');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg = (data && ((data.error && data.error.message) || data.error)) || `HTTP ${res.status}`;
      const code = /Permission denied/i.test(msg) ? 'PERMISSION_DENIED'
        : AUTH_CODES.test(msg) || res.status === 401 ? 'AUTH'
        : 'HTTP';
      throw new FbError(code, String(msg), res.status);
    }
    return data;
  }

  const api = {
    async signIn(email, password) {
      const d = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      await store.set(KEY, {
        uid: d.localId, email: d.email, idToken: d.idToken, refreshToken: d.refreshToken,
        exp: now() + Number(d.expiresIn) * 1000,
      });
      return { uid: d.localId, email: d.email };
    },

    async currentUser() {
      const a = await store.get(KEY);
      return a ? { uid: a.uid, email: a.email } : null;
    },

    async signOut() {
      await store.remove(KEY);
    },

    async idToken() {
      const a = await store.get(KEY);
      if (!a) throw new FbError('AUTH', 'Chưa đăng nhập CRM', 401);
      if (a.exp - 60_000 > now()) return a.idToken;
      const d = await call(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
      });
      await store.set(KEY, { ...a, idToken: d.id_token, refreshToken: d.refresh_token, exp: now() + Number(d.expires_in) * 1000 });
      return d.id_token;
    },

    async get(path, params = {}) {
      const t = await api.idToken();
      const qs = new URLSearchParams({ ...params, auth: t });
      return call(`${dbUrl}/${path}.json?${qs}`, { method: 'GET' });
    },

    async patch(path, body) {
      const t = await api.idToken();
      return call(`${dbUrl}/${path}.json?auth=${encodeURIComponent(t)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
  return api;
}
```

- [ ] **Step 4: Chạy test, xác nhận đạt**

Run: `npm run test:zalo`
Expected: cả hai file in `0 FAIL`.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/fb.js test/zalo-fb.test.ts
git commit -m "Extension Zalo: client Firebase REST (dang nhap, lam moi token, get/patch)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Security Rules + test PATCH nhiều đường dẫn trên Firebase thật

**Files:**
- Modify: `firebase-rules-deploy.json` (thêm 2 nút sau `"crmData_users": {...},`)
- Modify: `firebase-rules.json` (cùng 2 nút, cùng vị trí; thêm 1 dòng `_huong_dan`)
- Create: `test/zalo-rtdb.test.ts`

**Interfaces:**
- Consumes: `messagePatch`, `linkPatch`, `purgeConvPatch`, `mergeMeta` từ Task 1.
- Produces: rules cho `zalo`, `zalo_users/$uid`.

- [ ] **Step 1: Viết test `test/zalo-rtdb.test.ts`** (dùng service account như `test/share.test.ts`; admin bỏ qua rules nên test này kiểm tra NGỮ NGHĨA ghi, còn rules kiểm tra tay ở Task 4)

```ts
/**
 * Kiểm tra cách ghi của extension trên Firebase thật, nhánh sandbox zaloTest.
 * Cần .env.local chứa FIREBASE_SERVICE_ACCOUNT. Cuối bài xoá sạch zaloTest.
 */
import fs from 'node:fs';
import { createSign } from 'node:crypto';
import * as M from '../extension/lib/zalo-map.js';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const envPath = new URL('../.env.local', import.meta.url);
if (!process.env.FIREBASE_SERVICE_ACCOUNT && fs.existsSync(envPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(envPath, 'utf8').trim();
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Thieu .env.local'); process.exit(1); }

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const b64 = (x: any) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const iat = Math.floor(Date.now() / 1000);
const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64(JSON.stringify({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
  aud: 'https://oauth2.googleapis.com/token', exp: iat + 3600, iat,
}));
const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
const tk: any = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
})).json();
const db = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${DB}/${path}.json`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk.access_token}` },
  });
  return res.json();
};
const patchRoot = (body: object) => db('', { method: 'PATCH', body: JSON.stringify(body) });

const Z = 'zaloTest', C = 'c999';
const now = new Date();
const msg = { msgId: '7001', cliMsgId: '1001', convId: C, at: 1758500000123, fromMe: false, senderUid: '55', senderName: 'Lan', kind: 'text' };

try {
  console.log('\n>> 1. Gan hoi thoai + ghi sieu du lieu');
  await patchRoot({ ...M.linkPatch(Z, C, { status: 'lead', leadId: 'L1', name: 'Lan', now }), ...M.messagePatch(Z, msg) });
  const t1 = await db(`${Z}/msgs/${C}/7001`);
  check('co at + kind, chua co text', t1.at === msg.at && t1.kind === 'text' && !('text' in t1), JSON.stringify(t1));

  console.log('\n>> 2. Mo hoi thoai -> ghi chu');
  await patchRoot(M.messagePatch(Z, { ...msg, text: 'Chào em' }));
  check('co text', (await db(`${Z}/msgs/${C}/7001/text`)) === 'Chào em');

  console.log('\n>> 3. Quet IndexedDB lan nua (chi sieu du lieu) -> KHONG mat chu');
  await patchRoot(M.messagePatch(Z, msg));
  check('text van con', (await db(`${Z}/msgs/${C}/7001/text`)) === 'Chào em');

  console.log('\n>> 4. Meta + link trong cung mot lenh');
  await patchRoot({ [`${Z}/meta/${C}`]: M.mergeMeta(null, [msg], { leadId: 'L1' }) });
  const meta = await db(`${Z}/meta/${C}`);
  check('meta ghi dung', meta.lastCustomerAt === msg.at && meta.leadId === 'L1', JSON.stringify(meta));
  check('link ghi dung', (await db(`${Z}/links/${C}/leadId`)) === 'L1');

  console.log('\n>> 5. Bo gan -> go sach');
  await patchRoot(M.purgeConvPatch(Z, C));
  check('links/meta/msgs deu mat', (await db(`${Z}/links/${C}`)) === null && (await db(`${Z}/meta/${C}`)) === null && (await db(`${Z}/msgs/${C}`)) === null);
} catch (e: any) {
  fail++; console.log('\nNGOAI LE: ' + e.message);
} finally {
  await db(Z, { method: 'DELETE' });
  console.log(`\n>> Don dep: ${Z} da xoa -> ${JSON.stringify(await db(Z))}`);
  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
  if (fail) process.exitCode = 1;
}
```

- [ ] **Step 2: Chạy test** (nếu lỗi mạng thì chạy lại một lần trước khi kết luận)

Run: `npm run test:zalo-db`
Expected: `6 PASS / 0 FAIL`, dòng dọn dẹp in `null`.

- [ ] **Step 3: Thêm rules vào `firebase-rules-deploy.json`** — chèn ngay sau khối `"crmData_users": { ... },` (trước `"appConfig": {`):

```json
    "zalo": {
      ".read": "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'",
      ".write": "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'"
    },
    "zalo_users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
```

- [ ] **Step 4: Thêm đúng 2 nút đó vào `firebase-rules.json`** (cùng vị trí trong khối `"rules"`), và thêm vào mảng `_huong_dan` dòng:

```json
    "- zalo / zalo_users: du lieu extension Zalo (hoi thoai da gan lead). Chu cu dung 'zalo', tai khoan khac dung 'zalo_users/<uid>'.",
```

- [ ] **Step 5: Kiểm tra JSON hợp lệ**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase-rules.json','utf8'));JSON.parse(require('fs').readFileSync('firebase-rules-deploy.json','utf8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add firebase-rules.json firebase-rules-deploy.json test/zalo-rtdb.test.ts
git commit -m "Rules cho du lieu Zalo + test ghi nhieu duong dan tren sandbox

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Báo Trường dán `firebase-rules-deploy.json`** vào Firebase Console → Realtime Database → Rules → Publish. Kiểm chứng: `curl "https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/zalo.json?shallow=true"` phải trả `Permission denied`.

---

### Task 4: Extension — manifest, background, content script, thanh bên

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/content.js`
- Create: `extension/sidepanel.html`, `extension/sidepanel.css`, `extension/sidepanel.js`

**Interfaces:**
- Consumes: toàn bộ `zalo-map.js`, `fb.js`, `config.js`.
- Produces (giao thức tin nhắn `chrome.runtime.sendMessage`, mọi phản hồi dạng `{ ok: true, ... }` hoặc `{ ok: false, error, code }`):
  - content → background: `{type:'getLinks'}` → `{links}`; `{type:'messages', convId, messages: Msg[]}`; `{type:'activeConv', conv: {convId, name, isGroup}|null}`; `{type:'health', health: {ok, reason}}`
  - thanh bên → background: `whoami`, `signIn {email,password}`, `signOut`, `loadLeads` → `{leads}`, `getLead {leadId}` → `{lead, metas}`, `link {convId, name, mode:'create'|'attach'|'ignore', leadId?, form?}` → `{leadId}`, `unlink {convId}`, `changeStage {leadId, stage}` → `{lead}`, `addNote {leadId, text}` → `{lead}`
  - background → content (tabs.sendMessage): `{type:'backfill', convId}`, `{type:'forget', convId}`, `{type:'links', links}`
  - `chrome.storage.session`: `activeConv`, `status = { queued, lastSyncAt, error: null|'rules'|'auth'|'offline'|'http', zalo: {ok, reason} }`
  - `chrome.storage.local`: `fbAuth`, `links`, `meta`, `queue`, `scanMarks`

- [ ] **Step 1: `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "HayDay CRM – Zalo",
  "version": "0.1.0",
  "description": "Đồng bộ hội thoại Zalo web đã gắn lead vào HayDay CRM (dùng nội bộ).",
  "permissions": ["storage", "sidePanel", "alarms"],
  "host_permissions": [
    "https://chat.zalo.me/*",
    "https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/*",
    "https://identitytoolkit.googleapis.com/*",
    "https://securetoken.googleapis.com/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://chat.zalo.me/*"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "HayDay CRM" },
  "web_accessible_resources": [
    { "resources": ["lib/zalo-map.js"], "matches": ["https://chat.zalo.me/*"] }
  ]
}
```

- [ ] **Step 2: `extension/background.js`**

```js
import { FIREBASE, OWNER_UID } from './lib/config.js';
import { createFb, FbError } from './lib/fb.js';
import {
  rootsFor, messagePatch, mergeMeta, linkPatch, purgeConvPatch, newLeadFromZalo,
  stageChangePatch, notePatch, takeBatch, isGroupConv,
} from './lib/zalo-map.js';

const local = {
  get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
};
const fb = createFb({ apiKey: FIREBASE.apiKey, dbUrl: FIREBASE.dbUrl, store: local });
const MAX_KEYS = 1200; // ~200 tin x 6 trường

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.alarms.create('tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') { flush(); refreshLinks(); }
});

async function mustRoots() {
  const u = await fb.currentUser();
  if (!u) throw new FbError('AUTH', 'Chưa đăng nhập CRM', 401);
  return { ...rootsFor(u.uid, OWNER_UID), uid: u.uid };
}

async function setStatus(p) {
  const cur = (await chrome.storage.session.get('status')).status || {};
  await chrome.storage.session.set({ status: { ...cur, ...p } });
}

async function reportError(e) {
  const code = e && e.code;
  const error = code === 'PERMISSION_DENIED' ? 'rules' : code === 'AUTH' ? 'auth' : code === 'NETWORK' ? 'offline' : 'http';
  await setStatus({ error, errorMsg: String((e && e.message) || e) });
}

/* ---------- links ---------- */
async function getLinks() {
  return (await local.get('links')) || {};
}
async function refreshLinks() {
  if (!(await fb.currentUser())) return {};
  try {
    const r = await mustRoots();
    const links = (await fb.get(`${r.zalo}/links`)) || {};
    await local.set('links', links);
    await setStatus({ error: null });
    await tellZaloTabs({ type: 'links', links });
    return links;
  } catch (e) {
    await reportError(e);
    return getLinks();
  }
}
async function tellZaloTabs(message) {
  const tabs = await chrome.tabs.query({ url: 'https://chat.zalo.me/*' });
  await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, message).catch(() => {})));
}

/* ---------- hàng đợi ghi (idempotent: ghi lặp là ghi đè cùng giá trị) ---------- */
let flushing = false;
async function enqueue(patch) {
  if (!Object.keys(patch).length) return;
  const q = (await local.get('queue')) || [];
  q.push(patch);
  await local.set('queue', q);
  await setStatus({ queued: q.length });
}
async function flush() {
  if (flushing || !(await fb.currentUser())) return;
  flushing = true;
  try {
    let q = (await local.get('queue')) || [];
    while (q.length) {
      const [batch, used] = takeBatch(q, MAX_KEYS);
      await fb.patch('', batch);
      q = ((await local.get('queue')) || []).slice(used);
      await local.set('queue', q);
      await setStatus({ queued: q.length, lastSyncAt: Date.now(), error: null });
    }
  } catch (e) {
    await reportError(e);
  } finally {
    flushing = false;
  }
}

/* ---------- tin nhắn ---------- */
async function metaPatchFor(r, convId, msgs, link) {
  const cache = (await local.get('meta')) || {};
  let old = cache[convId];
  if (old === undefined) {
    try { old = await fb.get(`${r.zalo}/meta/${convId}`); } catch { old = null; }
  }
  const m = mergeMeta(old, msgs, { leadId: link.leadId, name: link.name || '', isGroup: isGroupConv(convId), updatedAt: Date.now() });
  cache[convId] = m;
  await local.set('meta', cache);
  return { [`${r.zalo}/meta/${convId}`]: m };
}

async function onMessages(convId, messages) {
  const link = (await getLinks())[convId];
  if (!link || link.status !== 'lead') return { ok: true, skipped: true };
  const r = await mustRoots();
  const patch = {};
  for (const m of messages) Object.assign(patch, messagePatch(r.zalo, m));
  Object.assign(patch, await metaPatchFor(r, convId, messages, link));
  await enqueue(patch);
  flush();
  return { ok: true };
}

/* ---------- lead ---------- */
async function readLead(r, leadId) {
  return fb.get(`${r.crm}/leads/${leadId}`);
}

async function handle(msg) {
  switch (msg.type) {
    case 'whoami': return { ok: true, user: await fb.currentUser() };
    case 'signIn': {
      const user = await fb.signIn(msg.email, msg.password);
      await local.remove('meta');
      await refreshLinks();
      return { ok: true, user };
    }
    case 'signOut':
      await fb.signOut();
      await Promise.all(['links', 'meta', 'queue'].map((k) => local.remove(k)));
      await chrome.storage.session.remove('status');
      return { ok: true };
    case 'getLinks': return { ok: true, links: await getLinks() };
    case 'messages': return onMessages(msg.convId, msg.messages || []);
    case 'activeConv':
      await chrome.storage.session.set({ activeConv: msg.conv || null });
      return { ok: true };
    case 'health':
      await setStatus({ zalo: msg.health });
      return { ok: true };
    case 'loadLeads': {
      const r = await mustRoots();
      const leads = (await fb.get(`${r.crm}/leads`)) || {};
      return { ok: true, leads: Object.values(leads).filter((l) => l && l.id) };
    }
    case 'getLead': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      const convs = Object.entries(await getLinks()).filter(([, l]) => l && l.leadId === msg.leadId).map(([c]) => c);
      const metas = await Promise.all(convs.map((c) => fb.get(`${r.zalo}/meta/${c}`).catch(() => null)));
      return { ok: true, lead, metas };
    }
    case 'link': {
      const r = await mustRoots();
      const now = new Date();
      let leadId = msg.leadId || null;
      let patch = {};
      if (msg.mode === 'create') {
        const lead = newLeadFromZalo(msg.form || {}, { uid: r.uid, now });
        leadId = lead.id;
        patch[`${r.crm}/leads/${lead.id}`] = lead;
        patch[`${r.crm}/updatedAt`] = now.toISOString();
      }
      const status = msg.mode === 'ignore' ? 'ignored' : 'lead';
      patch = { ...patch, ...linkPatch(r.zalo, msg.convId, { status, leadId, name: msg.name || '', now }) };
      await fb.patch('', patch);
      await refreshLinks();
      if (status === 'lead') {
        const cache = (await local.get('meta')) || {};
        delete cache[msg.convId];
        await local.set('meta', cache);
        await tellZaloTabs({ type: 'backfill', convId: msg.convId });
      }
      return { ok: true, leadId };
    }
    case 'unlink': {
      const r = await mustRoots();
      await fb.patch('', purgeConvPatch(r.zalo, msg.convId));
      const cache = (await local.get('meta')) || {};
      delete cache[msg.convId];
      await local.set('meta', cache);
      await refreshLinks();
      await tellZaloTabs({ type: 'forget', convId: msg.convId });
      return { ok: true };
    }
    case 'changeStage': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      if (!lead) throw new Error('Lead không còn tồn tại');
      if (lead.stage !== msg.stage) await fb.patch('', stageChangePatch(r.crm, lead, msg.stage, new Date()));
      return { ok: true, lead: await readLead(r, msg.leadId) };
    }
    case 'addNote': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      if (!lead) throw new Error('Lead không còn tồn tại');
      await fb.patch('', notePatch(r.crm, lead, msg.text, new Date()));
      return { ok: true, lead: await readLead(r, msg.leadId) };
    }
    default:
      return { ok: false, error: 'Lệnh không hợp lệ: ' + msg.type };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, async (e) => {
    if (e && e.code) await reportError(e);
    sendResponse({ ok: false, error: String((e && e.message) || e), code: e && e.code });
  });
  return true; // phản hồi bất đồng bộ
});
```

- [ ] **Step 3: `extension/content.js`** (script thường; nạp thư viện bằng dynamic import)

```js
/**
 * Chạy trong chat.zalo.me. CHỈ ĐỌC: không bấm, không mở hội thoại, không gửi tin.
 * - IndexedDB (zdb_<uid>): siêu dữ liệu tin của các hội thoại đã gắn lead.
 * - DOM hội thoại đang mở: chữ của tin, nối với IndexedDB qua cliMsgId.
 */
(async () => {
  const M = await import(chrome.runtime.getURL('lib/zalo-map.js'));
  const SCAN_MS = 15000;
  let db = null;
  let links = {};
  let lastActive = null;
  const doneDom = new Set(); // cliMsgId đã gửi kèm chữ trong phiên này

  const send = (m) => chrome.runtime.sendMessage(m).catch(() => null);
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const isLead = (convId) => links[convId] && links[convId].status === 'lead';

  async function openDb() {
    const dbs = await indexedDB.databases();
    const name = (dbs.find((d) => /^zdb_\d+$/.test(d.name || '')) || {}).name;
    if (!name) return null;
    const handle = await new Promise((res, rej) => {
      const r = indexedDB.open(name); // không truyền version -> không bao giờ tự nâng cấp DB của Zalo
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    // Zalo nâng cấp DB -> đóng ngay để không chặn Zalo, lần quét sau mở lại
    handle.onversionchange = () => { handle.close(); db = null; };
    return handle;
  }

  function checkHealth(h) {
    if (!h) return { ok: false, reason: 'chưa thấy dữ liệu Zalo (đã đăng nhập Zalo web chưa?)' };
    for (const s of ['message', 'friend']) if (!h.objectStoreNames.contains(s)) return { ok: false, reason: 'thiếu store ' + s };
    const idx = h.transaction('message', 'readonly').objectStore('message').indexNames;
    for (const i of ['cliMsgIdIndex', 'userId_sendDttm_msgId']) if (!idx.contains(i)) return { ok: false, reason: 'thiếu chỉ mục ' + i };
    return { ok: true };
  }

  async function ensureDb() {
    if (db) return true;
    try { db = await openDb(); } catch { db = null; }
    const health = checkHealth(db);
    await send({ type: 'health', health });
    if (!health.ok && db) { db.close(); db = null; }
    return health.ok;
  }

  const store = (name) => db.transaction(name, 'readonly').objectStore(name);
  async function friendName(uid) {
    if (!uid || uid === '0') return '';
    try {
      const f = await reqP(store('friend').get(uid));
      return f ? f.displayName || f.zaloName || '' : '';
    } catch { return ''; }
  }
  async function byCli(cli) {
    try { return await reqP(store('message').index('cliMsgIdIndex').get(cli)); } catch { return null; }
  }
  async function convSince(convId, since) {
    const range = IDBKeyRange.bound([convId, String(since)], [convId, '￿']);
    return reqP(store('message').index('userId_sendDttm_msgId').getAll(range));
  }

  /* ---------- quét IndexedDB: mọi hội thoại đã gắn ---------- */
  async function scanIdb() {
    if (!(await ensureDb())) return;
    const marks = (await chrome.storage.local.get('scanMarks')).scanMarks || {};
    for (const convId of Object.keys(links).filter(isLead)) {
      const since = marks[convId] || 0;
      let recs;
      try { recs = await convSince(convId, since); } catch { continue; }
      if (!recs.length) continue;
      const msgs = [];
      for (const rec of recs) msgs.push(M.fromIdbRecord(rec, await friendName(String(rec.fromUid))));
      const res = await send({ type: 'messages', convId, messages: msgs });
      if (res && res.ok) marks[convId] = Math.max(since, ...msgs.map((m) => m.at).filter(Number.isFinite));
    }
    await chrome.storage.local.set({ scanMarks: marks });
  }

  /* ---------- DOM hội thoại đang mở ---------- */
  function domText(el) {
    const spans = [...el.querySelectorAll('span.text')].filter((s) => !s.closest('[class*="message-quote-fragment"]'));
    const t = spans.map((s) => s.innerText).join('').trim();
    return t || null;
  }
  function domQuote(el) {
    const q = el.querySelector('[class*="message-quote-fragment__description"]');
    if (!q) return null;
    const title = el.querySelector('[class*="message-quote-fragment__title"]');
    return { title: (title && title.innerText.trim()) || '', text: q.innerText.trim() };
  }
  function headerName() {
    const h = document.querySelector('.header-title');
    return h ? (h.innerText || '').split('\n')[0].trim() : '';
  }

  async function scanDom() {
    if (!(await ensureDb())) return;
    const els = [...document.querySelectorAll('[id^="bb_msg_id_"]')];
    const count = {};
    const batches = {};
    for (const el of els) {
      const cli = el.id.slice('bb_msg_id_'.length);
      const rec = await byCli(cli);
      if (!rec) continue;
      const convId = String(rec.toUid);
      count[convId] = (count[convId] || 0) + 1;
      if (doneDom.has(cli) || !isLead(convId)) continue;
      const m = M.fromIdbRecord(rec, await friendName(String(rec.fromUid)));
      const text = domText(el);
      if (m.kind === 'text' && !text) continue; // chưa vẽ xong, lần quét sau thử lại
      m.text = text;
      const q = domQuote(el);
      if (q) m.quote = q;
      (batches[convId] = batches[convId] || []).push(m);
      doneDom.add(cli);
    }
    for (const [convId, msgs] of Object.entries(batches)) {
      const res = await send({ type: 'messages', convId, messages: msgs });
      if (!res || !res.ok) msgs.forEach((m) => doneDom.delete(m.cliMsgId));
    }
    const active = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const conv = active ? { convId: active[0], name: headerName(), isGroup: M.isGroupConv(active[0]) } : null;
    const key = JSON.stringify(conv);
    if (key !== lastActive) { lastActive = key; await send({ type: 'activeConv', conv }); }
  }

  /* ---------- nối dây ---------- */
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'links') { links = m.links || {}; }
    if (m.type === 'backfill' || m.type === 'forget') {
      chrome.storage.local.get('scanMarks').then(({ scanMarks }) => {
        const marks = scanMarks || {};
        delete marks[m.convId];
        return chrome.storage.local.set({ scanMarks: marks });
      }).then(async () => {
        const r = await send({ type: 'getLinks' });
        links = (r && r.links) || links;
        doneDom.clear();
        if (m.type === 'backfill') { await scanIdb(); await scanDom(); }
      });
    }
  });

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => scanDom().catch(console.warn), 400); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  async function tick() {
    const r = await send({ type: 'getLinks' });
    if (r && r.ok) links = r.links || {};
    await scanIdb().catch(console.warn);
    await scanDom().catch(console.warn);
  }
  await tick();
  setInterval(() => tick(), SCAN_MS);
})();
```

- [ ] **Step 4: `extension/sidepanel.html`**

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HayDay CRM</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <main id="app"><p class="muted">Đang tải…</p></main>
  <footer id="status" class="status"></footer>
  <script type="module" src="sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 5: `extension/sidepanel.css`**

```css
:root{
  --green-50:#EAF7F0; --green-100:#CFEEDD; --green-500:#1FAE6F; --green-700:#0F6E45;
  --ink:#1C2622; --ink-soft:#5B6B64; --ink-faint:#8B9992; --bg:#F5F7F4; --card:#FFFFFF;
  --border:#E4E8E2; --red:#DD525C; --red-soft:#FCEBEC; --amber:#C98A2E; --amber-soft:#FBF1DF;
}
@media (prefers-color-scheme: dark){
  :root{
    --green-50:#15291F; --green-100:#1E3B2C; --green-500:#35C98A; --green-700:#86EBBE;
    --ink:#E7EEE9; --ink-soft:#A6B5AC; --ink-faint:#7C8B83; --bg:#101613; --card:#18201C;
    --border:#2B352E; --red:#FF7078; --red-soft:#331C1F; --amber:#E2B468; --amber-soft:#2E2719;
  }
}
*{box-sizing:border-box}
body{margin:0; font:13px/1.5 "Be Vietnam Pro", system-ui, sans-serif; background:var(--bg); color:var(--ink);}
main{padding:14px; display:flex; flex-direction:column; gap:10px;}
main.busy{opacity:.6; pointer-events:none;}
h1{font-size:15px; margin:0;}
.muted{color:var(--ink-soft); margin:0;}
.tiny{font-size:11px; color:var(--ink-faint); margin:0;}
.err{color:var(--red); margin:0; font-weight:600;}
.conv{background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 12px;}
.conv-name{font-weight:700; font-size:14px;}
label{display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; color:var(--ink-soft);}
input,select,textarea{font:inherit; font-size:13px; color:var(--ink); background:var(--card); border:1px solid var(--border); border-radius:8px; padding:7px 9px; width:100%;}
textarea{resize:vertical;}
button{font:inherit; font-weight:600; border:1px solid var(--border); background:var(--card); color:var(--ink); border-radius:8px; padding:8px 12px; cursor:pointer; text-align:left;}
button:hover{border-color:var(--green-500);}
button.primary{background:var(--green-500); color:#fff; border-color:var(--green-500);}
button.block{width:100%;}
form{display:flex; flex-direction:column; gap:10px;}
.row{display:flex; justify-content:space-between; gap:8px; align-items:center;}
.results{display:flex; flex-direction:column; gap:6px;}
.result{display:flex; flex-direction:column; gap:2px;}
.kv{display:flex; justify-content:space-between; gap:8px; font-size:12px;}
.kv span{color:var(--ink-faint);}
.val{font-weight:700; color:var(--ink); font-size:13px;}
.chip{align-self:flex-start; font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px;}
.chip.waiting{background:var(--red-soft); color:var(--red);}
.chip.silent{background:var(--amber-soft); color:var(--amber);}
a{color:var(--green-700); font-weight:600;}
a.danger{color:var(--red);}
.status{position:sticky; bottom:0; padding:8px 14px; font-size:11px; color:var(--ink-faint); border-top:1px solid var(--border); background:var(--bg); min-height:32px;}
.status .ok{color:var(--green-700); font-weight:700;}
.status .err{display:inline;}
```

- [ ] **Step 6: `extension/sidepanel.js`**

```js
import { OPEN_STAGES, STAGES, PACKAGES, LEAD_TYPES, searchLeads, waitingState, todayISOAt } from './lib/zalo-map.js';
import { CRM_URL } from './lib/config.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const STAGE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.name]));
const send = (m) => chrome.runtime.sendMessage(m);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => (v ? new Intl.NumberFormat('vi-VN').format(v) + ' đ' : '—');
const dateVN = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN') : '—');

const st = { user: null, conv: null, links: {}, status: {}, view: 'auto', leads: null, lead: null, metas: [], busy: false, error: '', flash: '' };

async function boot() {
  const who = await send({ type: 'whoami' });
  st.user = (who && who.user) || null;
  const s = await chrome.storage.session.get(['activeConv', 'status']);
  st.conv = s.activeConv || null;
  st.status = s.status || {};
  st.links = (await chrome.storage.local.get('links')).links || {};
  render();
  renderStatus();
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'session' && ch.activeConv) {
    const n = ch.activeConv.newValue || null;
    if ((n && n.convId) !== (st.conv && st.conv.convId)) {
      st.conv = n; st.view = 'auto'; st.lead = null; st.error = '';
      render();
    }
  }
  if (area === 'session' && ch.status) { st.status = ch.status.newValue || {}; renderStatus(); }
  if (area === 'local' && ch.links) { st.links = ch.links.newValue || {}; if (st.view === 'auto' && !st.busy) render(); }
});

const show = (html) => { app.innerHTML = html; };
const userLine = () => `<p class="tiny">Đăng nhập: ${esc(st.user.email)} · <a href="#" data-act="signout">Đăng xuất</a></p>`;
const convHead = (sub) => `<div class="conv"><div class="conv-name">${esc((st.conv && st.conv.name) || 'Hội thoại')}</div><div class="muted">${esc(sub)}</div></div>`;
const errLine = () => (st.error ? `<p class="err">${esc(st.error)}</p>` : '');
const linkOf = () => (st.conv ? st.links[st.conv.convId] : null);

function render() {
  if (!st.user) return renderLogin();
  if (!st.conv) return show(`<h1>HayDay CRM</h1><p class="muted">Mở một hội thoại trên Zalo web để xem lead tương ứng.</p>${errLine()}${userLine()}`);
  if (st.view === 'create') return renderCreate();
  if (st.view === 'attach') return renderAttach();
  const link = linkOf();
  if (!link) return renderUnlinked();
  if (link.status === 'ignored') return renderIgnored();
  return renderLinked(link);
}

function renderLogin() {
  show(`<h1>HayDay CRM</h1><p class="muted">Đăng nhập bằng tài khoản CRM (chỉ cần một lần trên máy này).</p>
  <form data-form="login">
    <label>Email<input name="email" type="email" required autocomplete="username"></label>
    <label>Mật khẩu<input name="password" type="password" required autocomplete="current-password"></label>
    ${errLine()}
    <button class="primary" type="submit">Đăng nhập</button>
  </form>`);
}

function renderUnlinked() {
  show(`${convHead((st.conv.isGroup ? 'Nhóm · ' : '') + 'Chưa gắn với lead nào')}
  <button class="primary block" data-act="create">＋ Tạo lead mới</button>
  <button class="block" data-act="attach">Gắn vào lead có sẵn…</button>
  <button class="block" data-act="ignore">Không phải khách</button>
  ${errLine()}
  <p class="tiny">Chọn một lần. Từ đó mọi tin của hội thoại này tự vào CRM.</p>
  ${userLine()}`);
}

function renderIgnored() {
  show(`${convHead('Đã đánh dấu: không phải khách')}
  <p class="muted">Tin nhắn của hội thoại này không được gửi lên CRM.</p>
  <button class="block" data-act="undo-ignore">Hoàn tác</button>
  ${errLine()}${userLine()}`);
}

function renderCreate() {
  show(`${convHead('Tạo lead mới')}
  <form data-form="create">
    <label>Tên khách hàng<input name="name" required value="${esc(st.conv.name || '')}"></label>
    <label>Số điện thoại<input name="phone" type="tel" placeholder="09xx xxx xxx"></label>
    <label>Ngày cưới<input name="weddingDate" type="date"></label>
    <label>Gói dịch vụ<select name="package">${PACKAGES.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
    <label>Loại lead<select name="leadType">${LEAD_TYPES.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
    ${errLine()}
    <div class="row"><button type="button" data-act="back">Hủy</button><button class="primary" type="submit">Tạo và gắn</button></div>
  </form>`);
}

async function renderAttach() {
  if (!st.leads) {
    show(`${convHead('Gắn vào lead có sẵn')}<p class="muted">Đang tải danh sách lead…</p>`);
    const r = await send({ type: 'loadLeads' });
    if (!r || !r.ok) { st.error = friendly(r); st.view = 'auto'; return render(); }
    st.leads = r.leads;
  }
  show(`${convHead('Gắn vào lead có sẵn')}
  <input id="q" placeholder="Tìm theo tên hoặc SĐT" autocomplete="off">
  <div id="results" class="results"></div>
  ${errLine()}
  <button class="block" data-act="back">Hủy</button>`);
  const q = document.getElementById('q');
  const draw = () => {
    const items = searchLeads(st.leads, q.value);
    document.getElementById('results').innerHTML = items.length
      ? items.map((l) => `<button class="result" data-act="pick" data-id="${esc(l.id)}"><b>${esc(l.name)}</b><span class="tiny">${esc(STAGE_NAME[l.stage] || l.stage)}${l.phone ? ' · ' + esc(l.phone) : ''}</span></button>`).join('')
      : `<p class="muted">${q.value.trim() ? 'Không thấy lead nào.' : 'Gõ tên hoặc số điện thoại để tìm.'}</p>`;
  };
  q.addEventListener('input', draw);
  q.value = st.conv.name || '';
  draw();
  q.focus();
}

async function renderLinked(link) {
  if (!st.lead || st.lead.id !== link.leadId) {
    show(convHead('Đang tải lead…'));
    const r = await send({ type: 'getLead', leadId: link.leadId });
    if (!r || !r.ok || !r.lead) {
      show(`${convHead('Không tải được lead (có thể đã bị xoá)')}${r && !r.ok ? `<p class="err">${esc(friendly(r))}</p>` : ''}
      <button class="block" data-act="unlink">Bỏ gắn hội thoại này</button>${userLine()}`);
      return;
    }
    st.lead = r.lead;
    st.metas = r.metas || [];
  }
  const l = st.lead;
  const w = waitingState(st.metas, Date.now());
  const closed = l.stage === 'won' || l.stage === 'lost';
  const overdue = !closed && l.deadline && l.deadline < todayISOAt(new Date());
  const stageCtl = closed
    ? `<div class="val">${esc(STAGE_NAME[l.stage])}</div>`
    : `<select data-change="stage">${OPEN_STAGES.map((s) => `<option value="${s.id}" ${s.id === l.stage ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
       <span class="tiny">Won/Lost: đổi trong CRM (cần doanh thu hoặc lý do).</span>`;
  show(`<div class="conv"><div class="conv-name">${esc(l.name)}</div><div class="muted">Zalo: ${esc(st.conv.name || '')}</div></div>
  ${w ? `<div class="chip ${w.type}">${esc(w.label)}</div>` : ''}
  <label>Giai đoạn${stageCtl}</label>
  <div class="kv"><span>Gói · dự kiến</span><b>${esc(l.package || '—')} · ${money(l.revenueExpected)}</b></div>
  <div class="kv"><span>Ngày cưới</span><b>${dateVN(l.weddingDate)}</b></div>
  <div class="kv"><span>Hạn liên hệ</span><b class="${overdue ? 'err' : ''}">${dateVN(l.deadline)}</b></div>
  <form data-form="note">
    <textarea name="text" rows="2" placeholder="Thêm ghi chú nhanh…"></textarea>
    <button type="submit">Lưu ghi chú</button>
  </form>
  ${errLine()}
  <div class="row"><a href="${CRM_URL}" target="_blank" rel="noopener">Mở trong CRM ↗</a><a href="#" data-act="unlink" class="danger">Bỏ gắn</a></div>
  ${userLine()}`);
}

function friendly(r) {
  if (!r) return 'Không liên lạc được với extension. Đóng rồi mở lại thanh bên.';
  if (r.code === 'PERMISSION_DENIED') return 'Chưa bật quyền cho dữ liệu Zalo (cần cập nhật Security Rules).';
  if (r.code === 'AUTH') return 'Sai email/mật khẩu hoặc phiên đăng nhập đã hết. Đăng nhập lại.';
  if (r.code === 'NETWORK') return 'Mất kết nối mạng. Thử lại sau.';
  return r.error || 'Có lỗi xảy ra.';
}

async function run(fn, onOk) {
  if (st.busy) return;
  st.busy = true; st.error = '';
  app.classList.add('busy');
  try {
    const r = await fn();
    if (!r || !r.ok) st.error = friendly(r);
    else if (onOk) onOk(r);
  } catch (e) {
    st.error = String(e.message || e);
  } finally {
    st.busy = false;
    app.classList.remove('busy');
    render();
  }
}

const doLink = (extra) => run(
  () => send({ type: 'link', convId: st.conv.convId, name: st.conv.name || '', ...extra }),
  () => { st.view = 'auto'; st.lead = null; st.leads = null; },
);

function flash(msg) {
  st.flash = msg;
  renderStatus();
  setTimeout(() => { st.flash = ''; renderStatus(); }, 2500);
}

function renderStatus() {
  const s = st.status || {};
  const parts = [];
  if (st.flash) parts.push(`<span class="ok">${esc(st.flash)}</span>`);
  if (s.zalo && !s.zalo.ok) parts.push(`<span class="err">Tạm ngưng đồng bộ: ${esc(s.zalo.reason || 'Zalo vừa thay đổi')}</span>`);
  if (s.error === 'rules') parts.push('<span class="err">Chưa bật quyền cho dữ liệu Zalo (Security Rules)</span>');
  else if (s.error === 'auth') parts.push('<span class="err">Cần đăng nhập lại CRM</span>');
  else if (s.error === 'offline') parts.push('<span class="err">Mất mạng — sẽ tự gửi lại</span>');
  else if (s.error === 'http') parts.push(`<span class="err">Lỗi máy chủ: ${esc(s.errorMsg || '')}</span>`);
  if (s.queued) parts.push(`${s.queued} lô đang chờ gửi`);
  if (s.lastSyncAt) parts.push(`Đồng bộ lúc ${new Date(s.lastSyncAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`);
  statusEl.innerHTML = parts.join(' · ');
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  e.preventDefault();
  st.error = '';
  switch (t.dataset.act) {
    case 'create': st.view = 'create'; return render();
    case 'attach': st.view = 'attach'; return render();
    case 'back': st.view = 'auto'; return render();
    case 'ignore': return doLink({ mode: 'ignore' });
    case 'pick': return doLink({ mode: 'attach', leadId: t.dataset.id });
    case 'undo-ignore': return run(() => send({ type: 'unlink', convId: st.conv.convId }));
    case 'unlink':
      if (!confirm('Bỏ gắn hội thoại này? Tin nhắn đã lưu của hội thoại sẽ bị xoá khỏi CRM (lead vẫn giữ nguyên).')) return;
      return run(() => send({ type: 'unlink', convId: st.conv.convId }), () => { st.lead = null; });
    case 'signout':
      await send({ type: 'signOut' });
      st.user = null; st.leads = null; st.lead = null;
      return render();
  }
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'login') return run(() => send({ type: 'signIn', email: data.email, password: data.password }), (r) => { st.user = r.user; });
  if (f.dataset.form === 'create') return doLink({ mode: 'create', form: data });
  if (f.dataset.form === 'note') {
    if (!String(data.text || '').trim()) return;
    return run(() => send({ type: 'addNote', leadId: st.lead.id, text: data.text }), (r) => { st.lead = r.lead; flash('Đã lưu ghi chú'); });
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.change === 'stage') {
    run(() => send({ type: 'changeStage', leadId: st.lead.id, stage: t.value }), (r) => { st.lead = r.lead; flash('Đã đổi giai đoạn'); });
  }
});

boot();
```

- [ ] **Step 7: Kiểm tra cú pháp các file JS**

Run: `node --check extension/background.js; node --check extension/content.js; node --check extension/sidepanel.js; node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'));console.log('manifest ok')"`
Expected: không lỗi, in `manifest ok`. (`--check` chỉ kiểm tra cú pháp; `chrome.*` chỉ chạy trong Chrome.)

- [ ] **Step 8: Thử tay trên Chrome thật (Trường làm, cần rules đã dán ở Task 3)**

1. `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/`. Không có lỗi đỏ.
2. Mở `https://chat.zalo.me` (đã đăng nhập Zalo), bấm icon extension → thanh bên mở, hiện form đăng nhập.
3. Đăng nhập tài khoản CRM → thanh bên hiện "Mở một hội thoại…".
4. Mở một hội thoại 1-1 → thanh bên hiện tên + 3 nút.
5. **Không phải khách** → trạng thái "Đã đánh dấu"; **Hoàn tác** → quay lại 3 nút.
6. **Gắn vào lead có sẵn** → tìm một lead thử → chọn → thẻ lead hiện ra. Trong Firebase Console thấy `zalo/links/<convId>` và sau ≤ 15 giây `zalo/msgs/<convId>/…` có tin (tin đang hiển thị có `text`).
7. Nhờ ai nhắn 1 tin vào hội thoại đó → sau ≤ 15 giây có tin mới trong `zalo/msgs` kèm `text`; `zalo/meta/<convId>.lastCustomerAt` cập nhật.
8. Đổi giai đoạn trong thanh bên → trong CRM lead chuyển cột, log hoạt động có `Chuyển từ "…" sang "…"`.
9. Thêm ghi chú → hiện trong khối Ghi chú của lead trong CRM.
10. Tắt Wi-Fi, nhận/gửi 1 tin, bật lại → tin vẫn lên Firebase (hàng đợi).
11. Mở service worker console (`chrome://extensions` → "service worker") không có lỗi đỏ lặp lại.

Ghi lại kết quả từng bước; bước nào sai thì sửa trước khi sang Task 5.

- [ ] **Step 9: Commit**

```bash
git add extension/manifest.json extension/background.js extension/content.js extension/sidepanel.html extension/sidepanel.css extension/sidepanel.js
git commit -m "Extension Zalo: thanh ben gan lead + dong bo tin nhan tu Zalo web

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: CRM — khối "Hội thoại Zalo", chip trên card, dọn khi xoá lead

**Files:**
- Modify: `index.html` (các vị trí nêu trong từng bước — tìm theo đoạn chữ neo, không theo số dòng)

**Interfaces:**
- Consumes: `extension/lib/zalo-map.js` (`waitingState`, `KIND_LABEL`) qua `window.ZaloMap`; dữ liệu `zalo/links`, `zalo/meta`, `zalo/msgs/{convId}` do Task 4 ghi.
- Produces: `window.__firebase.zaloBase()`, `window.__firebase.query`, `window.__firebase.limitToLast`; hàm `zaloConvsOf(leadId)`, `zaloChipHtml(lead)`, `openZaloChat(leadId)`, `closeZaloChat()`.

- [ ] **Step 1: Bridge Firebase** — sửa dòng import database:

```js
  import { getDatabase, ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
```
thành
```js
  import { getDatabase, ref, get, set, update, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
```

Ngay sau hàm `shareLogBase(){ ... }` thêm:

```js
  // Dữ liệu extension Zalo, tách theo tài khoản giống crmData.
  function zaloBase(){
    const uid = auth.currentUser && auth.currentUser.uid;
    return (!uid || uid === OLD_OWNER_UID) ? 'zalo' : 'zalo_users/' + uid;
  }
```

Trong `window.__firebase = { ... }` đổi dòng `appConfigBase, shareLogBase, currentUid,` thành:

```js
    appConfigBase, shareLogBase, currentUid, zaloBase, query, limitToLast,
```

- [ ] **Step 2: Nạp thư viện dùng chung** — chèn ngay TRƯỚC dòng `<script>` có chú thích `/* Chạy NGAY trong <head>`:

```html
<script type="module">
  // Dùng chung logic với extension Zalo (chip chờ trả lời, nhãn loại tin).
  import * as ZaloMap from './extension/lib/zalo-map.js';
  window.ZaloMap = ZaloMap;
</script>
```

- [ ] **Step 3: CSS** — ngay sau dòng `.block-notes{background:var(--card); border:1px solid var(--border);}` thêm:

```css
  .block-zalo{background:var(--card); border:1px solid var(--border);}
  .block-zalo .drawer-section-title{color:var(--green-700);}
  .zalo-tabs{display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;}
  .zalo-tab{font:inherit; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--bg); color:var(--ink-soft); cursor:pointer;}
  .zalo-tab.on{background:var(--green-50); color:var(--green-700); border-color:var(--green-100);}
  .zalo-search{margin-bottom:8px;}
  .zalo-list{max-height:420px; overflow-y:auto; display:flex; flex-direction:column; padding-right:4px; min-width:0;}
  .zalo-day{text-align:center; font-size:10.5px; font-weight:700; color:var(--ink-faint); margin:10px 0 4px;}
  .zalo-row{display:flex; flex-direction:column; max-width:82%; margin:3px 0; min-width:0;}
  .zalo-row.kh{align-self:flex-start; align-items:flex-start;}
  .zalo-row.me{align-self:flex-end; align-items:flex-end;}
  .zalo-who{font-size:10.5px; font-weight:700; color:var(--ink-soft); margin-bottom:2px;}
  .zalo-bubble{font-size:12.5px; line-height:1.5; padding:7px 11px; border-radius:12px; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; min-width:0;}
  .zalo-row.kh .zalo-bubble{background:var(--bg); border:1px solid var(--border-soft);}
  .zalo-row.me .zalo-bubble{background:var(--green-50);}
  .zalo-time{font-size:10px; color:var(--ink-faint); margin-top:2px;}
  .zalo-att{display:inline-block; font-size:11px; font-weight:700; color:var(--ink-soft); background:var(--gray-tag-soft); border-radius:999px; padding:1px 8px;}
  .zalo-quote{font-size:11px; color:var(--ink-soft); border-left:2px solid var(--green-500); padding-left:6px; margin-bottom:4px;}
  .zalo-missing{font-style:italic; color:var(--ink-faint);}
  .zalo-note{font-size:11px; color:var(--amber); font-weight:700; margin-bottom:6px;}
  .zalo-list mark{background:var(--amber-soft); color:inherit; border-radius:2px;}
  .zalo-chip{display:inline-block; margin-top:6px; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px;}
  .zalo-chip.waiting{background:var(--red-soft); color:var(--red);}
  .zalo-chip.silent{background:var(--amber-soft); color:var(--amber);}
```

- [ ] **Step 4: Chip trên card** — trong `cardHtml`, ngay sau dòng
`      <div class="card-revenue">${formatMoney(lead.stage==='won' ? lead.revenueActual : lead.revenueExpected)}</div>` thêm:

```js
      ${zaloChipHtml(lead)}
```

- [ ] **Step 5: Khối trong drawer** — trong `openLead`, ngay TRƯỚC dòng `        <div class="detail-block block-notes">` thêm:

```html
        <div class="detail-block block-zalo" id="zaloBlock"></div>

```

Trong `openLead`, ngay sau dòng `  renderDrawerTodos(lead);` thêm:

```js
  openZaloChat(id);
```

Trong `closeDrawer()`, thêm dòng cuối trước `}`:

```js
  closeZaloChat();
```

- [ ] **Step 6: Dọn khi xoá lead** — thay toàn bộ hàm `deleteCurrentLead` bằng:

```js
function deleteCurrentLead(){
  if (!currentLeadId) return;
  if (!confirm('Xóa lead này khỏi pipeline?')) return;
  const id = currentLeadId;
  // Gỡ luôn hội thoại Zalo đã gắn với lead này, kẻo chat mồ côi nằm lại trên database.
  const goZalo = {};
  zaloConvsOf(id).forEach(c => { goZalo['links/' + c.convId] = null; goZalo['meta/' + c.convId] = null; goZalo['msgs/' + c.convId] = null; });
  if (Object.keys(goZalo).length){
    const f = window.__firebase;
    f.update(f.refAt(f.zaloBase()), goZalo).catch(e => console.warn('Không gỡ được hội thoại Zalo của lead đã xoá:', e));
  }
  leads = leads.filter(l => l.id !== id);
  closeDrawer();
  renderAll();
  scheduleSave();
}
```

- [ ] **Step 7: Logic Zalo trong app** — chèn ngay TRƯỚC dòng `/* ======================= LOST REASON MODAL ======================= */`:

```js
/* ======================= HỘI THOẠI ZALO (dữ liệu do extension ghi) ======================= */
let zaloLinks = {};          // convId -> { status, leadId, name, isGroup }
let zaloMeta = {};           // convId -> { lastCustomerAt, lastMeAt, ... }
let zaloUnsubs = [];         // huỷ nghe tin nhắn khi đóng drawer
let zaloMsgs = {};           // convId -> [tin] | { error:true }
let zaloActiveConv = null;
let zaloQuery = '';
let zaloOpenFor = '';        // "<leadId>:<convIds>" để biết khi nào cần nghe lại

function initZalo(){
  const f = window.__firebase;
  const base = f.zaloBase();
  // Rules chưa dán -> lỗi quyền: app vẫn chạy bình thường, chỉ không có chip/hội thoại.
  f.onValue(f.refAt(base + '/links'), s => {
    zaloLinks = s.val() || {};
    if (!uiIsBusy()) renderPipeline();
    if (currentLeadId && zaloKey(currentLeadId) !== zaloOpenFor) openZaloChat(currentLeadId);
  }, e => console.warn('Không đọc được zalo/links:', e));
  f.onValue(f.refAt(base + '/meta'), s => {
    zaloMeta = s.val() || {};
    if (!uiIsBusy()) renderPipeline();
  }, e => console.warn('Không đọc được zalo/meta:', e));
}

function zaloConvsOf(leadId){
  return Object.entries(zaloLinks)
    .filter(([, l]) => l && l.status === 'lead' && l.leadId === leadId)
    .map(([convId, l]) => ({ convId, name: l.name || '', isGroup: !!l.isGroup }));
}
function zaloKey(leadId){ return leadId + ':' + zaloConvsOf(leadId).map(c => c.convId).join(','); }

function zaloChipHtml(lead){
  if (!window.ZaloMap || lead.stage === 'won' || lead.stage === 'lost') return '';
  const metas = zaloConvsOf(lead.id).map(c => zaloMeta[c.convId]).filter(Boolean);
  if (!metas.length) return '';
  const s = window.ZaloMap.waitingState(metas, Date.now());
  return s ? `<div class="zalo-chip ${s.type}">${esc(s.label)}</div>` : '';
}

function closeZaloChat(){
  zaloUnsubs.forEach(u => { try { u(); } catch(e){} });
  zaloUnsubs = []; zaloMsgs = {}; zaloOpenFor = '';
}

function openZaloChat(leadId){
  closeZaloChat();
  const convs = zaloConvsOf(leadId);
  zaloOpenFor = zaloKey(leadId);
  if (!convs.some(c => c.convId === zaloActiveConv)) zaloActiveConv = convs.length ? convs[0].convId : null;
  zaloQuery = '';
  const f = window.__firebase;
  const base = f.zaloBase();
  convs.forEach(c => {
    const q = f.query(f.refAt(`${base}/msgs/${c.convId}`), f.limitToLast(500));
    const un = f.onValue(q, s => {
      zaloMsgs[c.convId] = Object.entries(s.val() || {}).map(([id, m]) => ({ id, ...m })).sort((a, b) => (a.at || 0) - (b.at || 0));
      if (currentLeadId === leadId) renderZaloList();
    }, e => {
      console.warn('Không tải được hội thoại Zalo:', e);
      zaloMsgs[c.convId] = { error: true };
      if (currentLeadId === leadId) renderZaloList();
    });
    zaloUnsubs.push(un);
  });
  renderZaloBlock(leadId);
}

function renderZaloBlock(leadId){
  const box = document.getElementById('zaloBlock');
  if (!box) return;
  const convs = zaloConvsOf(leadId);
  const tabs = convs.length > 1
    ? `<div class="zalo-tabs">${convs.map(c => `<button class="zalo-tab ${c.convId === zaloActiveConv ? 'on' : ''}" onclick="pickZaloConv('${leadId}','${c.convId}')">${esc(c.name || (c.isGroup ? 'Nhóm' : 'Hội thoại'))}</button>`).join('')}</div>`
    : '';
  const search = convs.length ? `<input class="field-input zalo-search" placeholder="Tìm trong hội thoại…" value="${esc(zaloQuery)}" oninput="zaloQuery=this.value; renderZaloList()">` : '';
  box.innerHTML = `<div class="drawer-section-title">💬 Hội thoại Zalo</div>${tabs}${search}<div class="zalo-list" id="zaloList"></div>`;
  renderZaloList();
}

function pickZaloConv(leadId, convId){
  zaloActiveConv = convId;
  zaloQuery = '';
  renderZaloBlock(leadId);
}

function zaloHighlight(escaped, q){
  if (!q || /[&<>]/.test(q)) return escaped;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return escaped.replace(re, m => `<mark>${m}</mark>`);
}

function renderZaloList(){
  const box = document.getElementById('zaloList');
  if (!box) return;
  if (!zaloActiveConv){
    box.innerHTML = '<div class="list-empty">Chưa gắn hội thoại Zalo nào. Mở hội thoại của khách trên Zalo web rồi bấm "Gắn vào lead có sẵn" ở thanh bên extension.</div>';
    return;
  }
  const data = zaloMsgs[zaloActiveConv];
  if (!data){ box.innerHTML = '<div class="list-empty">Đang tải…</div>'; return; }
  if (data.error){ box.innerHTML = '<div class="list-empty">Không tải được hội thoại (có thể chưa cập nhật Security Rules).</div>'; return; }
  const labels = (window.ZaloMap && window.ZaloMap.KIND_LABEL) || {};
  const q = zaloQuery.trim().toLowerCase();
  const items = q ? data.filter(m => (m.text || '').toLowerCase().includes(q)) : data;
  const thieuChu = data.filter(m => m.kind === 'text' && typeof m.text !== 'string').length;
  let html = '', ngayTruoc = '';
  items.forEach(m => {
    const d = new Date(m.at);
    const ngay = d.toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit' });
    if (!q && ngay !== ngayTruoc){ html += `<div class="zalo-day">${esc(ngay)}</div>`; ngayTruoc = ngay; }
    const chu = typeof m.text === 'string' ? zaloHighlight(esc(m.text), q) : '';
    const body = m.kind === 'text'
      ? (typeof m.text === 'string' ? chu : '<span class="zalo-missing">Chưa có nội dung — mở hội thoại này trên Zalo web</span>')
      : `<span class="zalo-att">${esc(labels[m.kind] || 'Tin nhắn')}</span>${chu ? ' ' + chu : ''}`;
    const quote = m.quote ? `<div class="zalo-quote">${esc(m.quote.title)}${m.quote.title ? ': ' : ''}${esc(m.quote.text)}</div>` : '';
    html += `<div class="zalo-row ${m.fromMe ? 'me' : 'kh'}">`
      + (!m.fromMe && m.senderName ? `<div class="zalo-who">${esc(m.senderName)}</div>` : '')
      + `<div class="zalo-bubble">${quote}${body}</div>`
      + `<div class="zalo-time">${d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' })}</div></div>`;
  });
  box.innerHTML = (thieuChu ? `<div class="zalo-note">${thieuChu} tin chưa có nội dung — mở hội thoại trên Zalo web để đồng bộ</div>` : '')
    + (html || '<div class="list-empty">' + (q ? 'Không có tin nào khớp.' : 'Chưa có tin nhắn nào.') + '</div>');
  if (!q) box.scrollTop = box.scrollHeight;
}

```

- [ ] **Step 8: Bắt đầu nghe dữ liệu Zalo** — trong `initCloudSync()`, ngay TRƯỚC dòng

```js
  } catch(e){
    console.error('Firebase init error:', e);
```
thêm:
```js
    initZalo();
```

- [ ] **Step 9: Chạy lại toàn bộ test hiện có** (không được hỏng gì)

Run: `npm test; npm run test:share; npm run test:scope; npm run test:ky; npm run test:zalo`
Expected: tất cả `0 FAIL` (test gọi Firebase nếu lỗi mạng thì chạy lại một lần).

- [ ] **Step 10: Thử tay CRM tại máy**

Run: `npx --yes http-server -p 5173 -c-1` (ở gốc repo), mở `http://localhost:5173`, đăng nhập.
Kiểm tra: (a) Console không có lỗi đỏ mới; (b) lead đã gắn ở Task 4 có chip "Khách chờ trả lời · …" nếu tin cuối là của khách; (c) mở lead → khối "💬 Hội thoại Zalo" hiện bong bóng, tin của mình bên phải; (d) nhờ khách nhắn thêm 1 tin → trong ≤ 20 giây tin hiện ra mà không cần tải lại; (e) ô tìm lọc + tô sáng; (f) lead chưa gắn → dòng hướng dẫn; (g) chế độ tối + màn hẹp < 768px không vỡ khung; (h) tạo 1 lead thử, gắn 1 hội thoại, xoá lead → `zalo/links|meta|msgs/<convId>` biến mất trên Console.

- [ ] **Step 11: Commit**

```bash
git add index.html
git commit -m "CRM: hien hoi thoai Zalo trong lead + chip khach cho tra loi tren card

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Trang chia sẻ cho sếp xem hội thoại

**Files:**
- Modify: `api/mcp.ts` (hàm `xuLyChiaSe`, `leadChiTiet`, thêm `zaloRootFromDataRoot`, `traLoiChat`)
- Modify: `xem.html` (`moLead`, thêm `taiHoiThoai`, `veHoiThoai`, CSS)
- Modify: `test/share.test.ts`

**Interfaces:**
- Consumes: dữ liệu `ZROOT/links`, `ZROOT/msgs` (Task 4); `resolveScope`, `phienConHieuLuc`, `readPath`, `traLoiJson` có sẵn.
- Produces: `POST /api/share { token, session, loai:'chat', leadId }` → `200 { ok:true, hoiThoai: [{ convId, name, messages: [{at, fromMe, senderName, kind, text|null, quote|null}] }] }`; `401` khi không có phiên hợp lệ; `400` khi `leadId` lạ. Mỗi lead trong response chính có thêm `coHoiThoaiZalo: boolean`. Export `zaloRootFromDataRoot(dataRoot: string): string`.

- [ ] **Step 1: Viết test thất bại** — trong `test/share.test.ts`:

(a) Trong khối seed (ngay sau dòng `console.log('   seed OK');`) thêm:

```ts
  await db('zaloTest', { method:'PUT', body: JSON.stringify({
    links: { c1: { status:'lead', leadId:'L1', name:'Khach Zalo', isGroup:false, linkedAt: 1 },
             c2: { status:'ignored', leadId:null, name:'Gia dinh', isGroup:false, linkedAt: 1 } },
    msgs: { c1: { '7001': { at: 2000, fromMe:false, senderUid:'55', senderName:'Khach', kind:'text', text:'CHAT BI MAT', cliMsgId:'1' },
                  '7000': { at: 1000, fromMe:true, senderUid:'', kind:'image', cliMsgId:'0' } },
            c2: { '9': { at: 1, fromMe:false, kind:'text', text:'TIN GIA DINH', cliMsgId:'9' } } },
  }) });
```

(b) Ngay TRƯỚC dòng `  console.log('\n>> 12. Khoa tam sau 10 lan sai');` thêm:

```ts
  console.log('\n>> 13. Hoi thoai Zalo cho sep');
  check('zaloRootFromDataRoot', mod.zaloRootFromDataRoot('crmData') === 'zalo'
    && mod.zaloRootFromDataRoot('crmData_users/U1') === 'zalo_users/U1'
    && mod.zaloRootFromDataRoot('crmDataTest') === 'zaloTest');
  check('co co coHoiThoaiZalo', r3.data.leads[0].coHoiThoaiZalo === true);
  const c1 = await goiShare({ token: TOKEN, loai: 'chat', leadId: 'L1' });
  check('khong co phien -> 401', c1.status === 401, String(c1.status));
  const c2 = await goiShare({ token: TOKEN, session: r3.data.session, loai: 'chat', leadId: '../x' });
  check('leadId la -> 400', c2.status === 400, String(c2.status));
  const c3 = await goiShare({ token: TOKEN, session: r3.data.session, loai: 'chat', leadId: 'L1' });
  check('co phien -> 200', c3.status === 200, JSON.stringify(c3.data).slice(0, 150));
  check('dung 1 hoi thoai', Array.isArray(c3.data.hoiThoai) && c3.data.hoiThoai.length === 1);
  const tin = c3.data.hoiThoai?.[0]?.messages || [];
  check('sap theo thoi gian', tin.length === 2 && tin[0].at === 1000 && tin[1].text === 'CHAT BI MAT');
  check('KHONG lo hoi thoai "khong phai khach"', !JSON.stringify(c3.data).includes('TIN GIA DINH'));
  check('khong gui senderUid/cliMsgId', !('senderUid' in tin[1]) && !('cliMsgId' in tin[1]));
```

(c) Trong khối `finally`, ngay sau dòng `  await db('crmDataTest', { method:'DELETE' });` thêm:

```ts
  await db('zaloTest', { method:'DELETE' });
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm run test:share`
Expected: các check mục 13 FAIL (`zaloRootFromDataRoot is not a function`, `coHoiThoaiZalo` undefined).

- [ ] **Step 3: `api/mcp.ts` — hàm dùng chung** — ngay sau hàm `resolveScope(...) { ... }` thêm:

```ts
/** Kho dữ liệu extension Zalo tương ứng kho CRM: crmData -> zalo, crmData_users/<uid> -> zalo_users/<uid>, crmDataTest -> zaloTest. */
export function zaloRootFromDataRoot(dataRoot: string): string {
  return dataRoot.replace(/^crmData/, 'zalo');
}

type ZaloLink = { status?: string; leadId?: string | null; name?: string };
type ZaloMsg = { at?: number; fromMe?: boolean; senderName?: string; kind?: string; text?: unknown; quote?: { title?: string; text?: string } | null };

/** Hội thoại Zalo của một lead cho trang chỉ xem. Chỉ hội thoại status 'lead', chỉ trường cần hiển thị. */
async function traLoiChat(dataRootCuaKho: string, leadId: string, dungPhien: boolean): Promise<Response> {
  if (!dungPhien) return traLoiJson({ loi: 'Phiên xem đã hết hạn, tải lại trang để nhập mật khẩu.' }, 401);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return traLoiJson({ loi: 'Mã lead không hợp lệ' }, 400);
  const zroot = zaloRootFromDataRoot(dataRootCuaKho);
  const links = (await readPath<Record<string, ZaloLink> | null>(`${zroot}/links`)) || {};
  const convs = Object.entries(links).filter(([, l]) => l && l.status === 'lead' && l.leadId === leadId);
  const hoiThoai = await Promise.all(convs.map(async ([convId, l]) => {
    const msgs = (await readPath<Record<string, ZaloMsg> | null>(`${zroot}/msgs/${convId}`)) || {};
    return {
      convId,
      name: l.name || '',
      messages: Object.values(msgs)
        .map((m) => ({
          at: Number(m.at) || 0,
          fromMe: !!m.fromMe,
          senderName: m.senderName || '',
          kind: m.kind || 'other',
          text: typeof m.text === 'string' ? m.text : null,
          quote: m.quote ? { title: m.quote.title || '', text: m.quote.text || '' } : null,
        }))
        .sort((a, b) => a.at - b.at),
    };
  }));
  return traLoiJson({ ok: true, hoiThoai });
}
```

- [ ] **Step 4: `api/mcp.ts` — nhánh xử lý** — trong `xuLyChiaSe`:

(a) Kiểu `body` thêm 2 trường: đổi dòng `    don?: string; lui?: number; tu?: string; den?: string;` thành

```ts
    don?: string; lui?: number; tu?: string; den?: string;
    loai?: string; leadId?: string;
```

(b) Ngay sau dòng `  const dungPhien = !!phien && phienConHieuLuc(cfg.token, phien);` thêm:

```ts
  // Hội thoại Zalo tải riêng từng deal (response tổng chứa mọi lead, nhét chat vào sẽ phình).
  // Bắt buộc có phiên xem hợp lệ: không nhận mật khẩu ở đây, không ghi nhật ký thêm.
  if (body.loai === 'chat') return traLoiChat(scope.dataRoot, String(body.leadId || ''), dungPhien);
```

(c) Ngay sau dòng `  const crm = await alsStore.run({ dataRoot: scope.dataRoot }, () => loadCrm());` thêm:

```ts
  const zaloLinks = (await readPath<Record<string, ZaloLink> | null>(`${zaloRootFromDataRoot(scope.dataRoot)}/links`).catch(() => null)) || {};
  const leadCoZalo = new Set(Object.values(zaloLinks).filter((z) => z && z.status === 'lead' && z.leadId).map((z) => z.leadId as string));
```

(d) Trong object trả về của `leadChiTiet`, ngay sau dòng `      lostTrongKy: l.stage === 'lost' && trongKhoang(l.lostAt, ky.tu, ky.den),` thêm:

```ts
      coHoiThoaiZalo: leadCoZalo.has(l.id),
```

- [ ] **Step 5: Chạy test, xác nhận đạt**

Run: `npm run test:share`
Expected: `0 FAIL`, mục 13 đủ 9 OK.

- [ ] **Step 6: `xem.html`** — (a) CSS: ngay sau dòng `.note-text{...}` thêm:

```css
  .zchat{display:flex; flex-direction:column; max-height:360px; overflow-y:auto; gap:2px;}
  .zrow{display:flex; flex-direction:column; max-width:85%; margin:2px 0;}
  .zrow.kh{align-self:flex-start;} .zrow.me{align-self:flex-end; align-items:flex-end;}
  .zwho{font-size:10.5px; font-weight:700; color:var(--ink-faint);}
  .zbub{font-size:12.5px; line-height:1.45; padding:6px 10px; border-radius:10px; white-space:pre-wrap; overflow-wrap:anywhere; background:var(--bg); border:1px solid var(--border-soft);}
  .zrow.me .zbub{background:var(--green-50, #EAF7F0);}
  .zt{font-size:10px; color:var(--ink-faint);}
  .zatt{font-size:11px; font-weight:700; color:var(--ink-faint);}
```

(b) Trong `moLead`, ngay TRƯỚC dòng `    h += '<div class="blk"><div class="blk-title">Ghi chú ('+l.notesList.length+')</div>';` thêm:

```js
    if (l.coHoiThoaiZalo) h += '<div class="blk" id="zaloChatBlk"><div class="blk-title">Hội thoại Zalo</div><div class="empty">Đang tải hội thoại…</div></div>';
```

(c) Trong `moLead`, ngay sau dòng `    moModal(l.name, l.stageName + ' · ' + esc(l.leadType), h, quayLaiDuoc);` thêm:

```js
    if (l.coHoiThoaiZalo) taiHoiThoai(l.id);
```

(d) Ngay sau hàm `moLead(...) { ... }` thêm:

```js
  var NHAN_LOAI = { image:'Hình ảnh', sticker:'Sticker', file:'File', video:'Video', link:'Liên kết', card:'Danh thiếp', other:'Tin nhắn đặc biệt' };
  async function taiHoiThoai(leadId){
    var el = document.getElementById('zaloChatBlk');
    if (!el) return;
    try {
      var res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, session: phien, loai: 'chat', leadId: leadId })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data && data.loi ? data.loi : 'Lỗi');
      if (document.getElementById('zaloChatBlk') === el) el.innerHTML = veHoiThoai(data.hoiThoai || []);
    } catch(e){
      el.innerHTML = '<div class="blk-title">Hội thoại Zalo</div><div class="empty">Không tải được hội thoại.</div>';
    }
  }
  function veHoiThoai(ds){
    return ds.map(function(hc){
      var rows = hc.messages.map(function(m){
        var d = new Date(m.at);
        var than = m.kind === 'text'
          ? (m.text !== null ? esc(m.text) : '<span class="zatt">(chưa có nội dung)</span>')
          : '<span class="zatt">' + esc(NHAN_LOAI[m.kind] || 'Tin nhắn') + '</span>' + (m.text ? ' ' + esc(m.text) : '');
        return '<div class="zrow ' + (m.fromMe ? 'me' : 'kh') + '">'
          + (!m.fromMe && m.senderName ? '<div class="zwho">' + esc(m.senderName) + '</div>' : '')
          + '<div class="zbub">' + than + '</div>'
          + '<div class="zt">' + d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }) + '</div></div>';
      }).join('');
      return '<div class="blk-title">Hội thoại Zalo' + (ds.length > 1 ? ' · ' + esc(hc.name) : '') + ' (' + hc.messages.length + ')</div>'
        + '<div class="zchat">' + (rows || '<div class="empty">Chưa có tin nhắn.</div>') + '</div>';
    }).join('') || '<div class="blk-title">Hội thoại Zalo</div><div class="empty">Chưa có tin nhắn.</div>';
  }
```

- [ ] **Step 7: Thử tay** — `npx --yes http-server -p 5173 -c-1` không chạy được `/api/share`; thử trên **Vercel preview** của nhánh (push nhánh → Vercel tạo preview) hoặc sau khi deploy: mở link chia sẻ → nhập mật khẩu → mở deal đã gắn Zalo → khối "Hội thoại Zalo" hiện bong bóng; deal chưa gắn không có khối này.

- [ ] **Step 8: Commit**

```bash
git add api/mcp.ts xem.html test/share.test.ts
git commit -m "Bao cao chia se: sep xem duoc hoi thoai Zalo cua tung deal

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Tài liệu

**Files:**
- Modify: `SETUP.md` (thêm mục cuối)
- Modify: `CLAUDE.md` (bảng dữ liệu, hằng số, test)

**Interfaces:** không.

- [ ] **Step 1: `SETUP.md`** — thêm vào cuối file:

```markdown
---

## Giai đoạn 3 — Extension Zalo web

Extension đọc tin nhắn trên **chat.zalo.me** (không phải Zalo PC) và đưa hội thoại **đã gắn lead** vào CRM.

> Zalo chỉ cho **một** phiên máy tính: đăng nhập Zalo web sẽ đăng xuất Zalo PC. Máy dùng extension phải chat bằng Zalo web.

### Bước 3.1 — Dán Security Rules mới
Dán `firebase-rules-deploy.json` vào Firebase Console → Realtime Database → Rules → **Publish** (thêm nhánh `zalo`, `zalo_users`).
Kiểm chứng: `curl "https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/zalo.json?shallow=true"` → `Permission denied`.

### Bước 3.2 — Cài extension (dạng unpacked)
1. Tải repo về máy (hoặc `git pull` nếu đã có).
2. Chrome → `chrome://extensions` → bật **Developer mode** (góc phải trên).
3. **Load unpacked** → chọn thư mục `extension/` trong repo.
4. Ghim icon "HayDay CRM – Zalo" lên thanh công cụ.

### Bước 3.3 — Dùng lần đầu
1. Mở `https://chat.zalo.me`, quét QR đăng nhập Zalo.
2. Bấm icon extension → thanh bên mở → đăng nhập **tài khoản CRM** (một lần).
3. Mở hội thoại của khách → chọn **Tạo lead mới** / **Gắn vào lead có sẵn** / **Không phải khách**.

Từ đó tin nhắn của hội thoại đã gắn tự vào CRM (mục "💬 Hội thoại Zalo" trong lead). Hội thoại chưa gắn hoặc "không phải khách" **không** được gửi đi đâu.

### Cập nhật extension
`git pull` rồi vào `chrome://extensions` bấm nút tải lại (↻) của extension.

### Giới hạn
- Chữ của tin chỉ lấy được khi hội thoại được **mở trên Zalo web**; tin chỉ đọc trên điện thoại hiện "Chưa có nội dung" cho tới khi mở hội thoại đó trên web. Extension **không** tự mở hội thoại (sẽ báo "đã xem" cho khách).
- Tab Zalo web phải đang mở thì mới đồng bộ; mở lại sẽ tự bù (trong phạm vi lịch sử Zalo web giữ, khoảng 2 tuần).
- Zalo đổi giao diện có thể làm extension tạm ngưng; thanh bên sẽ báo "Tạm ngưng đồng bộ".
```

- [ ] **Step 2: `CLAUDE.md`** — (a) trong bảng "Mô hình dữ liệu tách theo tài khoản" thêm dòng:

```markdown
| Dữ liệu extension Zalo | `zalo` | `zalo_users/<uid>` |
```

(b) Đổi câu "Hằng này lặp ở **3 nơi phải khớp nhau**: `api/mcp.ts` (`OWNER_UID`), `index.html` (`OLD_OWNER_UID`), và `firebase-rules*.json`. Đổi một chỗ là phải đổi cả ba." thành:

```markdown
- `OWNER_UID = 7ePgCPmzxHdEAEazHo9IkyKf2rw2`. Hằng này lặp ở **4 nơi phải khớp nhau**: `api/mcp.ts` (`OWNER_UID`), `index.html` (`OLD_OWNER_UID`), `extension/lib/config.js` (`OWNER_UID`) và `firebase-rules*.json`. Đổi một chỗ là phải đổi cả bốn.
```

(c) Trong mục "Cấu trúc lớn" thêm:

```markdown
- **`extension/`** — Chrome extension MV3 (cài unpacked) cho chat.zalo.me: `content.js` đọc IndexedDB + DOM của Zalo web, `background.js` ghi Firebase qua REST, thanh bên gắn lead. `extension/lib/zalo-map.js` là hàm thuần dùng chung với `index.html` (nạp bằng `<script type="module">`) và test Node — sửa logic chip/nhãn ở đây.
```

(d) Trong khối lệnh Test thêm:

```bash
npm run test:zalo        # test/zalo-map + zalo-fb — hàm thuần extension, KHÔNG chạm Firebase
npm run test:zalo-db     # test/zalo-rtdb.test.ts — cách ghi của extension trên sandbox zaloTest
```

- [ ] **Step 3: Commit**

```bash
git add SETUP.md CLAUDE.md
git commit -m "Tai lieu: cai va dung extension Zalo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
