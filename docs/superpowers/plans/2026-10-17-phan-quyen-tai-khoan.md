# Phân quyền tài khoản — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tài khoản thật cho người xem (chỉ đọc, theo 3 nhóm), admin xem + sửa mọi kho, màn Quản trị tạo/khoá tài khoản; khoá là cắt ngay mọi kênh; bỏ link chia sẻ.

**Architecture:** Phân quyền nằm trong DB (`taiKhoan/<uid>`, `quyenXem/<người xem>/<chủ kho>`) và được **Security Rules** thực thi. `index.html` chọn "kho đang xem" lúc khởi động (đổi kho = lưu lựa chọn rồi tải lại trang, nên không thể dính state kho cũ). Tạo/khoá tài khoản đi qua nhánh `/api/admin` mới trong `api/mcp.ts`, gọi Identity Toolkit REST bằng service account (không thêm `firebase-admin`). Logic thuần nằm ở `web/phan-quyen.js`, test bằng Node.

**Tech Stack:** Firebase RTDB + Auth (SDK 12.17.0 trong trình duyệt, REST ở backend), Vercel Function (`api/mcp.ts`), Node ≥20 chạy thẳng `.ts`, Chrome ngầm cho test UI.

**Spec:** `docs/superpowers/specs/2026-10-17-phan-quyen-tai-khoan-design.md`

## Global Constraints

- Không tách code backend ra ngoài `api/mcp.ts` (Vercel không đóng gói file ngoài `api/`).
- Không nhúng bí mật vào `index.html` / `web/*.js` (công khai trên GitHub). API key web `AIzaSyDT8jy6J5ohBbnJxZdrOnZhyI57D2ZRDhQ` là công khai, dùng được.
- `OWNER_UID = 7ePgCPmzxHdEAEazHo9IkyKf2rw2` là Trân; kho của Trân giữ nguyên `crmData`/`zalo`/`aiData`/`appConfig`. Hằng này lặp 4 nơi, không đổi.
- Ghi Firebase luôn PATCH/merge, không PUT đè nhánh.
- Commit tiếng Việt không dấu, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Làm trên nhánh `phan-quyen-tai-khoan`. Merge vào `main` = deploy production, nên **chỉ Trường merge**.
- Rules đổi trong repo không tự có hiệu lực: Trường phải dán `firebase-rules-deploy.json` vào Console. Mọi task có test rules thật đều ghi rõ bước này.
- Tài khoản không có bản ghi `taiKhoan` → coi như `{ coKho: true, admin: false, khoa: false }`.
- 3 nhóm quyền xem: `crm`, `zalo`, `ai`. Tick `zalo`/`ai` thì bắt buộc tick `crm` (quyết định trong kế hoạch này, spec để builder chốt).
- Mọi chữ do người dùng nhập vẽ ra HTML phải escape.

## Review Focus

1. **Admin mở kho Trân và app tự ghi bằng UID admin.** Ví dụ gắn `ownerUid` cho lead cũ ([index.html:6163](../../../index.html)), tạo lead mới ([index.html:5308](../../../index.html)). Phải dùng UID chủ kho. Test ở Task 5.
2. **Người xem mở kho trống.** Nhánh "seed" của `initCloudSync` ([index.html:6313](../../../index.html)) đẩy lead trong máy lên. Ở chế độ chỉ xem không được ghi gì. Test ở Task 6.
3. **Kho đã nhớ trong `localStorage` bị thu hồi quyền.** Phải rơi về kho của mình hoặc kho đầu tiên được xem, không được thử đọc rồi treo. Test ở Task 1.
4. **Tài khoản `coKho: false` mà chưa được xem ai.** Phải hiện màn "Chưa được cấp quyền xem dữ liệu nào", không vào app trống (vì vào app trống thì có thể bấm thêm lead). Test ở Task 1 + Task 5.
5. **Bị khoá giữa phiên.** `onValue` bị `permission_denied` thì app phải hạ `cloudLoaded` và hiện thông báo khoá, không hiện danh sách rỗng rồi lỡ ghi đè. Test ở Task 5.

---

### Task 1: Module thuần `web/phan-quyen.js`

**Files:**
- Create: `web/phan-quyen.js`
- Create: `test/phan-quyen.test.ts`
- Modify: `package.json` (thêm `"test:phan-quyen": "node test/phan-quyen.test.ts"`)

