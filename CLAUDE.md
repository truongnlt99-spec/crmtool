# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

CRM bán hàng (pipeline lead, dashboard, nhắc việc) cho Huyền Trân. App chạy trên Firebase
Realtime Database, deploy qua Vercel từ nhánh `main` lên `https://huyentran.vercel.app`.
Có thêm kết nối MCP để Claude đọc/ghi CRM, và link "chia sẻ chỉ xem" cho người ngoài.

## Cấu trúc lớn (đọc nhiều file mới hiểu)

- **`index.html`** — TOÀN BỘ app web trong một file (module Firebase ở `<head>` + script cổ điển
  phía dưới nói chuyện qua `window.__firebase`). File này **công khai trên GitHub** → tuyệt đối
  không nhúng khoá/bí mật; mọi khoá nằm trong Firebase và chặn bằng Security Rules.
- **`api/mcp.ts`** — Vercel Function phục vụ **hai** endpoint: MCP server (`/api/mcp/<khoá>`) và
  backend cho link chia sẻ (`/api/share`, gọi từ `xem.html`). Cố ý gộp **tất cả** vào một file:
  Vercel không đóng gói file ngoài thư mục `api/`, `import '../lib/...'` làm function chết. Đừng
  tách sang `lib/`.
- **`xem.html`** — trang chỉ xem cho người ngoài; chỉ POST token lên `/api/share`, không chạm
  Firebase. Backend là bên duy nhất đọc DB.
- **`extension/`** —  là chỗ DUY NHẤT đọc nội dung tin từ DOM Zalo (có test chạy Chrome thật: `npm run test:zalo-dom`) — Chrome extension MV3 (cài unpacked) cho chat.zalo.me: `content.js` đọc IndexedDB + DOM của Zalo web, `background.js` ghi Firebase qua REST, thanh bên gắn lead. `extension/lib/zalo-map.js` là hàm thuần dùng chung với `index.html` (nạp bằng `<script type="module">`) và test Node — sửa logic chip/nhãn ở đây.
- **`firebase-rules.json`** (có `_huong_dan`) và **`firebase-rules-deploy.json`** (chỉ `rules`) —
  Security Rules sống trong repo để đọc/ghi chú. **Phải dán tay** `firebase-rules-deploy.json` vào
  Firebase Console → Realtime Database → Rules → Publish; đổi rules trong repo KHÔNG tự có hiệu lực.

## Mô hình dữ liệu tách theo tài khoản (điểm mấu chốt)

Mỗi tài khoản có kho riêng, chặn bằng rules theo UID:

| | Chủ cũ (`OWNER_UID`) | Tài khoản khác |
|---|---|---|
| Dữ liệu CRM | `crmData` | `crmData_users/<uid>` |
| Cấu hình share + khoá MCP | `appConfig` | `appConfig_users/<uid>` |
| Nhật ký truy cập link | `shareLog` | `shareLog_users/<uid>` |
| Dữ liệu extension Zalo | `zalo` | `zalo_users/<uid>` |

- `OWNER_UID = 7ePgCPmzxHdEAEazHo9IkyKf2rw2`. Hằng này lặp ở **4 nơi phải khớp nhau**: `api/mcp.ts` (`OWNER_UID`), `index.html` (`OLD_OWNER_UID`), `extension/lib/config.js` (`OWNER_UID`) và `firebase-rules*.json`. Đổi một chỗ là phải đổi cả bốn.
- **Token chia sẻ và khoá MCP tự mang UID**: dạng `<uid>.<random>`. Backend `resolveScope()` tách
  phần trước dấu `.` để biết đọc kho nào. Token/khoá **hex thuần** (không có `.`) là bản cũ → map về chủ cũ.
- Backend truyền kho hiệu lực theo từng request bằng `AsyncLocalStorage` (`alsStore`): các tool MCP và
  `loadCrm()` đọc qua **`dataRoot()`**, KHÔNG dùng hằng `DATA_ROOT` trực tiếp. Handler `fetch` phân giải
  khoá → `alsStore.run({ dataRoot }, ...)`. Khi thêm tool đọc/ghi mới, dùng `dataRoot()`.

## Test

Chạy bằng Node ≥20 (chạy thẳng `.ts`). Cần `.env.local` chứa `FIREBASE_SERVICE_ACCOUNT` (JSON service
account) — các test **gọi Firebase thật**, dùng nhánh sandbox `crmDataTest`, không hermetic nên thỉnh
thoảng flaky vì mạng → **chạy lại** trước khi kết luận là lỗi thật.

```bash
npm test                 # test/write-tools.test.ts — các tool MCP ghi (sandbox crmDataTest)
npm run test:share       # test/share.test.ts — luồng link chia sẻ (chủ cũ)
npm run test:scope       # test/scope.test.ts — resolveScope, hàm thuần, KHÔNG chạm Firebase
npm run test:scope-share # test/scope-share.test.ts — cách ly dữ liệu giữa các tài khoản
npm run test:ky          # test/khoang-thoi-gian.test.ts — bộ lọc tuần/tháng/quý/năm
npm run audit            # test/audit.ts
npm run test:zalo        # test/zalo-map + zalo-fb — hàm thuần extension, KHÔNG chạm Firebase
npm run test:zalo-db     # test/zalo-rtdb.test.ts — cách ghi của extension trên sandbox zaloTest
npm run test:zalo-dom    # test/zalo-dom.test.ts — đọc DOM Zalo (chạy Chrome ngầm, KHÔNG cần mạng)
npm run test:mcp-zalo    # test/mcp-hoi-thoai.test.ts — tool MCP đọc hội thoại Zalo (sandbox crmDataTest + zaloTest)
```

Chạy một test lẻ: `node test/<tên>.test.ts`.

## Quy ước

- **Commit bằng tiếng Việt KHÔNG dấu** (theo lịch sử git: "Sua o...", "Bo cac dau hieu...").
- Ghi Firebase luôn dùng PATCH/merge (`patchPath`), không PUT đè cả nhánh — app web và MCP ghi song song.
- Biến môi trường (đặt trên Vercel): `FIREBASE_SERVICE_ACCOUNT` (bắt buộc để rules ăn), `MCP_SECRET`
  (khoá gốc MCP), `FIREBASE_DATA_ROOT` (đổi nhánh test), `FIREBASE_DB_URL`, `CRM_OWNER_UID`.
- `SETUP.md` là hướng dẫn triển khai đầy đủ (Vercel, service account, dán rules, thêm connector).
- Tài liệu thiết kế/plan nằm ở `docs/superpowers/specs/` và `docs/superpowers/plans/`.
