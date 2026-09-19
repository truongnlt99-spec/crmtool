# Tách share / MCP / nhật ký theo từng tài khoản — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi tài khoản có link chia sẻ chỉ xem, khoá MCP, và nhật ký truy cập riêng, đọc đúng kho dữ liệu `crmData_users/<uid>`; chủ cũ giữ nguyên `crmData` + `appConfig`.

**Architecture:** Token/khoá tự mang UID theo dạng `<uid>.<random>`. Backend tách UID để phân giải kho, dùng `AsyncLocalStorage` truyền `dataRoot` theo từng request vào các tool MCP vốn đang đóng cứng hằng `DATA_ROOT`. Frontend ghi/đọc cấu hình theo namespace của user hiện tại. Token/khoá cũ (hex thuần, không có dấu `.`) vẫn map về chủ cũ — tương thích ngược.

**Tech Stack:** TypeScript (Vercel Function, `api/mcp.ts`), Firebase Realtime Database (REST + service account), HTML/JS thuần (`index.html`), Node built-in test runner (`node test/*.ts`).

**Spec:** `docs/superpowers/specs/2026-09-19-share-mcp-per-account-design.md`

## Global Constraints

- UID chủ cũ: `7ePgCPmzxHdEAEazHo9IkyKf2rw2` (backend hằng `OWNER_UID`, frontend hằng `OLD_OWNER_UID`).
- Dấu phân tách token/khoá là ký tự `.` (chấm). UID Firebase và random hex không chứa `.`.
- Chủ cũ KHÔNG bị hồi quy: khoá env `MCP_SECRET`, token/khoá hex cũ, và mọi thứ ở `appConfig`/`crmData`/`shareLog` phải chạy y như trước.
- `DATA_ROOT = process.env.FIREBASE_DATA_ROOT || 'crmData'` giữ nguyên làm mặc định (test sandbox dùng `crmDataTest`).
- Frontend là file public trên GitHub: không nhúng khoá/bí mật vào `index.html`.
- File `xem.html` KHÔNG được sửa.

---

### Task 1: `resolveScope` + unit test

Hàm thuần phân giải token/khoá → kho dữ liệu. Đây là logic mới quan trọng nhất, test được độc lập không cần Firebase.

**Files:**
- Modify: `api/mcp.ts` (thêm `export function resolveScope`, đặt ngay sau khai báo `OWNER_UID` ~dòng 298)
- Test: `test/scope.test.ts` (create)

**Interfaces:**
- Produces: `export function resolveScope(chuoi: string): { uid: string; dataRoot: string; configPath: string; shareLogPath: string }`

- [ ] **Step 1: Viết test thất bại** — tạo `test/scope.test.ts`:

```ts
/** Test resolveScope: phân giải token/khoá -> kho dữ liệu. Hàm thuần, không chạm Firebase. */
import { resolveScope } from '../api/mcp.ts';

const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
let pass = 0, fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
};

// Token hex thuần (link cũ) -> chủ cũ
eq('hex thuần -> chủ cũ', resolveScope('abcd1234ef'), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

// Tiền tố đúng UID chủ cũ -> vẫn scope chủ cũ
eq('tiền tố OWNER -> chủ cũ', resolveScope(`${OWNER}.abcd`), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

// Tài khoản mới -> kho riêng
eq('uid khác -> kho riêng', resolveScope('HGpKBnj7qiUvKTG8HvcI72Se4Qr2.abcd'), {
  uid: 'HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  dataRoot: 'crmData_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  configPath: 'appConfig_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
  shareLogPath: 'shareLog_users/HGpKBnj7qiUvKTG8HvcI72Se4Qr2',
});

// Rỗng / không hợp lệ -> chủ cũ (an toàn)
eq('rỗng -> chủ cũ', resolveScope(''), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});
eq('dấu chấm đầu chuỗi -> chủ cũ', resolveScope('.abcd'), {
  uid: OWNER, dataRoot: 'crmData', configPath: 'appConfig', shareLogPath: 'shareLog',
});

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `node test/scope.test.ts`
Expected: FAIL — `resolveScope` chưa được export (`SyntaxError`/`undefined is not a function`).

- [ ] **Step 3: Cài đặt `resolveScope`** — chèn ngay sau khối khai báo `OWNER_UID` trong `api/mcp.ts` (sau dòng 298):

```ts
/**
 * Phân giải token link chia sẻ hoặc khoá MCP về đúng kho dữ liệu.
 * Token/khoá mới có dạng "<uid>.<random>"; token/khoá cũ là hex thuần -> chủ cũ.
 * UID Firebase và random hex đều không chứa dấu ".", nên "." là dấu phân tách an toàn.
 */
