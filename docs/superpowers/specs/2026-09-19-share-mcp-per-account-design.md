# Tách share / MCP / nhật ký truy cập theo từng tài khoản

**Ngày:** 2026-09-19
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan

## Vấn đề

Sau commit `3aa806f` ("Tài khoản mới dùng kho dữ liệu riêng"), **dữ liệu CRM** đã tách theo
tài khoản (`userDataRef()` → `crmData_users/<uid>`), nhưng **cấu hình share/MCP thì chưa**:

- Frontend đọc/ghi `appConfig/share`, `appConfig/mcpSecret`, `shareLog` qua đường dẫn cố định.
- Firebase rules chỉ cho UID chủ cũ `7ePgCPmzxHdEAEazHo9IkyKf2rw2` đọc/ghi `appConfig` và `shareLog`.
- Backend (`/api/share`, `/api/mcp`) **luôn** đọc kho `crmData` của chủ cũ.

Hậu quả: tài khoản mới mở "MCP & chia sẻ chỉ xem" → `get('appConfig/share')` bị Firebase từ
chối (PERMISSION_DENIED) → rơi vào `catch` → hiện *"Không đọc được cấu hình. Kiểm tra mạng rồi
thử lại."* (thông báo sai bản chất — không phải lỗi mạng).

## Mục tiêu

Mỗi tài khoản có **link chia sẻ chỉ xem riêng**, **khoá MCP riêng**, và **nhật ký truy cập
riêng**, đọc đúng kho dữ liệu của chính mình. Chủ cũ giữ nguyên mọi thứ đang chạy.

### Ngoài phạm vi (YAGNI)
- Không làm giao diện quản trị nhiều người.
- Không di chuyển dữ liệu cũ.
- Không đổi `xem.html` (nó chỉ chuyển tiếp token; backend tự phân giải).

## Quyết định cốt lõi: token/khoá tự mang UID

Trang `/xem` và client MCP chỉ gửi lên một chuỗi (token/khoá), không kèm UID. Thay vì thêm một
node chỉ mục `token → uid` (phức tạp, cần rules riêng, rủi ro ghi đè), **nhúng UID vào chính
token/khoá**:

- Token/khoá mới có dạng `<uid>.<random-hex>`.
- Backend tách phần trước dấu `.` để lấy UID → đọc đúng kho.
- Token/khoá cũ dạng hex thuần (không có `.`) → coi là của chủ cũ. **Tương thích ngược.**

UID Firebase là chữ-số, không chứa dấu `.`; random là hex, cũng không có `.`. Nên dấu `.` là
dấu phân tách an toàn.

## Kiến trúc

### 1. Mô hình dữ liệu Firebase

| Loại | Chủ cũ (`7ePg…`) — giữ nguyên | Tài khoản mới |
|---|---|---|
| Cấu hình share | `appConfig/share` | `appConfig_users/<uid>/share` |
| Khoá MCP | `appConfig/mcpSecret` | `appConfig_users/<uid>/mcpSecret` |
| Nhật ký truy cập | `shareLog` | `shareLog_users/<uid>` |
| Dữ liệu CRM | `crmData` | `crmData_users/<uid>` |

### 2. Backend — `api/mcp.ts`

**`resolveScope(chuoi: string)` (export để test):** trả về
```ts
{ uid: string; dataRoot: string; configPath: string; shareLogPath: string }
```
- Có dấu `.` và UID ≠ `OWNER_UID` → `{ uid, dataRoot: 'crmData_users/'+uid,
  configPath: 'appConfig_users/'+uid, shareLogPath: 'shareLog_users/'+uid }`.
- Ngược lại (không có `.`, hoặc UID = chủ cũ) → scope chủ cũ:
  `{ uid: OWNER_UID, dataRoot: DATA_ROOT, configPath: 'appConfig', shareLogPath: 'shareLog' }`.
  (`DATA_ROOT` giữ nguyên = env `FIREBASE_DATA_ROOT` || `crmData`, để test sandbox vẫn chạy.)

**Truyền `dataRoot` theo request bằng `AsyncLocalStorage`:**
- Hiện các tool MCP đóng cứng hằng `DATA_ROOT`. Thêm `const alsStore = new AsyncLocalStorage<{dataRoot: string}>()`.
- Thêm `function dataRoot(): string { return alsStore.getStore()?.dataRoot ?? DATA_ROOT; }`.
- Thay mọi tham chiếu `DATA_ROOT` **bên trong các tool và `loadCrm/logActivity/touch`** bằng `dataRoot()`.
- Trong `fetch` handler nhánh MCP: sau khi xác thực khoá, phân giải scope từ khoá, rồi bọc lời gọi
  `mcpHandler(...)` trong `alsStore.run({ dataRoot: scope.dataRoot }, () => mcpHandler(req))`.

**Xác thực khoá MCP (nhánh MCP trong `fetch`):**
- `MCP_SECRET` (env) và `appConfig/mcpSecret` cũ → luôn khớp chủ cũ (`getStoredSecret` đọc legacy).
- Khoá dạng `<uid>.<hex>`: phân giải UID → đọc `appConfig_users/<uid>/mcpSecret` → so khớp.
  Thêm hàm `getStoredSecretFor(uid)` đọc `${configPath}/mcpSecret` (cache theo uid như cache hiện có).