**Interfaces:**
- Produces (ESM, không phụ thuộc DOM/Firebase):
  - `quyenTaiKhoan(ban: object|null) -> { coKho: boolean, admin: boolean, khoa: boolean, ten: string, email: string }` (mặc định như Global Constraints)
  - `duongDanKho(chuKhoUid: string, ownerUid: string) -> { crm: string, zalo: string, ai: string, appConfig: string }`
    - owner → `crmData`, `zalo`, `aiData`, `appConfig`; khác → `crmData_users/<uid>`, `zalo_users/<uid>`, `aiData_users/<uid>`, `appConfig_users/<uid>`
  - `danhSachKho({ uid, ownerUid, taiKhoanToi, quyenXemToi, tatCaTaiKhoan }) -> Kho[]`
    với `Kho = { uid, ten, cuaToi: boolean, sua: boolean, nhom: { crm, zalo, ai } }`
    - Kho của mình đứng đầu (nếu `coKho`), `sua: true`, đủ 3 nhóm.
    - Người thường: mỗi mục trong `quyenXemToi` có `crm === true` → `sua: false`, `ten` lấy từ `tenChuKho`. Mục `crm !== true` thì bỏ qua.
    - Admin: thêm mọi tài khoản trong `tatCaTaiKhoan` có `coKho !== false`, cộng thêm `ownerUid` dù không có bản ghi, với `sua: true` và đủ 3 nhóm. Không trùng lặp.
    - Tài khoản `khoa` → trả `[]`.
  - `chonKho(ds: Kho[], uidDaNho: string|null) -> Kho|null`: mục có `uid === uidDaNho`, không có thì `ds[0]`, rỗng thì `null`.
  - `chuanHoaQuyenXem(q) -> { ok: true, gia: { crm, zalo, ai } } | { ok: false, loi: string }`: ép về boolean, `loi` khi `zalo||ai` mà không `crm`, hoặc cả 3 đều false.
  - `escapeHtml(s) -> string` và `veBangTaiKhoan(rows: Array<{ uid, email, ten, coKho, admin, khoa, dangXem: string[] }>) -> string` (HTML bảng cho màn Quản trị, mọi chữ đã escape, mỗi dòng có `data-uid`).

- [ ] **Step 1: Viết test thất bại** trong `test/phan-quyen.test.ts` (cùng kiểu `check(label, cond)` như `test/bang-lead.test.ts`). Các ca:
  - `duongDanKho('7ePg…', '7ePg…').crm === 'crmData'`; `duongDanKho('U2', OWNER).zalo === 'zalo_users/U2'`
  - `quyenTaiKhoan(null)` → `{ coKho: true, admin: false, khoa: false }`
  - Trân (không bản ghi, không quyền xem) → 1 kho, `cuaToi`, `sua`
  - Sếp `{ coKho: false }`, quyền `{ [OWNER]: { crm: true, zalo: false, ai: true, tenChuKho: 'Trân' } }` → 1 kho `{ uid: OWNER, sua: false, nhom: { crm: true, zalo: false, ai: true }, ten: 'Trân' }`
  - Sếp `coKho: false`, không quyền → `[]` (Review Focus 4)
  - Mục quyền `{ crm: false, zalo: true }` → bị bỏ
  - Admin có `tatCaTaiKhoan = { U2: { coKho: true, ten: 'B' }, U3: { coKho: false } }` → kho của mình + OWNER + U2, đều `sua: true`, không có U3
  - Tài khoản `khoa: true` → `[]`
  - `chonKho(ds, 'uid-da-bi-thu-hoi')` → `ds[0]` (Review Focus 3); `chonKho([], 'x') === null`
  - `chuanHoaQuyenXem({ zalo: true })` → `ok: false`; `chuanHoaQuyenXem({ crm: 1 })` → `{ ok: true, gia: { crm: true, zalo: false, ai: false } }`
  - `veBangTaiKhoan([{ ten: '<img src=x onerror=1>', email: 'a"b', … }])` không chứa `<img` và không chứa `"b` chưa escape
- [ ] **Step 2: Chạy `node test/phan-quyen.test.ts`**. Mong đợi: lỗi import (file chưa có).
- [ ] **Step 3: Viết `web/phan-quyen.js`** theo Interfaces.
- [ ] **Step 4: Chạy lại `npm run test:phan-quyen`**. Mong đợi: tất cả `OK`, exit 0.
- [ ] **Step 5: Commit** `Phan quyen: module thuan chon kho va quyen xem`

---

### Task 2: Security Rules + test tĩnh

