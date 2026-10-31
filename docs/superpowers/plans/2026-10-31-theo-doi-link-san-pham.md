# Theo dõi link sản phẩm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trân tạo link riêng theo khách + sản phẩm YouTube/Facebook (trong app hoặc qua Claude) và xem được số lần mở, thời gian xem, số lần tương tác.

**Architecture:** Toàn bộ server thêm vào `api/mcp.ts` (nhánh `mode=` + 2 tool MCP), không tách file. Số liệu ở `<aiRoot>/linkGui/<token>`, bảng tra `linkXem/<token>` chỉ server đọc. Logic thuần phía web ở `web/link-gui.js`, giao diện trong `index.html` dùng lại `moVenueModal`.

**Tech Stack:** Vercel Function (Node ≥20, chạy thẳng `.ts`), Firebase RTDB REST, JS module thuần, test Node + Chrome ngầm.

**Spec:** `docs/superpowers/specs/2026-10-31-theo-doi-link-san-pham-design.md`, mẫu ở `.superpowers/brainstorm/2521-1793421326/content/tao-link-v1.html` và `trang-khach-v2.html`.

## Global Constraints

- Không tách code server khỏi `api/mcp.ts`. Không thêm dependency. Không đổi Firebase Rules.
- Ghi Firebase bằng `patchPath`, không PUT đè nhánh. Tool MCP đọc qua `dataRoot()` / `aiRoot()`.
- Trang khách và URL không chứa tên khách, UID, giá CRM hay dữ liệu lead. Không lưu IP, user agent.
- Tài khoản chỉ xem (`window.__chiXem`) không thấy nút tạo link.
- Commit tiếng Việt không dấu. Chỉ `git add` file của task; `extension/sidepanel.js` đang sửa dở không thuộc việc này.
- `index.html` công khai: không nhúng khoá mới.
- Hằng dùng chung: `MAX_SP = 10`, nhịp `15` giây, trần `30` phút, `giay` hợp lệ `1..30`, token 10 ký tự `[A-Za-z0-9]`.

## Review Focus

- Video YouTube bị chủ kênh chặn nhúng hoặc đã xoá: trang tự chuyển sang link gốc, khách không kẹt ở khung lỗi (test Task 3).
- Sản phẩm bị xoá hoặc đổi tên sau khi gửi: link vẫn mở, khối lead dùng `tenSp` đã lưu (test Task 2, 6).
- Link Facebook không đổi được hoặc Facebook trả lỗi: vẫn tạo link trong 5 giây, không ném lỗi (test Task 2).
- Hai lượt mở cùng lúc: `soLanMo` tăng đủ 2, không đè nhau (test Task 3).
- `tenSp` có ký tự HTML hoặc dấu nháy: không vỡ trang khách, thẻ OG, modal (test Task 3, 5).
- Trân đổi sang kho người khác: link ghi đúng kho đang xem, tài khoản được xem không ghi được (test Task 2).

---

### Task 1: Logic thuần `web/link-gui.js`

**Files:**
- Create: `web/link-gui.js`, `test/link-gui.test.ts`
- Modify: `package.json`, `api/mcp.ts` (thêm `nhanLink`, gần nhóm hàm thuần), `index.html` (nạp module, `window.LinkGui`, cạnh `import * as Venue`)

**Interfaces:**
- Produces: `MAX_SP`, `nhanLink(s) -> 'quanTam'|'xemQua'|'chuaMo'`, `TEN_NHAN`, `dsTheoLead(linkGui, leadId)`, `thongKeSanPham(linkGui) -> { 'venueId/spId': { daGui, khachMo, tuongTac } }`, `daGuiChoLead(linkGui, leadId, spKeys) -> number`, `locKhach(leads, q, limit = 20)`, `chuoiCopyTatCa(items)`, `thoiLuong(giay)`.

- [ ] **Step 1: Viết test** `test/link-gui.test.ts`, chạy cùng bộ ca `nhanLink` trên cả web và server:

```ts
const ca = [
  [{}, 'chuaMo'],
  [{ soLanMo: 1, tongGiay: 59 }, 'xemQua'],
  [{ soLanMo: 1, tongGiay: 60 }, 'quanTam'],
  [{ soLanMo: 2 }, 'quanTam'],
  [{ soLanMo: 1, soLanTuongTac: 1 }, 'quanTam'],
];
// thongKeSanPham: 2 khách cùng sản phẩm, 1 khách mở 3 lần -> { daGui: 2, khachMo: 1, tuongTac: 0 }
// dsTheoLead: quanTam trước, cùng nhãn thì lanCuoi mới hơn trước, chuaMo cuối
// locKhach: khớp không dấu theo tên và số điện thoại; q rỗng -> bỏ won/lost, updatedAt mới trước, tối đa limit
// chuoiCopyTatCa([{tenSp:'A',url:'u1'},{tenSp:'B',url:'u2'}]) === 'A\nu1\n\nB\nu2'
// thoiLuong: 0 -> '—', 45 -> '45s', 192 -> '3p12s'
```

- [ ] **Step 2: Thêm script** `"test:link-gui": "node test/link-gui.test.ts"`, chạy, kỳ vọng FAIL vì thiếu file.
- [ ] **Step 3: Viết `web/link-gui.js` và `nhanLink` trong `api/mcp.ts`.** Comment "CHÉP Ở 2 NƠI" ở cả hai. Dùng `esc`, `boDau` như `web/venue.js`. Trường thời gian của lead dò `updatedAt` rồi fallback `createdAt`; xác nhận tên trường thật khi viết.
- [ ] **Step 4: Chạy `npm run test:link-gui`**, kỳ vọng toàn OK, `npm run test:html-tinh` OK.
- [ ] **Step 5: Commit** `Link gui: logic thuan nhan, thong ke, loc khach`.

### Task 2: Tạo link phía server

**Files:**
- Modify: `api/mcp.ts`, `vercel.json`, `package.json`
- Create: `test/mcp-link-gui.test.ts`

**Interfaces:**
- Consumes: `nhanLink`.
- Produces:
  - `xacMinhNguoiGoi(request) -> { uid } | Response`: phần 1 của `xuLyAdmin` tách ra, `xuLyAdmin` gọi lại hàm này.
  - `layYoutubeId(link) -> string | null`.
  - `chuanHoaLink(link, f = fetch) -> Promise<{ linkGoc, anh, nenTang: 'facebook'|'youtube'|'khac', ytId }>`.
  - `taoLinkGui(root: string, leadId, dsSp: {venueId, spId}[], origin) -> Promise<Array<{ token, url, tenSp, venueId, spId, daCo, soLanMo } | { venueId, spId, loi }>>`, `root` là data root; dùng cho cả API và tool.
  - `POST /api/link-gui` body `{ khoUid, leadId, dsSp }`, trả `{ ok, ketQua }`.

- [ ] **Step 1: Viết test.** Ca thuần với `f` giả: `share/p` trả 302 `Location: .../hayday.media/posts/pfbidX?rdid=1&share_url=...` thì `linkGoc` bỏ hết query; link `posts/` và `media/set/?set=a.1&type=3` giữ nguyên (`media/set` phải giữ query); `f` ném lỗi hoặc treo quá 5 giây thì `linkGoc` = link vào, không ném; link lạ thì `nenTang: 'khac'` và không gọi `f`; `og:image` lấy được từ HTML, thiếu thì `anh: ''`. YouTube: `watch?v=UrGCdCBCqq4` (kèm `&t=30s`), `youtu.be/UrGCdCBCqq4?si=x`, `m.youtube.com/watch?v=...`, `/shorts/...`, `/live/...`, `/embed/...` đều cho `ytId: 'UrGCdCBCqq4'`, `nenTang: 'youtube'`, `anh` = `https://img.youtube.com/vi/UrGCdCBCqq4/hqdefault.jpg`, không gọi `f`; `/@kenh`, `/playlist?list=x`, ID 10 ký tự, ID chứa `"` đều là `khac`; `notyoutube.com/watch?v=...` là `khac`.

  Ca thật (sandbox `crmDataTest` + `aiDataTest`, dọn `linkXem/<token>` trong `finally`): tạo mới có token đúng regex và `soLanGui: 1`; gọi lại cùng cặp trả cùng token, `daCo: true`, `soLanGui: 2`; sản phẩm đã xoá sau khi tạo vẫn giữ bản ghi; lead sai và `spId` sai trả lỗi; 11 sản phẩm bị từ chối; `khoUid` ép `../x` bị 400. Quyền qua user tạm như `test/admin-api.test.ts`: không token 401, user khác kho 403, user chỉ có `quyenXem` 403, tài khoản khoá 403, admin được.

