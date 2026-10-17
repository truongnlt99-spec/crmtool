# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dự án

CRM bán hàng (pipeline lead, dashboard, nhắc việc) cho Huyền Trân. App chạy trên Firebase
Realtime Database, deploy qua Vercel từ nhánh `main` lên `https://huyentran.vercel.app`.
Có thêm kết nối MCP để Claude đọc/ghi CRM, và phân quyền tài khoản (admin tạo/khoá tài khoản, gắn quyền xem kho của người khác).

## Cấu trúc lớn (đọc nhiều file mới hiểu)

- **`index.html`** — TOÀN BỘ app web trong một file (module Firebase ở `<head>` + script cổ điển
  phía dưới nói chuyện qua `window.__firebase`). File này **công khai trên GitHub** → tuyệt đối
  không nhúng khoá/bí mật; mọi khoá nằm trong Firebase và chặn bằng Security Rules.
- **`api/mcp.ts`** — Vercel Function phục vụ **hai** endpoint: MCP server (`/api/mcp/<khoá>`) và
  `/api/admin` (nhánh `mode=admin`: `tao` / `khoa` / `moKhoa` tài khoản; xác thực Firebase ID token
  qua Identity Toolkit, chỉ admin được gọi; `khoa` = vô hiệu hoá user Auth + thu hồi token + xoá `mcpSecret`;
  nhánh MCP từ chối khoá của tài khoản bị khoá, không đọc được trạng thái khoá thì trả 503 — fail-closed;
  service account cần quyền Firebase Authentication Admin). Cố ý gộp **tất cả** vào một file:
  Vercel không đóng gói file ngoài thư mục `api/`, `import '../lib/...'` làm function chết. Đừng
  tách sang `lib/`.
- **`web/phan-quyen.js`** — logic thuần phân quyền (`window.PhanQuyen`, nạp trong module Firebase ở `<head>` của `index.html`):
  quyết định kho nào được mở (kho của mình / kho được xem), chế độ chỉ xem, ẩn theo nhóm `crm` / `zalo` / `ai`
  (tick `zalo`/`ai` bắt buộc tick `crm`). Tài khoản không có bản ghi `taiKhoan` → coi như `{ coKho: true, admin: false, khoa: false }`.
  `index.html` có bộ chuyển kho, chế độ chỉ xem (không ghi gì, kể cả seed khi kho trống), màn "Quản trị" cho admin.
  Khi mở kho người khác, app vẫn ghi bằng UID **chủ kho** (không phải UID admin). `scripts/khoi-tao-phan-quyen.mjs`
  tạo bản ghi admin (truongnlt99@gmail.com) + Trân, chạy lại không phá gì.
- **`extension/`** — Chrome extension MV3 (cài unpacked) cho chat.zalo.me: `content.js` đọc IndexedDB + DOM của Zalo web, `background.js` ghi Firebase qua REST, thanh bên gắn lead. `extension/lib/dom-text.js` là chỗ DUY NHẤT đọc nội dung tin từ DOM Zalo; `content.js` chỉ gọi `enrichFromDom()` của nó, đừng tự nội suy chữ trong `content.js`. Quy tắc đọc:
  - tin chữ (kể cả in đậm/nghiêng) → chỉ lấy chữ trong `.text-message__container`;
  - tin file / link xem trước / ảnh có chú thích → `attachmentFromMessage()` gom chữ nhìn thấy trong cả bong bóng + `href`, **cố ý không dựa vào tên class** (Zalo đổi class liên tục) và ngắt dòng theo thẻ khối (DOM thật bị minify, không ngắt thì tên file dính liền dung lượng).
  - Test chạy Chrome thật: `npm run test:zalo-dom` (đọc DOM) và `npm run test:crm-chat` (chạy đúng hàm vẽ bong bóng trích từ `index.html`, có cả test chống XSS).