**Files:**
- Modify: `firebase-rules.json` (giữ `_huong_dan`, cập nhật hướng dẫn), `firebase-rules-deploy.json`
- Create: `test/rules-tinh.test.ts`; `package.json` thêm `"test:rules-tinh"`

**Interfaces:**
- Produces: các nhánh `taiKhoan`, `quyenXem` và quyền đọc/ghi mà Task 3, 5, 7 dựa vào.

Biểu thức dùng chung (chép nguyên văn vào từng chỗ, vì RTDB rules không có hàm):
- `KHONG_KHOA` = `root.child('taiKhoan/' + auth.uid + '/khoa').val() !== true`
- `LA_ADMIN` = `root.child('taiKhoan/' + auth.uid + '/admin').val() === true`
- `XEM(nhom, chu)` = `root.child('quyenXem/' + auth.uid + '/' + <chu> + '/<nhom>').val() === true` (`<chu>` là `$uid`, hoặc chuỗi `'7ePgCPmzxHdEAEazHo9IkyKf2rw2'` ở nhánh chủ cũ)
- `CO_KHO` = `root.child('taiKhoan/' + auth.uid + '/coKho').val() !== false`

Quy tắc:
- `crmData_users/$uid` (nhóm `crm`), `zalo_users/$uid` (`zalo`), `aiData_users/$uid` (`ai`):
  - `.read`: `auth != null && KHONG_KHOA && (auth.uid === $uid || LA_ADMIN || XEM(nhom, $uid))`
  - `.write`: `auth != null && KHONG_KHOA && ((auth.uid === $uid && CO_KHO) || LA_ADMIN)`
  - Giữ nguyên mọi `.validate` / `.indexOn` hiện có.
- `crmData`, `zalo`, `aiData`: y hệt nhưng thay `$uid` bằng UID chủ cũ.
- `appConfig_users/$uid`, `appConfig`: đọc/ghi `auth != null && KHONG_KHOA && (chủ || LA_ADMIN)`, giữ `.validate` của `mcpSecret`.
- `taiKhoan`:
  - `.read`: `LA_ADMIN`
  - `$uid/.read`: `auth.uid === $uid || LA_ADMIN`
  - `.write`: `LA_ADMIN && KHONG_KHOA`
  - `$uid/.validate`: `coKho`, `admin`, `khoa` (nếu có) là boolean; `ten`, `email` là string.
- `quyenXem`:
  - `.read`: `LA_ADMIN`
  - `$nguoiXem/.read`: `auth.uid === $nguoiXem`
  - `.write`: `LA_ADMIN && KHONG_KHOA`
  - `$nguoiXem/$chu/.validate`: `crm/zalo/ai` boolean, `tenChuKho` string.
- `authLog`: `.read` thêm `|| LA_ADMIN`.
- Xoá `shareLog`, `shareLog_users`.

- [ ] **Step 1: Viết `test/rules-tinh.test.ts`** (không chạm mạng), đọc cả hai file JSON:
  - `rules` của `firebase-rules.json` deep-equal `firebase-rules-deploy.json` (bỏ khoá `_huong_dan`)
  - với mỗi cặp (`crmData`↔`crmData_users.$uid`, `zalo`↔`zalo_users.$uid`, `aiData`↔`aiData_users.$uid`, `appConfig`↔`appConfig_users.$uid`): chuỗi `.read`/`.write` của nhánh chủ cũ, sau khi thay `'7ePgCPmzxHdEAEazHo9IkyKf2rw2'` bằng `$uid`, phải bằng nhánh `_users`
  - mọi `.read`/`.write` của 6 nhánh kho và 2 nhánh appConfig đều chứa chuỗi `KHONG_KHOA`
  - `.write` của 6 nhánh kho **không** chứa `quyenXem` (người xem không bao giờ ghi)
  - không còn khoá `shareLog`/`shareLog_users`
- [ ] **Step 2: Chạy `node test/rules-tinh.test.ts`**. Mong đợi: FAIL (rules cũ).
- [ ] **Step 3: Sửa hai file rules** theo quy tắc trên.
- [ ] **Step 4: Chạy lại `npm run test:rules-tinh`**. Mong đợi: tất cả OK.
- [ ] **Step 5: Commit** `Phan quyen: rules cho nguoi xem, admin, khoa tai khoan`

(Test rules trên DB thật nằm ở Task 3, vì cần backend tạo tài khoản test.)

---

### Task 3: Backend `/api/admin`, khoá MCP, script khởi tạo admin, test rules thật