- Không khớp nguồn nào → 401.

**`xuLyChiaSe`:**
- `const scope = resolveScope(token)` ngay sau khi lấy `token`.
- Đọc cấu hình từ `${scope.configPath}/share` (thay `appConfig/share`).
- Ghi failCount/lockedUntil vào `${scope.configPath}/share`.
- Ghi nhật ký vào `${scope.shareLogPath}` (thay `shareLog`).
- Dựng dữ liệu: chạy `loadCrm()` trong `alsStore.run({ dataRoot: scope.dataRoot }, ...)` để đọc
  đúng kho của user. (Toàn bộ thân hàm sau khi có scope bọc trong `als.run`.)

### 3. Frontend — `index.html`

- Thêm helper (cạnh `userDataRef` hoặc trong app script):
  - `appConfigBase()` → `'appConfig'` nếu `uid === OLD_OWNER_UID`, ngược lại `'appConfig_users/'+uid`.
  - `shareLogBase()` → `'shareLog'` / `'shareLog_users/'+uid`.
- Thay các `refAt('appConfig/share')`, `refAt('appConfig/mcpSecret')`, `refAt('shareLog')`
  (các dòng ~1973, 2033, 2083, 2107, 2123, 2160, 2242) bằng đường dẫn theo helper.
- Bộ sinh token/khoá: prepend `uid + '.'`.
  - `taoLinkChiaSe`: `token: uid + '.' + chuoiNgauNhien(24)`.
  - `taoLinkMcp`: `set(..., uid + '.' + taoKhoaNgauNhien())`.
  - Chủ cũ: token/khoá mới cũng có tiền tố `<OWNER_UID>.` — backend map về scope chủ cũ, nhất quán.
    Link/khoá cũ đang chạy (hex thuần) vẫn hoạt động.
- Sửa thông báo lỗi ở `renderShareModal` và `renderMcpModal`: khi lỗi là permission thì không nói
  "Kiểm tra mạng" — đổi thành thông báo trung tính (vd "Chưa đọc được cấu hình chia sẻ.").

### 4. Firebase rules — `firebase-rules.json` + `firebase-rules-deploy.json`

Thêm 2 nhánh (giữ nguyên `appConfig`, `shareLog`, `crmData`, `crmData_users`):
```json
"appConfig_users": {
  "$uid": {
    ".read":  "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid",
    "mcpSecret": {
      ".validate": "newData.isString() && newData.val().length >= 32 && newData.val().length <= 200"
    }
  }
},
"shareLog_users": {
  "$uid": {
    ".read":  "auth != null && auth.uid === $uid",
    ".write": false
  }
}
```
- Backend dùng service account (admin) → bỏ qua rules khi ghi `shareLog_users` và
  failCount/lockedUntil. `.write:false` chỉ chặn client.
- `mcpSecret` nới trần độ dài lên 200 vì nay có tiền tố `<uid>.`.

### 5. `xem.html`
Không đổi.

## Luồng dữ liệu

**Tài khoản mới tạo link xem:**
1. App ghi `appConfig_users/<uid>/share = { token: '<uid>.<rand>', ... }`.
2. Link gửi đi: `.../xem?t=<uid>.<rand>`.
3. Sếp mở link → `xem.html` POST `/api/share` với token.
4. Backend `resolveScope` → đọc `appConfig_users/<uid>/share`, xác thực, rồi
   `loadCrm()` trong ALS `crmData_users/<uid>` → trả dữ liệu đúng của user đó.
5. Nhật ký ghi vào `shareLog_users/<uid>`; app đọc lại từ đúng nhánh này.

**Tài khoản mới nối MCP:** khoá `<uid>.<rand>` → backend đọc `appConfig_users/<uid>/mcpSecret`
để xác thực, các tool đọc/ghi trong ALS `crmData_users/<uid>`.

## Xử lý lỗi
- Khoá/token sai định dạng hoặc UID không có config → 401/403 như hiện tại.
- ALS không set (đường gọi cũ) → `dataRoot()` fallback về `DATA_ROOT` env → hành vi chủ cũ như cũ.

## Kiểm thử
- **Unit test mới** `test/scope.test.ts`: `resolveScope` với các đầu vào — hex thuần (chủ cũ),
  `<OWNER_UID>.<hex>` (map về scope chủ cũ), `<uid-khác>.<hex>` (kho riêng), chuỗi rỗng/không hợp lệ.
- Chạy lại `test/share.test.ts` (sandbox `crmDataTest`) đảm bảo luồng chủ cũ không hồi quy.
- Kiểm tra thủ công: đăng nhập tài khoản mới → tạo link xem + khoá MCP → mở link ở cửa sổ ẩn danh.

## Việc thủ công sau khi merge
Dán `firebase-rules-deploy.json` mới vào Firebase Console → Realtime Database → Rules → Publish.