- **`extension/lib/zalo-map.js`** — hàm thuần dùng chung với `index.html` (nạp bằng `<script type="module">`) và test Node; sửa logic chip/nhãn ở đây. `hienThiTin()` là quy tắc hiện một tin nhắn và bị **chép lại ở 1 nơi không import được**: `api/mcp.ts` (`hienThiZalo`) — sửa một chỗ thì sửa cả hai.
- **`web/ho-so-ai.js`** — logic thuần của hồ sơ khách AI + hàng chờ đề xuất (whitelist ô, đối soát, vẽ HTML có escape). `FIELD_WHITELIST` / `kiemTraGiaTriO` / `giaTriBang` **chép ở 2 nơi**: đây và `api/mcp.ts` — sửa một chỗ thì sửa cả hai (`npm run test:ho-so` chạy cùng bộ ca trên cả hai). Claude chỉ ghi vào `aiData*`; thay đổi vào lead chỉ xảy ra khi Trân duyệt — bấm Duyệt trong app, hoặc bảo Claude trong chat (`approve_proposal` / `reject_proposal`; prompt `cap-nhat-ho-so` cấm Claude tự gọi hai tool này).
- **`web/bao-gia.js`** — logic thuần khối "Báo giá" trong chi tiết lead. Báo giá Trân làm trên claude.ai được lưu qua tool MCP `save_quote` vào **chính lead** (`leads/<id>/baoGia/<baoGiaId>`, bản mới nhất = `taoLuc` lớn nhất). Server kiểm tra phép tính và tự sinh đề xuất (doanh thu, ngày cưới, gói, việc nhắc hạn ưu đãi) vào hàng chờ — `save_quote` không sửa ô nào của lead. Báo giá có thể nhiều phương án (`phuongAn[]`, buổi dùng chung ở `buoi`): lưu thì chưa đề xuất doanh thu/gói; khách chọn trong app (nút → cập nhật thẳng doanh thu + gói) hoặc qua tool `chon_phuong_an` (tạo đề xuất). `khopGoi` **chép 2 nơi** (đây và `api/mcp.ts`), còn danh sách gói `PACKAGES` có ở **3 nơi** (`index.html`, `api/mcp.ts`, `web/bao-gia.js`) — sửa một chỗ thì sửa cả ba.
- **`web/bang-lead.js`** — logic thuần của view "Danh sách" (bảng lead kiểu Excel): định nghĩa cột, lọc,
  sắp xếp, dòng tổng, dòng xuất Excel, đọc cài đặt. `index.html` nạp bằng `<script type="module">`
  (`window.BangLead`); phần giao diện nằm ở khối `RENDER: DANH SÁCH` trong `index.html`. Thêm cột mới:
  thêm vào `COT` ở đây, rồi (nếu cần hiển thị đặc biệt) vào `oBangHtml()`.
- **`firebase-rules.json`** (có `_huong_dan`) và **`firebase-rules-deploy.json`** (chỉ `rules`) —
  Security Rules sống trong repo để đọc/ghi chú. **Phải dán tay** `firebase-rules-deploy.json` vào
  Firebase Console → Realtime Database → Rules → Publish; đổi rules trong repo KHÔNG tự có hiệu lực.

## Mô hình dữ liệu tách theo tài khoản (điểm mấu chốt)

Mỗi tài khoản có kho riêng, chặn bằng rules theo UID:

| | Chủ cũ (`OWNER_UID`) | Tài khoản khác |
|---|---|---|
| Dữ liệu CRM | `crmData` | `crmData_users/<uid>` |
| Khoá MCP | `appConfig` | `appConfig_users/<uid>` |
| Dữ liệu extension Zalo | `zalo` | `zalo_users/<uid>` |
| Hồ sơ khách + đề xuất do Claude ghi | `aiData` | `aiData_users/<uid>` |
| Hồ sơ phân quyền (admin, khoá, kho) | `taiKhoan/<uid>` (dùng chung) | |
| Quyền xem kho người khác | `quyenXem/<uid>/<uidChuKho>` (dùng chung) | |