**Files:**
- Modify: `api/mcp.ts` (thêm scope `https://www.googleapis.com/auth/identitytoolkit` vào `SCOPES`; nhánh `mode=admin` trong `fetch`; kiểm tra khoá ở nhánh MCP)
- Modify: `vercel.json` (rewrite `/api/admin` → `/api/mcp?mode=admin`)
- Create: `scripts/khoi-tao-phan-quyen.mjs`
- Create: `test/admin-api.test.ts`, `test/rules-that.test.ts`; `package.json` thêm `"test:admin"`, `"test:rules-that"`

**Interfaces:**
- Consumes: rules của Task 2 (với `test:rules-that`).
- Produces: HTTP `POST /api/admin`, header `Authorization: Bearer <Firebase ID token>`, body JSON:
  - `{ hanhDong: 'tao', email, matKhau, ten, coKho }` → `{ ok: true, uid }`. Tạo user qua `POST https://identitytoolkit.googleapis.com/v1/projects/huyentrancrm/accounts`, rồi PATCH `taiKhoan/<uid>` = `{ email, ten, coKho, admin: false, khoa: false, taoLuc }`.
  - `{ hanhDong: 'khoa', uid }` → `accounts:update { localId, disableUser: true, validSince: <giây hiện tại> }`, PATCH `taiKhoan/<uid>/khoa = true`, PATCH xoá `<appConfig của uid>/mcpSecret` (dùng `duongDan` như `resolveScope`).
  - `{ hanhDong: 'moKhoa', uid }` → `disableUser: false`, `khoa = false`. **Không** khôi phục `mcpSecret`.
  - Lỗi: 401 token sai, 403 người gọi không phải admin hoặc đang bị khoá, 400 dữ liệu sai (email rỗng, mật khẩu < 8 ký tự, `uid` là chính người gọi khi `khoa`), 409 email đã tồn tại. Body lỗi `{ loi: string }` tiếng Việt.
- Xác minh người gọi: `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<API key web>` với `{ idToken }` → `users[0].localId`, từ chối nếu `disabled`. Sau đó đọc `taiKhoan/<uid>` bằng service account.
- Export cho test: `export function kiemTraYeuCauAdmin(body: unknown, uidNguoiGoi: string): { ok: true, yeuCau } | { ok: false, status: 400, loi }`.
- Nhánh MCP: sau khi khoá hợp lệ, nếu khoá **không** phải `MCP_SECRET` env thì đọc `taiKhoan/<scope.uid>/khoa` (không cache). `true` → 401 `{ error: 'Unauthorized' }`. Khoá env `MCP_SECRET` là khoá vận hành của Trường, không bị ảnh hưởng (quyết định trong kế hoạch này).
- `scripts/khoi-tao-phan-quyen.mjs`: đọc `.env.local`, tra UID theo email bằng `accounts:lookup` của Identity Toolkit (service account). PATCH `taiKhoan/<uid Trường>` = `{ email: 'truongnlt99@gmail.com', ten: 'Trường', coKho: true, admin: true, khoa: false }` và `taiKhoan/7ePgCPmzxHdEAEazHo9IkyKf2rw2` = `{ ten: 'Trân', coKho: true, admin: false, khoa: false }` (email lấy từ Auth). Chạy lại không phá gì (chỉ PATCH).

- [ ] **Step 1: Viết `test/admin-api.test.ts`.**
  - Ca thuần `kiemTraYeuCauAdmin`: thiếu `hanhDong` → 400; `tao` mật khẩu 7 ký tự → 400; `khoa` chính mình → 400; `tao` hợp lệ → ok.
  - Ca thật: tạo tài khoản test `pq-admin-<rand>@test.local` qua Identity Toolkit, PATCH `taiKhoan/<nó>/admin = true`, đăng nhập lấy ID token bằng `accounts:signInWithPassword?key=…`, gọi `handler.fetch` với `mode=admin`:
    - `tao` user B → 200, có `uid`, `taiKhoan/B.coKho` đúng
    - gọi lại cùng email → 409
    - user B gọi `tao` → 403
    - admin `khoa` B → `accounts:lookup` B có `disabled: true`, `taiKhoan/B/khoa === true`
    - B đăng nhập → bị từ chối
    - admin `moKhoa` B → B đăng nhập lại được
    - MCP: ghi `appConfig_users/B/mcpSecret = 'B.' + 40 hex`, khoá B, gọi MCP bằng khoá đó → 401, và `mcpSecret` đã bị xoá
  - Dọn: xoá các user test (`accounts:delete`), xoá `taiKhoan/<test>`, `appConfig_users/<test>`.