- [ ] **Step 2: Thêm script `"test:mcp-link-gui"`, chạy, kỳ vọng FAIL.**
- [ ] **Step 3: Tách `xacMinhNguoiGoi`, viết `layYoutubeId` và `chuanHoaLink`.** Xét hostname bằng `new URL`, không dùng `includes`. Facebook gọi `fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(5000) })`. Sau đó GET link cuối, đọc `og:image`, escape `&amp;`.
- [ ] **Step 4: Viết `taoLinkGui`.** Đọc `aiRoot/linkGui` để tìm cặp đã có. Token từ `randomBytes` đổi sang base62. Ghi `linkXem/<token>` = `{ aiRoot, tieuDe: sp.ten, anh, linkGoc, nenTang, ytId }` và `<aiRoot>/linkGui/<token>` = bản ghi trong spec. Gọi `chuanHoaLink` song song cho các sản phẩm.
- [ ] **Step 5: Thêm nhánh `mode=linkGui` trong `fetch` và rewrite `/api/link-gui`.** Quyền bằng đúng điều kiện ghi của rules: không khoá và ((`uid === khoUid` và `coKho !== false`) hoặc admin). `khoUid` kiểm tra `UID_HOP_LE`; kho lấy từ `resolveScope(`${khoUid}.x`)`. Lỗi đọc quyền trả 503.
- [ ] **Step 6: Chạy `npm run test:mcp-link-gui` và `npm run test:admin`**, kỳ vọng OK. Flaky mạng thì chạy lại.
- [ ] **Step 7: Commit** `Link gui: API tao link rieng theo khach + san pham`.

### Task 3: Trang khách và ghi sự kiện

**Files:**
- Modify: `api/mcp.ts`, `vercel.json`, `test/mcp-link-gui.test.ts`, `test/link-gui.test.ts`

**Interfaces:**
- Consumes: `linkXem/<token>`.
- Produces: `veTrangXem({ token, tieuDe, anh, linkGoc, nenTang, ytId }) -> string`, `JS_THEO_DOI`, `kiemTraSuKien(body) -> { t, loai, giay } | null`, `GET /xem/<token>`, `POST /api/xem-su-kien`.

- [ ] **Step 1: Viết test.**
  - `veTrangXem`: `tieuDe` = `"><script>x</script>` không tạo thẻ script lạ; có `og:title`, `og:image` chỉ khi có `anh`; có `<meta name="referrer" content="strict-origin">` (không dùng `no-referrer`: YouTube cần origin, nếu không báo lỗi 153; `strict-origin` vẫn giấu token) và `robots noindex`; `facebook` có iframe `plugins/post.php?href=<encode linkGoc>` và thẻ `<a>` phủ; `youtube` có `youtube-nocookie.com/embed/<ytId>?enablejsapi=1&playsinline=1&rel=0&origin=https://huyentran.vercel.app`, không có lớp phủ; `khac` không có iframe, có `location.replace`; `linkGoc` kiểu `javascript:` không xuất hiện thành href.
  - `JS_THEO_DOI` chạy bằng `node:vm` với `document`, `navigator.sendBeacon`, `setInterval`, `localStorage` giả: tải trang gửi `mo`; `localStorage.crmNoiBo='1'` thì không gửi gì; 2 tick gửi 2 lần `giay:15`; trang ẩn thì không gửi, hiện lại gửi tiếp; qua 120 tick thì dừng; bấm `<a>` gửi `tuongTac`; `sendBeacon` ném lỗi thì script không ném. Với `YT.Player` giả: `PLAYING` lần đầu gửi `tuongTac` đúng 1 lần, phát lại không gửi nữa; `onError` 150 gọi `location.replace(linkGoc)`.
  - `kiemTraSuKien`: `loai` lạ, `giay` 0/31/chuỗi, token sai regex đều `null`.
  - Ca thật: `GET /xem/<token>` 200, không chứa `leadId` hay tên lead; token lạ 404 có chữ "Link không còn hiệu lực"; `mo` x2 chạy song song thì `soLanMo === 2`; `giay` cộng dồn; `tuongTac` tăng `soLanTuongTac`; `lanDau` giữ nguyên lần đầu, `lanCuoi` cập nhật; sự kiện token lạ 404 và không ghi gì.