- `OWNER_UID = 7ePgCPmzxHdEAEazHo9IkyKf2rw2`. Hằng này lặp ở **4 nơi phải khớp nhau**: `api/mcp.ts` (`OWNER_UID`), `index.html` (`OLD_OWNER_UID`), `extension/lib/config.js` (`OWNER_UID`) và `firebase-rules*.json`. Đổi một chỗ là phải đổi cả bốn.
- **Khoá MCP tự mang UID**: dạng `<uid>.<random>`. Backend `resolveScope()` tách
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
npm run test:scope       # test/scope.test.ts — resolveScope, hàm thuần, KHÔNG chạm Firebase
npm run test:ky          # test/khoang-thoi-gian.test.ts — bộ lọc tuần/tháng/quý/năm
npm run audit            # test/audit.ts
npm run test:zalo        # test/zalo-map + zalo-fb — hàm thuần extension, KHÔNG chạm Firebase
npm run test:zalo-db     # test/zalo-rtdb.test.ts — cách ghi của extension trên sandbox zaloTest
npm run test:zalo-dom    # test/zalo-dom.test.ts — đọc DOM Zalo (chạy Chrome ngầm, KHÔNG cần mạng)
npm run test:crm-chat    # test/crm-bong-bong.test.html — hàm vẽ bong bóng chat của index.html (Chrome ngầm)
npm run test:zalo-tinh   # test/zalo-ext-static.test.ts — kiểm tra tĩnh extension (thiếu import, manifest, ký tự lạ)
npm run test:bang        # test/bang-lead.test.ts — logic thuần bảng Danh sách (lọc/sắp xếp/xuất), KHÔNG chạm Firebase
npm run test:mcp-zalo    # test/mcp-hoi-thoai.test.ts — tool MCP đọc hội thoại Zalo (sandbox crmDataTest + zaloTest)
npm run test:ho-so       # test/ho-so-ai.test.ts — hàm thuần hồ sơ AI (server + web), KHÔNG chạm Firebase
npm run test:mcp-ho-so   # test/mcp-ho-so.test.ts — tool + prompt hồ sơ AI (sandbox crmDataTest + zaloTest + aiDataTest)
npm run test:ho-so-ui    # test/ho-so-ai.test.html — vẽ tab Hồ sơ + thẻ đề xuất, chống XSS (Chrome ngầm)
npm run test:bao-gia     # test/bao-gia.test.ts — hàm thuần báo giá (phép tính, khớp gói, đề xuất), KHÔNG chạm Firebase
npm run test:mcp-bao-gia # test/mcp-bao-gia.test.ts — tool save_quote (sandbox crmDataTest + aiDataTest)
npm run test:bao-gia-ui  # test/bao-gia.test.html — vẽ khối Báo giá, chống XSS (Chrome ngầm)
npm run test:phan-quyen  # test/phan-quyen.test.ts — hàm thuần web/phan-quyen.js, KHÔNG chạm Firebase
npm run test:rules-tinh  # test/rules-tinh.test.ts — kiểm tra tĩnh firebase-rules*.json (khoá, taiKhoan, quyenXem), KHÔNG chạm Firebase
npm run test:admin       # test/admin-api.test.ts — /api/admin (tạo/khoá/mở khoá) + MCP chặn khoá của tài khoản bị khoá
npm run test:rules-that  # test/rules-that.test.ts — rules THẬT trên Firebase: chỉ chạy SAU KHI đã dán firebase-rules-deploy.json
npm run test:phan-quyen-ui # test/phan-quyen-ui.test.html — bộ chuyển kho, chỉ xem, màn Quản trị, chống XSS (Chrome ngầm)
npm run test:html-tinh   # test/html-tinh.test.ts — node --check mọi <script> nội tuyến của index.html (bắt lỗi cú pháp), KHÔNG chạm mạng
```

Chạy một test lẻ: `node test/<tên>.test.ts`.

## Quy ước

- **KHÔNG bao giờ ghi file ra Desktop hay chỗ khác ngoài project.** File gửi người dùng (ZIP extension…)
  để trong project: `npm run dong-goi` tạo `ban-phat-hanh/HayDay-CRM-Zalo-v<version>.zip` (bản cũ tự dồn
  vào `ban-phat-hanh/cu/`). Thư mục `ban-phat-hanh/` nằm trong `.gitignore`.
  Hướng dẫn cài cho người dùng: `extension/HUONG-DAN-CAI-DAT.txt` (được gói kèm vào ZIP).
- **Commit bằng tiếng Việt KHÔNG dấu** (theo lịch sử git: "Sua o...", "Bo cac dau hieu...").
- Ghi Firebase luôn dùng PATCH/merge (`patchPath`), không PUT đè cả nhánh — app web và MCP ghi song song.
- Biến môi trường (đặt trên Vercel): `FIREBASE_SERVICE_ACCOUNT` (bắt buộc để rules ăn), `MCP_SECRET`
  (khoá gốc MCP), `FIREBASE_DATA_ROOT` (đổi nhánh test), `FIREBASE_DB_URL`, `CRM_OWNER_UID`.
- `SETUP.md` là hướng dẫn triển khai đầy đủ (Vercel, service account, dán rules, thêm connector).
- Tài liệu thiết kế/plan nằm ở `docs/superpowers/specs/` và `docs/superpowers/plans/`.