- [ ] **Step 2: Chạy `node test/admin-api.test.ts`**. Mong đợi: FAIL (chưa có `mode=admin`).
- [ ] **Step 3: Cài đặt nhánh `mode=admin` + `kiemTraYeuCauAdmin` + kiểm tra khoá trong nhánh MCP.** Ghi DB bằng `patchPath` sẵn có.
- [ ] **Step 4: Chạy lại `npm run test:admin`**. Mong đợi: OK. Lỗi 403 từ Identity Toolkit nghĩa là service account thiếu quyền Firebase Auth Admin: dừng lại và báo Trường, đừng đổi IAM.
- [ ] **Step 5: Viết `test/rules-that.test.ts`.** Đầu file in rõ: "Cần dán firebase-rules-deploy.json vào Console trước". Tạo 4 user test: chủ `C`, người xem `X` (`quyenXem/X/C = { crm: true, zalo: false, ai: false }`, `taiKhoan/X.coKho = false`), admin `A`, người lạ `L`. Seed `crmData_users/C/leads/t1`, `zalo_users/C/meta`, `aiData_users/C/briefs/t1` bằng service account. Gọi REST `?auth=<idToken>`, khẳng định:
  - C đọc + ghi cả 3 nhánh của C: được
  - X đọc `crmData_users/C`: được. X đọc `zalo_users/C`, `aiData_users/C`, `appConfig_users/C`: 401. X PATCH `crmData_users/C/leads/t1/name`: 401. X PATCH `crmData_users/X`: 401 (`coKho: false`).
  - X PATCH `quyenXem/X/C/zalo = true`: 401 (không tự cấp quyền)
  - A đọc + PATCH `crmData_users/C`: được. A đọc `taiKhoan`: được.
  - L đọc `crmData_users/C`: 401. L đọc `taiKhoan`: 401.
  - Sau khi PATCH `taiKhoan/C/khoa = true` (service account): C đọc `crmData_users/C` bằng **token cũ** → 401 (cắt ngay). X vẫn đọc được `crmData_users/C`.
  - Dọn sạch user + nhánh test.
- [ ] **Step 6: Dừng và nhờ Trường dán `firebase-rules-deploy.json` vào Console → Publish.** Sau đó chạy `npm run test:rules-that`. Mong đợi: tất cả OK. Test mạng có thể flaky: chạy lại trước khi kết luận lỗi.
- [ ] **Step 7: Nhờ Trường chạy `node scripts/khoi-tao-phan-quyen.mjs`.** Kiểm tra `taiKhoan` có đúng 2 bản ghi.
- [ ] **Step 8: Chạy `npm test && npm run test:scope && npm run test:mcp-ho-so`** để chắc MCP không vỡ.
- [ ] **Step 9: Commit** `Phan quyen: API admin tao/khoa tai khoan, chan khoa MCP khi khoa`

---

### Task 4: Bỏ link chia sẻ

**Files:**
- Delete: `xem.html`, `test/share.test.ts`, `test/scope-share.test.ts`, `test/tim-sdt.test.ts` (`khopSoDienThoai` chỉ phục vụ trang chia sẻ: dùng `grep` xác nhận không còn nơi gọi nào khác trước khi xoá)
- Modify: `api/mcp.ts`: xoá nhánh `mode=share`, `xuLyChiaSe`, `taoPhienXem`, `phienConHieuLuc`, `khoaKyPhien`, `traLoiTimSdt`, `khopSoDienThoai`, `hienThiZalo` nếu chỉ share dùng; bỏ trường `shareLogPath` khỏi `resolveScope`.
- Modify: `vercel.json`: bỏ rewrite `/api/share`, `/xem`.
- Modify: `index.html`: xoá `shareLogBase`, modal chia sẻ (`openShareModal`, `renderShareModal`, `renderShareLog` và HTML của nó), mục menu "Chia sẻ chỉ xem" ([index.html:2502](../../../index.html)).
- Modify: `package.json`: xoá `test:share`, `test:scope-share`, `test:tim-sdt`. Sửa `test/scope.test.ts` nếu đang kiểm `shareLogPath`.

**Interfaces:**
- Produces: `resolveScope(chuoi) -> { uid, dataRoot, configPath }`.