- [ ] **Step 2: Chạy, kỳ vọng FAIL.**
- [ ] **Step 3: Viết `veTrangXem` + `JS_THEO_DOI`.** Trang nền trắng, không thêm chữ hay logo nào. Iframe `width=100%`, `border:0`, chiều cao `min(160vw, 900px)`, `scrolling="no"`. `<a>` `position:absolute; inset:0`, `rel="noreferrer"`, `aria-label="Xem bài viết trên Facebook"`. Giữ cuộn trang bình thường trên lớp phủ. YouTube nạp `https://www.youtube.com/iframe_api`, gắn `YT.Player` vào iframe có sẵn để thẻ video vẫn hiện nếu API lỗi; Shorts tỉ lệ 9:16, còn lại 16:9. Tracking gói trong `try/catch`, `sendBeacon` gửi `Blob` kiểu `text/plain`.
- [ ] **Step 4: Viết nhánh `mode=xem` và `mode=xemSuKien`, rewrite `/xem/:t` và `/api/xem-su-kien`.** `mode=xem` đọc `linkXem/<t>`, header `Cache-Control: no-store`, `Content-Type: text/html; charset=utf-8`. `mode=xemSuKien` patch `{".sv":{"increment":n}}` và `lanCuoi: {".sv":"timestamp"}`; loại `mo` đọc `lanDau`, chưa có thì ghi timestamp.
- [ ] **Step 5: Chạy `npm run test:link-gui` và `npm run test:mcp-link-gui`**, kỳ vọng OK.
- [ ] **Step 6: Mở trang thật trong preview với 1 link Facebook và 1 link YouTube của Trân** (`UrGCdCBCqq4`), bấm phát, xác nhận số liệu tăng trên sandbox.
- [ ] **Step 7: Commit** `Link gui: trang xem cho khach + ghi su kien`.

### Task 4: Tool MCP

**Files:**
- Modify: `api/mcp.ts:1400-1404`, `test/mcp-link-gui.test.ts`

**Interfaces:**
- Consumes: `taoLinkGui(dataRoot(), ...)`, `nhanLink`.
- Produces: tool `create_product_links({ lead, sanPham: [{ venueId, id }] })`, `get_link_stats({ lead?, venueId?, id? })`.

- [ ] **Step 1: Viết test** dùng `callTool`: `create_product_links` trả `{ tenSp, url }`, url bắt đầu `https://huyentran.vercel.app/xem/`; tìm lead bằng `findLead`, tên trùng nhiều lead thì `isError`; gọi lại không tạo token mới; `get_link_stats` theo lead, theo sản phẩm, toàn kho đều có `nhan`; `find_venue_products` trả `venueId`, `id` đúng tham số `create_product_links`.
- [ ] **Step 2: Chạy, kỳ vọng FAIL.**
- [ ] **Step 3: Thêm 2 tool sau `add_venue_product`.** Mô tả ghi đúng spec: hỏi lại khi trùng tên, không nói đã gửi cho khách, thời gian xem không gồm phần trên Facebook, tương tác là bấm sang Facebook hoặc bấm phát YouTube. `get_link_stats` trả kèm `nenTang`. Origin cố định `https://huyentran.vercel.app`. Kiểm tra `findLead` có báo lỗi khi trùng tên; nếu chỉ lấy dòng đầu thì lọc riêng trong tool, không đổi `findLead`.
- [ ] **Step 4: Sửa mô tả `find_venue_products`** theo spec.
- [ ] **Step 5: Chạy `npm run test:mcp-link-gui` và `npm run test:mcp-venue`**, kỳ vọng OK.
- [ ] **Step 6: Commit** `Link gui: tool MCP tao link va xem so lieu`.

### Task 5: Tạo link trong bảng Sản phẩm

**Files:**
- Modify: `web/venue.js:190-208`, `web/link-gui.js`, `index.html`, `package.json`, `test/venue-ui.test.html`
- Create: `test/link-gui-ui.test.html`

**Interfaces:**
- Consumes: `window.LinkGui`, `/api/link-gui`.
- Produces: `linkGuiData`, `initLinkGui()`, `moChonKhach(dsSp, khachCoSan?)`, `moKetQuaLink(lead, ketQua)`. `veDongSanPham(venue, sp, tones, { chiXem, chon, thongKe })`, `veDongKhach`, `veDongLink` trong `web/link-gui.js`.