export function resolveScope(chuoi: string): {
  uid: string; dataRoot: string; configPath: string; shareLogPath: string;
} {
  const s = String(chuoi || '');
  const cham = s.indexOf('.');
  if (cham > 0) {
    const uid = s.slice(0, cham);
    if (uid && uid !== OWNER_UID) {
      return {
        uid,
        dataRoot: `crmData_users/${uid}`,
        configPath: `appConfig_users/${uid}`,
        shareLogPath: `shareLog_users/${uid}`,
      };
    }
  }
  return { uid: OWNER_UID, dataRoot: DATA_ROOT, configPath: 'appConfig', shareLogPath: 'shareLog' };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `node test/scope.test.ts`
Expected: PASS — `4 ... ok, 0 fail` (6 assertion, tất cả OK).

- [ ] **Step 5: Thêm script test và commit**

Sửa `package.json` mục `scripts`, thêm:
```json
    "test:scope": "node test/scope.test.ts",
```

```bash
git add api/mcp.ts test/scope.test.ts package.json
git commit -m "feat: resolveScope phan giai token/khoa -> kho du lieu tung tai khoan"
```

---

### Task 2: AsyncLocalStorage — truyền dataRoot theo request (giữ nguyên hành vi)

Đổi các tham chiếu hằng `DATA_ROOT` bên trong tool/helper sang hàm `dataRoot()` đọc từ ALS, mặc định vẫn là `DATA_ROOT`. Bước này KHÔNG đổi hành vi — dùng `test/share.test.ts` làm lưới an toàn hồi quy.

**Files:**
- Modify: `api/mcp.ts` (import ALS; thêm `alsStore`, `dataRoot()`; đổi 12 chỗ dùng `DATA_ROOT` bên trong tool/helper)

**Interfaces:**
- Consumes: `DATA_ROOT` (dòng 25), `resolveScope` (Task 1)
- Produces: `const alsStore: AsyncLocalStorage<{ dataRoot: string }>`, `function dataRoot(): string`

- [ ] **Step 1: Chạy lưới an toàn TRƯỚC khi sửa (phải PASS sẵn)**

Run: `npm run test:share`
Expected: PASS. (Nếu thiếu `.env.local` thì bỏ qua Task 2/3/4 verify tự động và chuyển sang kiểm thử thủ công — ghi rõ trong báo cáo.)

- [ ] **Step 2: Thêm import ALS** — sửa dòng 3 của `api/mcp.ts`:

```ts
import { createSign, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
```

- [ ] **Step 3: Thêm `alsStore` + `dataRoot()`** — chèn ngay sau khai báo `DATA_ROOT` (sau dòng 25):

```ts
/**
 * Kho dữ liệu hiệu lực cho request hiện tại. Các tool MCP và loadCrm đọc qua dataRoot()
 * thay vì hằng DATA_ROOT, nhờ đó fetch handler bơm được kho của từng tài khoản vào.
 * Không có store (đường gọi cũ / test) -> fallback về DATA_ROOT, hành vi y như trước.
 */
const alsStore = new AsyncLocalStorage<{ dataRoot: string }>();
function dataRoot(): string {
  return alsStore.getStore()?.dataRoot ?? DATA_ROOT;
}
```

- [ ] **Step 4: Đổi 12 tham chiếu `DATA_ROOT` → `dataRoot()`** trong thân tool/helper. KHÔNG đổi dòng 25 (khai báo) và fallback trong `resolveScope`/`dataRoot`. Các vị trí (theo số dòng hiện tại):
  - Dòng 350: `} | null>(DATA_ROOT);` → `} | null>(dataRoot());`
  - Dòng 532: `` `${DATA_ROOT}/leads/${lead.id}/activityLog` `` → `` `${dataRoot()}/leads/${lead.id}/activityLog` ``
  - Dòng 539: `await patchPath(DATA_ROOT, {` → `await patchPath(dataRoot(), {`
  - Dòng 945: `` `${DATA_ROOT}/leads` `` → `` `${dataRoot()}/leads` ``
  - Dòng 1013, 1067, 1091, 1127, 1139, 1171, 1275, 1282: đổi `${DATA_ROOT}` → `${dataRoot()}` trong mỗi template string.

  Kiểm tra bằng: `grep -n "DATA_ROOT" api/mcp.ts` — chỉ còn 3 kết quả hợp lệ: dòng khai báo (25), fallback trong `dataRoot()`, và fallback trong `resolveScope`.

- [ ] **Step 5: Chạy lưới an toàn lại — vẫn PASS**

Run: `npm run test:share && npm run test:scope`
Expected: cả hai PASS. Hành vi chủ cũ không đổi vì ALS chưa được set ở đâu (fallback DATA_ROOT).

- [ ] **Step 6: Commit**

```bash
git add api/mcp.ts
git commit -m "refactor: dataRoot() qua AsyncLocalStorage, giu nguyen hanh vi"
```

---

### Task 3: Phân giải scope cho endpoint MCP `/api/mcp`

Xác thực khoá theo từng tài khoản và chạy tool trong đúng kho.

**Files:**
- Modify: `api/mcp.ts` (thêm `getStoredSecretFor`; sửa nhánh MCP trong `export default { fetch }`, dòng ~1712-1749)

**Interfaces:**
- Consumes: `resolveScope`, `alsStore`, `getStoredSecret` (dòng 138), `getAccessToken`/`readPath`
- Produces: `async function getStoredSecretFor(configPath: string): Promise<string | null>`

- [ ] **Step 1: Thêm `getStoredSecretFor`** — chèn ngay sau `getStoredSecret` (sau dòng 150) trong `api/mcp.ts`:

```ts
/**
 * Khoá MCP của một tài khoản bất kỳ, lưu tại <configPath>/mcpSecret.
 * Cache theo từng configPath để không đọc Firebase mỗi request; lỗi đọc cũng cache
 * để kẻ gõ sai khoá liên tục không biến endpoint thành đòn bẩy tải.
 */
const cachedSecrets = new Map<string, { value: string | null; at: number }>();
async function getStoredSecretFor(configPath: string): Promise<string | null> {
  const hit = cachedSecrets.get(configPath);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  try {
    const v = await readPath<unknown>(`${configPath}/mcpSecret`);
    const val = typeof v === 'string' && v.length >= 32 ? v : null;
    cachedSecrets.set(configPath, { value: val, at: Date.now() });
    return val;
  } catch {
    cachedSecrets.set(configPath, { value: null, at: Date.now() });
    return null;
  }
}
```

- [ ] **Step 2: Sửa nhánh xác thực + định tuyến MCP** — thay khối từ dòng 1722 (`const envSecret = ...`) đến dòng 1749 (kết thúc `return mcpHandler(...)`) bằng:

```ts
    const envSecret = process.env.MCP_SECRET;
    const scope = resolveScope(provided || '');
    if (envSecret) {
      let hopLe = provided === envSecret;
      if (!hopLe && provided) {
        // Khoá do app sinh: chủ cũ đọc legacy appConfig/mcpSecret, tài khoản mới đọc theo scope
        const luu = scope.uid === OWNER_UID
          ? await getStoredSecret()
          : await getStoredSecretFor(scope.configPath);
        hopLe = provided === luu;
      }
      if (!hopLe) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Chuẩn hóa URL về /api/mcp để mcp-handler định tuyến đúng, và không để lộ secret xuống dưới
    url.pathname = '/api/mcp';
    url.searchParams.delete('key');

    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();

    // Bơm kho của đúng tài khoản vào cho toàn bộ tool MCP đọc/ghi
    return alsStore.run({ dataRoot: scope.dataRoot }, () =>
      mcpHandler(
        new Request(url.toString(), {
          method: request.method,
          headers: request.headers,
          body,
        })
      )
    );
```

- [ ] **Step 3: Xác nhận không hồi quy chủ cũ**

Run: `npm run test:share && npm run test:scope`
Expected: PASS. (Chủ cũ: `provided` là hex/env → `scope.uid === OWNER_UID` → dataRoot `crmData`.)

- [ ] **Step 4: Commit**

```bash
git add api/mcp.ts
git commit -m "feat: endpoint MCP phan giai khoa -> kho du lieu tung tai khoan"
```

---

### Task 4: Phân giải scope cho endpoint chia sẻ `/api/share`

`xuLyChiaSe` đọc cấu hình, ghi nhật ký, và tải dữ liệu theo đúng tài khoản của token.

**Files:**
- Modify: `api/mcp.ts` (hàm `xuLyChiaSe`, dòng ~1454-1521)

**Interfaces:**
- Consumes: `resolveScope`, `alsStore`, `loadCrm`, `readPath`, `patchPath`

- [ ] **Step 1: Thêm phân giải scope + đổi đường dẫn cấu hình** — sau khi có `token` (dòng 1469-1472), thêm ngay dưới dòng `if (!token) return ...`:

```ts
  const scope = resolveScope(token);
```

Rồi sửa dòng 1474 đọc cấu hình:
```ts
  const cfg = (await readPath<ShareConfig | null>(`${scope.configPath}/share`)) || {};
```

- [ ] **Step 2: Đổi đường dẫn ghi nhật ký và cập nhật cấu hình** — trong `xuLyChiaSe`:
  - Dòng 1501: `await patchPath('shareLog', {` → `await patchPath(scope.shareLogPath, {`
  - Dòng 1512: `await patchPath('appConfig/share', capNhat)` → `await patchPath(`${scope.configPath}/share`, capNhat)` (dùng template string)
  - Dòng 1516: `await patchPath('appConfig/share', { failCount: 0 })` → `await patchPath(`${scope.configPath}/share`, { failCount: 0 })`

- [ ] **Step 3: Tải dữ liệu trong đúng kho** — sửa dòng 1521 `const crm = await loadCrm();` thành:

```ts
  const crm = await alsStore.run({ dataRoot: scope.dataRoot }, () => loadCrm());
```

- [ ] **Step 4: Xác nhận không hồi quy chủ cũ**

Run: `npm run test:share`
Expected: PASS. (Token test là hex thuần → scope chủ cũ → `appConfig/share` + `crmDataTest` như cũ; log vẫn ghi `shareLog`.)

- [ ] **Step 5: Commit**

```bash
git add api/mcp.ts
git commit -m "feat: endpoint chia se phan giai token -> cau hinh + kho tung tai khoan"
```

---

### Task 5: Firebase Security Rules cho nhánh mới

Cho mỗi tài khoản đọc/ghi `appConfig_users/<uid>`, đọc `shareLog_users/<uid>`.

**Files:**
- Modify: `firebase-rules.json` (khối `rules`, thêm sau nhánh `appConfig` ~dòng 103)
- Modify: `firebase-rules-deploy.json` (bản chỉ có `rules` để dán vào Console — thêm cùng nội dung)

**Interfaces:** (không có mã chạy — cấu hình)

- [ ] **Step 1: Thêm 2 nhánh vào `firebase-rules.json`** — trong object `"rules"`, thêm sau nhánh `"appConfig": {...}` (sau dòng 103), trước `"shareLog"`:

```json
    "appConfig_users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "mcpSecret": {
          ".validate": "newData.isString() && newData.val().length >= 32 && newData.val().length <= 200"
        }
      }
    },
    "shareLog_users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": false
      }
    },
```

- [ ] **Step 2: Thêm cùng 2 nhánh vào `firebase-rules-deploy.json`** (đặt ở vị trí tương ứng trong khối `rules`).

- [ ] **Step 3: Cập nhật phần ghi chú `_huong_dan`** trong `firebase-rules.json` — thêm một dòng mô tả:

```
    "- appConfig_users/<uid> va shareLog_users/<uid>: cau hinh share + khoa MCP + nhat ky rieng cua tung tai khoan moi; chi chinh chu doc/ghi (nhat ky chi doc, backend admin ghi).",
```
(chèn vào mảng `_huong_dan`, cạnh dòng mô tả `appConfig`.)

- [ ] **Step 4: Kiểm tra JSON hợp lệ**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase-rules.json','utf8')); JSON.parse(require('fs').readFileSync('firebase-rules-deploy.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`

- [ ] **Step 5: Commit**

```bash
git add firebase-rules.json firebase-rules-deploy.json
git commit -m "feat: rules cho appConfig_users va shareLog_users tung tai khoan"
```

---

### Task 6: Frontend — đọc/ghi cấu hình theo tài khoản + token/khoá mang UID

**Files:**
- Modify: `index.html` (module bridge ~dòng 42-105; hàm share/MCP ~dòng 1972-2249)

**Interfaces:**
- Consumes: `resolveScope` behaviour (token dạng `<uid>.<random>`), `window.__firebase`
- Produces (trên `window.__firebase`): `appConfigBase(): string`, `shareLogBase(): string`, `currentUid(): string`

- [ ] **Step 1: Thêm helper vào module bridge** — trong `<script type="module">`, thêm sau hàm `userDataRef` (sau dòng 46):

```js
  function appConfigBase(){
    const uid = auth.currentUser && auth.currentUser.uid;
    return (!uid || uid === OLD_OWNER_UID) ? 'appConfig' : 'appConfig_users/' + uid;
  }
  function shareLogBase(){
    const uid = auth.currentUser && auth.currentUser.uid;
    return (!uid || uid === OLD_OWNER_UID) ? 'shareLog' : 'shareLog_users/' + uid;
  }
  function currentUid(){
    return (auth.currentUser && auth.currentUser.uid) || '';
  }
```

- [ ] **Step 2: Xuất helper qua `window.__firebase`** — sửa object `window.__firebase` (dòng 99-105), thêm 3 hàm:

```js
  window.__firebase = {
    db, userDataRef, get, set, update, onValue, auth, persistenceOk, logLogin,
    appConfigBase, shareLogBase, currentUid,
    // Trỏ tới một nhánh bất kỳ (dùng cho appConfig/mcpSecret)
    refAt: (path) => ref(db, path),
    signIn: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
    signOut: () => signOut(auth),
  };
```

- [ ] **Step 3: Đổi đường dẫn đọc cấu hình share** — trong `docCauHinhChiaSe` (dòng 1973):

```js
  const snap = await window.__firebase.get(window.__firebase.refAt(window.__firebase.appConfigBase() + '/share'));
```

Và thông báo lỗi ở `renderShareModal` (dòng 1983) đổi thành:
```js
  catch(e){ body.innerHTML = '<div class="mcp-empty">Chưa đọc được cấu hình chia sẻ.</div>'; return; }
```

- [ ] **Step 4: Đổi đường dẫn nhật ký truy cập** — trong `renderShareLog` (dòng 2033):

```js
    const snap = await window.__firebase.get(window.__firebase.refAt(window.__firebase.shareLogBase()));
```

- [ ] **Step 5: Token chia sẻ mang UID + đúng namespace** — trong `taoLinkChiaSe` (dòng 2083-2091):

```js
    await window.__firebase.set(window.__firebase.refAt(window.__firebase.appConfigBase() + '/share'), {
      token: window.__firebase.currentUid() + '.' + chuoiNgauNhien(24),
      salt,
      passHash: await bamMatKhau(salt, pass),
      enabled: true,
      createdAt: new Date().toISOString(),
      failCount: 0,
      lockedUntil: 0,
    });
```

- [ ] **Step 6: Đổi namespace cho đổi mật khẩu / bật tắt** — `doiMatKhauChiaSe` (dòng 2107) và `batTatChiaSe` (dòng 2123): đổi `refAt('appConfig/share')` → `refAt(window.__firebase.appConfigBase() + '/share')` (cả 2 chỗ).

- [ ] **Step 7: Đọc khoá MCP theo namespace** — trong `docKhoaMcp` (dòng 2160):

```js
  const snap = await get(window.__firebase.refAt(window.__firebase.appConfigBase() + '/mcpSecret'));
```

Và thông báo lỗi ở `renderMcpModal` (dòng 2181) đổi thành:
```js
    body.innerHTML = `<div class="mcp-empty">Chưa đọc được khoá kết nối.</div>`;
```

- [ ] **Step 8: Khoá MCP mang UID + đúng namespace** — trong `taoLinkMcp` (dòng 2242):

```js
    await window.__firebase.set(
      window.__firebase.refAt(window.__firebase.appConfigBase() + '/mcpSecret'),
      window.__firebase.currentUid() + '.' + taoKhoaNgauNhien()
    );
```

- [ ] **Step 9: Kiểm tra tĩnh không còn đường dẫn cứng** 

Run: `grep -n "'appConfig/\|'shareLog'\|refAt('appConfig" index.html`
Expected: không còn kết quả nào ở các hàm share/MCP (mọi chỗ đã qua helper). (Ghi chú/bình luận có thể còn nhắc tên nhánh — bỏ qua.)

- [ ] **Step 10: Kiểm thử thủ công** (không tự động được vì cần đăng nhập thật)
  - Đăng nhập bằng **tài khoản mới** → mở "MCP & chia sẻ chỉ xem": không còn báo lỗi "Không đọc được cấu hình"; hiện "Chưa tạo link chia sẻ nào".
  - Tạo link chia sẻ + đặt mật khẩu → copy link (dạng `.../xem?t=<uid>.<hex>`).
  - Mở link ở cửa sổ ẩn danh, nhập mật khẩu → thấy đúng dữ liệu của tài khoản mới (không phải của chủ cũ).
  - Tạo khoá MCP → link dạng `.../api/mcp/<uid>.<hex>`.
  - Đăng nhập lại **chủ cũ** → link/khoá cũ vẫn hoạt động, dữ liệu vẫn là `crmData`.

- [ ] **Step 11: Commit**

```bash
git add index.html
git commit -m "feat: frontend doc/ghi share+MCP theo tung tai khoan, token/khoa mang UID"
```

---

### Task 7: Đồng bộ tài liệu triển khai (SETUP.md)

**Files:**
- Modify: `SETUP.md` (nếu có mô tả nhánh Firebase / rules — cập nhật cho khớp)

- [ ] **Step 1: Đọc `SETUP.md`** tìm phần nói về Security Rules / `appConfig` / dán rules.

Run: `grep -n "appConfig\|rules\|shareLog\|crmData_users" SETUP.md`

- [ ] **Step 2: Cập nhật** phần hướng dẫn dán rules để nhắc thêm `appConfig_users` và `shareLog_users` (nếu `SETUP.md` liệt kê các nhánh). Nếu `SETUP.md` không đề cập chi tiết nhánh, bỏ qua task này.

- [ ] **Step 3: Commit (nếu có thay đổi)**

```bash
git add SETUP.md
git commit -m "docs: cap nhat SETUP cho namespace share/MCP tung tai khoan"
```

---

## Self-Review

**Spec coverage:**
- Mô hình dữ liệu (§1) → Task 5 (rules) + Task 6 (frontend ghi đúng nhánh). ✓
- Backend `resolveScope` (§2) → Task 1. ✓
- ALS threading (§2) → Task 2. ✓
- Xác thực MCP theo user (§2) → Task 3. ✓
- `xuLyChiaSe` theo user (§2) → Task 4. ✓
- Frontend helpers + token/khoá mang UID + thông báo lỗi (§3) → Task 6. ✓
- Rules (§4) → Task 5. ✓
- `xem.html` không đổi (§5) → không có task nào chạm. ✓
- Kiểm thử (§Kiểm thử) → Task 1 (unit), Task 2-4 (regression share.test.ts), Task 6 (thủ công). ✓
- Việc thủ công (dán rules) → nêu ở cuối, nhắc lại trong Task 5. ✓

**Placeholder scan:** Mọi step có mã cụ thể; không có TBD/TODO. ✓

**Type consistency:** `resolveScope` trả `{ uid, dataRoot, configPath, shareLogPath }` — dùng nhất quán ở Task 3 (`scope.configPath`, `scope.uid`, `scope.dataRoot`) và Task 4 (`scope.configPath`, `scope.shareLogPath`, `scope.dataRoot`). `dataRoot()` (hàm) khác `DATA_ROOT` (hằng) — dùng đúng chỗ. Helper frontend `appConfigBase/shareLogBase/currentUid` khớp giữa Step khai báo và Step dùng. ✓

## Việc thủ công sau khi merge
Dán `firebase-rules-deploy.json` (đã thêm `appConfig_users`, `shareLog_users`) vào Firebase Console → Realtime Database → Rules → Publish. Trước bước này, tài khoản mới vẫn báo lỗi quyền dù code đã đúng.