- [ ] **Step 1: Xoá và sửa theo danh sách trên.** Dùng `grep -n "share\|xem.html\|shareLog\|khopSoDienThoai" api/mcp.ts index.html vercel.json test/ CLAUDE.md` để chắc không còn tham chiếu (chữ `share` trong tên tool MCP không liên quan thì giữ).
- [ ] **Step 2: Chạy `npm run test:scope && npm test && npm run test:mcp-zalo && npm run test:crm-chat`**. Mong đợi: OK.
- [ ] **Step 3: Commit** `Bo link chia se chi xem (xem.html, /api/share)`

---

### Task 5: `index.html`: kho hiệu lực, khởi động theo quyền, chuyển kho, khoá giữa phiên

**Files:**
- Modify: `index.html`: khối module `<head>` ([index.html:35-130](../../../index.html)), nạp `web/phan-quyen.js` (`<script type="module">` riêng, `window.PhanQuyen`, cùng kiểu với `BangLead`), luồng `auth-changed` ([index.html:6377](../../../index.html)), `submitAddLead` ([index.html:5308](../../../index.html)), gắn chủ lead cũ ([index.html:6162](../../../index.html)), `initCloudSync` ([index.html:6289](../../../index.html))
- Create: `test/phan-quyen-ui.test.html` (chạy qua `node test/zalo-dom.test.ts test/phan-quyen-ui.test.html`, cùng kiểu `test/crm-bong-bong.test.html` trích hàm từ `index.html`); `package.json` thêm `"test:phan-quyen-ui"`

**Interfaces:**
- Consumes: `PhanQuyen.duongDanKho`, `danhSachKho`, `chonKho` (Task 1). Rules của Task 2.
- Produces (trên `window.__firebase`, dùng ở Task 6–7):
  - `khoUid() -> string`: UID chủ kho đang xem
  - `kho() -> Kho|null`: mục `Kho` đang chọn (có `sua`, `nhom`, `ten`, `cuaToi`)
  - `dsKho() -> Kho[]`
  - `chuyenKho(uid: string) -> void`: ghi `localStorage['khoDangXem'] = uid` (try/catch) rồi `location.reload()`
  - `userDataRef()`, `zaloBase()`, `aiBase()`, `appConfigBase()` giờ tính từ `duongDanKho(khoUid(), OLD_OWNER_UID)`
  - `currentUid()` vẫn là UID người đăng nhập
  - `window.__taiKhoan`: `quyenTaiKhoan(...)` của người đăng nhập

Luồng khởi động sau `auth-changed` có user:
1. Đọc `taiKhoan/<uid>` và `quyenXem/<uid>`. Nếu là admin thì đọc thêm `taiKhoan` toàn bộ.
2. `khoa` → `signOut` + màn khoá báo "Tài khoản đã bị khoá. Liên hệ admin."
3. `danhSachKho` rỗng → màn "Chưa được cấp quyền xem dữ liệu nào" (dùng lại màn khoá, nút Đăng xuất), **không** gọi `startWithCloud`.
4. `chonKho(ds, localStorage.khoDangXem)` → lưu vào state → `startWithCloud()`.

- [ ] **Step 1: Viết `test/phan-quyen-ui.test.html`.** Trích phần gắn chủ lead cũ và `submitAddLead` (hoặc tách hàm nhỏ `chuSoHuuMoi() -> string` trả `khoUid()`, và test hàm đó). Ca:
  - admin (`__authUser.uid = 'A'`) đang ở kho `OWNER` → lead mới và lead cũ được gắn `ownerUid === OWNER` (Review Focus 1)
  - `onValue` lỗi `permission_denied` → `cloudLoaded === false` và hiện thông báo khoá (Review Focus 5)
- [ ] **Step 2: Chạy `npm run test:phan-quyen-ui`**. Mong đợi: FAIL.
- [ ] **Step 3: Cài đặt** các Interfaces và luồng khởi động ở trên. Thêm callback lỗi cho `onValue(dataRef, …)` trong `initCloudSync`: `permission_denied` → `cloudLoaded = false`, hiện màn khoá "Mất quyền truy cập (tài khoản bị khoá hoặc quyền bị thu hồi)".
- [ ] **Step 4: Chạy lại `npm run test:phan-quyen-ui && npm run test:crm-chat && npm run test:ho-so-ui && npm run test:bao-gia-ui`**. Mong đợi: OK.
- [ ] **Step 5: Kiểm tra tay trên preview** (Vercel preview của nhánh, rules đã publish): Trân đăng nhập thấy app y như cũ, không có bộ chuyển kho.
- [ ] **Step 6: Commit** `Phan quyen: app doc kho theo quyen, chuyen kho, chan khi bi khoa`