- [ ] **Step 1: Viết test.** Trong `venue-ui`: đổi `du 6 cot` thành 10 cột (tick + 3 cột số); có `moChonKhach`; chỉ xem không có ô tick và nút; dòng có link hỏng không có ô tick. Trong `link-gui-ui`: dòng khách hiện nhãn "Đã gửi 1/2 mẫu"; dòng link có `data-url`; `daCo` hiện "Link đã gửi trước đó · khách mở 3 lần"; dòng lỗi có "Thử lại"; `tenSp`/tên khách chứa XSS không tạo thẻ.
- [ ] **Step 2: Thêm script `"test:link-gui-ui": "node test/zalo-dom.test.ts test/link-gui-ui.test.html"`, chạy, kỳ vọng FAIL.**
- [ ] **Step 3: Sửa `veDongSanPham`, thêm cột và ô tick; thêm `veDongKhach`, `veDongLink`.** Bảng cuộn ngang được trên điện thoại như hiện tại.
- [ ] **Step 4: Trong `index.html` viết `initLinkGui()`** theo mẫu `initAI()` (lỗi quyền thì `linkGuiData = {}`, không báo lỗi), gọi cùng chỗ `initAI`. Khi có dữ liệu mới gọi `renderVenue()` nếu `!uiIsBusy()`.
- [ ] **Step 5: Thêm chọn mẫu và thanh chọn.** `venueChon = new Set()`, giữ qua lần `renderVenue`, chặn ở `MAX_SP` kèm thông báo. Thanh "Đã chọn N sản phẩm" dính cuối bảng.
- [ ] **Step 6: Thêm `moChonKhach` và `moKetQuaLink`** dùng `moVenueModal`. Tự focus ô tìm, Enter chọn khách đầu tiên. Gửi `khoUid` từ `window.__firebase` (lộ thêm `khoUid` qua cầu nối). `goiApiAdmin` nhận thêm đường dẫn thay vì chép hàm. Copy có fallback `prompt` như `copyLinkSanPham`. "Thử lại" gọi lại đúng sản phẩm đó. Điện thoại dùng CSS tấm trượt dưới trong `@media` có sẵn, nút cao 44px.
- [ ] **Step 7: Chạy `test:link-gui-ui`, `test:venue-ui`, `test:venue`, `test:html-tinh`**, kỳ vọng OK.
- [ ] **Step 8: Chạy app qua preview, tạo link thật trên dữ liệu test, chụp màn hình** desktop và mobile.
- [ ] **Step 9: Commit** `Link gui: tao link tu bang San pham`.

### Task 6: Khối "Sản phẩm đã gửi" trong lead, tài liệu

**Files:**
- Modify: `web/link-gui.js`, `index.html:4727`, `test/link-gui-ui.test.html`, `CLAUDE.md`, `SETUP.md` nếu cần

**Interfaces:**
- Consumes: `moChonKhach(dsSp, khachCoSan)`, `dsTheoLead`, `nhanLink`.
- Produces: `veKhoiDaGui(ds, { chiXem }) -> string`.

- [ ] **Step 1: Viết test** `veKhoiDaGui`: hiện đủ tên, số lần mở, `thoiLuong`, nhãn; sản phẩm đã xoá vẫn hiện `tenSp`; danh sách rỗng có lời mời "Chưa gửi sản phẩm nào"; chỉ xem không có nút "Gửi sản phẩm"; chống XSS.
- [ ] **Step 2: Chạy, kỳ vọng FAIL.**
- [ ] **Step 3: Thêm khối** ngay sau khối Báo giá, dùng `toggleKhoiChiTiet`. Nút "Gửi sản phẩm" mở modal chọn mẫu với khách có sẵn, mẫu đúng `lead.venueId` lên đầu, chọn xong sang `moKetQuaLink`.
- [ ] **Step 4: Đặt `localStorage.crmNoiBo='1'`** sau đăng nhập, trong `try/catch`.
- [ ] **Step 5: Cập nhật `CLAUDE.md`:** mô tả `web/link-gui.js`, `linkXem`, `linkGui`, `nhanLink` chép 2 nơi, các lệnh test mới.
- [ ] **Step 6: Chạy toàn bộ:** `test:link-gui`, `test:link-gui-ui`, `test:mcp-link-gui`, `test:venue-ui`, `test:mcp-venue`, `test:admin`, `test:html-tinh`, `test:scope`. Kỳ vọng OK.
- [ ] **Step 7: Commit** `Link gui: khoi san pham da gui trong lead, cap nhat tai lieu`.
- [ ] **Step 8: Tạo PR.** Trong PR ghi việc còn phải thử tay: mở link từ Zalo iOS và Android trên máy thật, kiểm tra thẻ xem trước và bài nhúng trước khi Trân dùng.