---

### Task 6: `index.html`: chế độ chỉ xem + ẩn theo nhóm + bộ chuyển kho

**Files:**
- Modify: `index.html` (CSS `body.chi-xem`, dải báo, bộ chuyển kho ở sidebar, chốt chặn ghi)
- Modify: `test/phan-quyen-ui.test.html` (thêm ca)

**Interfaces:**
- Consumes: `window.__firebase.kho()`, `dsKho()`, `chuyenKho()` (Task 5).
- Produces: `window.__chiXem: boolean` (= `kho() && !kho().sua`); class `chi-xem`, `an-zalo`, `an-ai` trên `<body>`.

Yêu cầu:
- **Chốt chặn ghi:**
  - khi `__chiXem`, `window.__firebase.set`/`update` từ chối (trả `Promise.reject(new Error('chi-xem'))`) và `console.warn`;
  - `saveToCloud`/`scheduleSave` return sớm;
  - nhánh seed trong `initCloudSync` không chạy;
  - `logLogin` dùng `set` trong module nên không bị ảnh hưởng.
- **Khoá giao diện** khi `body.chi-xem`:
  - ẩn: nút thêm lead, xoá, kéo thả pipeline (`draggable=false`), Duyệt/Từ chối đề xuất, chọn phương án báo giá, menu "Kết nối Claude", nhắc việc tick hoàn thành;
  - ô nhập trong chi tiết lead: `readonly`/`disabled`.
  - Builder kiểm kê bằng `grep -n "onclick=\|draggable\|contenteditable" index.html` và ghi danh sách vào commit.
- **Dải báo cố định:** `Đang xem dữ liệu của <ten> — chỉ xem` (tên đã escape).
- **Ẩn theo nhóm:**
  - `!nhom.zalo` → ẩn `#navConversations`, khối Zalo trong lead (`renderZaloBlock`), không gắn listener Zalo;
  - `!nhom.ai` → ẩn tab Hồ sơ, thẻ đề xuất, không gắn listener `aiBase()`.
  - Đừng gắn listener vào nhánh không có quyền: rules sẽ trả lỗi và làm bẩn console.
- **Bộ chuyển kho:** chỉ hiện khi `dsKho().length > 1`. Là `<select>` ở sidebar, mỗi mục là "Của tôi" hoặc tên chủ kho; đổi thì gọi `chuyenKho(uid)`. Admin ở kho người khác thì có dải báo khác: `Admin đang xem/sửa dữ liệu của <ten>`, không có `chi-xem`.

- [ ] **Step 1: Thêm ca vào `test/phan-quyen-ui.test.html`:**
  - `__chiXem = true`, DB trống, có lead trong máy → chạy nhánh nạp: không có lời gọi `set`/`update` nào (spy) (Review Focus 2)
  - `__chiXem = true`, gọi `window.__firebase.update(...)` → reject `chi-xem`
  - `body` có `chi-xem` → nút thêm lead (`.btn-primary` ở topbar) có `getComputedStyle(...).display === 'none'`
  - kho có `nhom.zalo = false` → `#navConversations` ẩn
  - tên chủ kho `<img src=x onerror=alert(1)>` → dải báo không tạo thẻ `img`
- [ ] **Step 2: Chạy `npm run test:phan-quyen-ui`**. Mong đợi: FAIL ở các ca mới.
- [ ] **Step 3: Cài đặt** theo Yêu cầu.
- [ ] **Step 4: Chạy lại `npm run test:phan-quyen-ui && npm run test:crm-chat && npm run test:ho-so-ui && npm run test:bao-gia-ui`**. Mong đợi: OK.
- [ ] **Step 5: Commit** `Phan quyen: che do chi xem, an theo nhom, bo chuyen kho`

---

### Task 7: Màn Quản trị

**Files:**
- Modify: `index.html` (mục menu "Quản trị" chỉ admin thấy, modal Quản trị)
- Modify: `test/phan-quyen-ui.test.html`

**Interfaces:**
- Consumes: `PhanQuyen.veBangTaiKhoan`, `chuanHoaQuyenXem` (Task 1). `POST /api/admin` (Task 3). `window.__taiKhoan.admin` (Task 5).
- Produces: hàm `moQuanTri()`, `goiApiAdmin(body) -> Promise<object>` (gửi `Authorization: Bearer ${await auth.currentUser.getIdToken()}`).

Modal gồm:
1. **Bảng tài khoản**: `veBangTaiKhoan` từ `taiKhoan` + `quyenXem` (admin đọc được toàn bộ). Cột: tên, email, có kho, đang xem ai, trạng thái khoá.
2. **Form tạo tài khoản**: email, tên, mật khẩu ban đầu (≥ 8 ký tự), checkbox "Có kho riêng" → `goiApiAdmin({ hanhDong: 'tao', … })`. Xong thì hiện "Đã tạo. Gửi email + mật khẩu cho người dùng qua Zalo".
3. **Mỗi dòng**:
   - bật/tắt "Có kho" → `update(refAt('taiKhoan/<uid>'), { coKho })`;
   - Khoá/Mở khoá → `goiApiAdmin`; ẩn nút Khoá ở dòng của chính mình.
4. **Gán quyền xem**: chọn người xem + chủ kho + 3 ô tick → `chuanHoaQuyenXem`.
   - `ok: false` → hiện `loi`;
   - `ok` → `update(refAt('quyenXem/<xem>/<chu>'), { ...gia, tenChuKho })`.
   - Thu hồi → `update(refAt('quyenXem/<xem>'), { [chu]: null })`.

- [ ] **Step 1: Thêm ca vào test UI:**
  - người không admin → mục menu "Quản trị" không có trong DOM / ẩn
  - tick chỉ Zalo → hiện lỗi, không gọi `update`
  - `goiApiAdmin` trả `{ loi }` → hiện đúng `loi` (đã escape)
- [ ] **Step 2: Chạy `npm run test:phan-quyen-ui`**. Mong đợi: FAIL ở các ca mới.
- [ ] **Step 3: Cài đặt modal.**
- [ ] **Step 4: Chạy lại `npm run test:phan-quyen-ui`**. Mong đợi: OK.
- [ ] **Step 5: Kiểm tra tay trên preview** bằng tài khoản Trường:
  - tạo tài khoản test `coKho: false`, gán xem Trân chỉ nhóm CRM, đăng nhập bằng nó ở cửa sổ ẩn danh → thấy pipeline Trân, không thấy tab Hội thoại, không sửa được;
  - khoá nó → cửa sổ ẩn danh mất quyền ngay;
  - dọn tài khoản test (khoá lại; xoá hẳn trong Console là việc Trường tự làm).
- [ ] **Step 6: Commit** `Phan quyen: man Quan tri tao/khoa tai khoan, gan quyen xem`

---

### Task 8: Tài liệu + chạy toàn bộ test

**Files:**
- Modify: `CLAUDE.md`:
  - bỏ mục `xem.html` và `/api/share`; `hienThiTin()` còn chép ở 2 nơi (`zalo-map.js`, `api/mcp.ts`);
  - thêm `web/phan-quyen.js`, `/api/admin`, bảng dữ liệu thêm `taiKhoan` / `quyenXem`;
  - thêm các lệnh test mới, bỏ lệnh test đã xoá.
- Modify: `SETUP.md`:
  - bỏ phần link chia sẻ;
  - thêm thứ tự triển khai: (1) dán rules → (2) chạy `scripts/khoi-tao-phan-quyen.mjs` → (3) merge PR;
  - ghi chú service account cần quyền Firebase Authentication Admin.

- [ ] **Step 1: Sửa hai file tài liệu.**
- [ ] **Step 2: Chạy toàn bộ:** `npm test && npm run test:scope && npm run test:ky && npm run test:zalo && npm run test:zalo-tinh && npm run test:bang && npm run test:ho-so && npm run test:bao-gia && npm run test:phan-quyen && npm run test:rules-tinh && npm run test:admin && npm run test:rules-that && npm run test:mcp-zalo && npm run test:mcp-ho-so && npm run test:mcp-bao-gia && npm run test:zalo-dom && npm run test:crm-chat && npm run test:ho-so-ui && npm run test:bao-gia-ui && npm run test:phan-quyen-ui`. Mong đợi: tất cả OK (test mạng flaky thì chạy lại riêng test đó).
- [ ] **Step 3: Commit** `Phan quyen: cap nhat CLAUDE.md, SETUP.md`
- [ ] **Step 4: Mở PR** vào `main` (Trường merge). Mô tả PR ghi rõ: rules đã dán chưa, script khởi tạo đã chạy chưa.
