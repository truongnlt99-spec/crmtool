# Phân quyền tài khoản: người xem, admin — thay link chia sẻ chỉ xem

Ngày: 2026-10-17 · Người quyết định: Trường (admin)

## Vì sao

Sếp đang xem dữ liệu của Trân qua link "chia sẻ chỉ xem" (`xem.html`) và phản hồi là giao diện
không trực quan như app thật. Thay vì làm lại `xem.html`, ta cho sếp **một tài khoản thật** đăng nhập
vào chính `index.html`, thấy giao diện y hệt Trân (pipeline, danh sách, báo cáo, hội thoại…) nhưng
**không sửa được gì**. Đồng thời dựng cơ chế phân quyền để sau này thêm người (sale khác, người quản lý)
mà không phải tạo tay trong Firebase Console.

Người dùng hiện tại: Trân (dùng CRM hằng ngày), sếp (chỉ xem Trân), Trường (admin,
`truongnlt99@gmail.com`).

## Mục tiêu

1. Mỗi tài khoản có hai thuộc tính **độc lập**:
   - **Có kho riêng hay không** (`coKho`): có thì dùng CRM như Trân bây giờ; không thì chỉ đăng nhập để xem người khác.
   - **Được xem ai** (`quyenXem`): danh sách chủ kho mà tài khoản này được xem, **chỉ đọc**.
   Kết hợp được mọi kiểu: chỉ dùng (Trân), chỉ xem (sếp), vừa dùng vừa xem.
2. **Admin** (cờ riêng): xem **và sửa** được kho của mọi tài khoản, quản lý tài khoản.
3. Với mỗi cặp "A xem B", admin tick chọn **3 nhóm** được xem:
   - **CRM**: `crmData*` — lead, pipeline, danh sách, báo cáo/dashboard, việc cần làm, ghi chú, **báo giá** (nằm trong lead).
   - **Hội thoại Zalo**: `zalo*`.
   - **Hồ sơ AI**: `aiData*` (hồ sơ khách + hàng chờ đề xuất).
4. Quyền **chặn thật bằng Firebase Security Rules**, không chỉ ẩn nút. Người xem mở devtools cũng
   không đọc được nhóm không được tick và không ghi được gì vào kho người khác.
5. Màn **Quản trị** trong app (chỉ admin thấy): tạo tài khoản (email + tên + mật khẩu ban đầu),
   bật/tắt kho riêng, gán/thu hồi quyền xem + tick nhóm, khoá/mở khoá tài khoản.
6. Người có quyền xem có **bộ chuyển kho**: "Dữ liệu của tôi" / "Đang xem: Trân" / … Khi đang xem kho
   người khác (không phải admin) → chế độ chỉ xem: mọi điều khiển sửa bị khoá/ẩn, có dải báo rõ
   "Đang xem dữ liệu của Trân — chỉ xem". Tab/khối thuộc nhóm không được tick thì ẩn.
7. **Bỏ hẳn link chia sẻ**: xoá `xem.html`, nhánh `/api/share` trong `api/mcp.ts`, rewrite `/api/share`
   và `/xem` trong `vercel.json`, modal chia sẻ + nhật ký truy cập trong `index.html`, rules `shareLog*`,
   các test chỉ phục vụ share (`test/share.test.ts`, phần share của `test/scope-share.test.ts`) và cập nhật
   `CLAUDE.md` (bỏ mô tả `xem.html`; `hienThiTin()` chỉ còn chép ở 2 nơi).

## Không làm (non-goals)

- Không chuyển dữ liệu của Trân: tài khoản chủ cũ (`OWNER_UID`) giữ nguyên nhánh `crmData`, `zalo`, `aiData`, `appConfig`.
- Không phân quyền nhỏ hơn 3 nhóm (vd. giấu báo giá nhưng cho xem pipeline). Đã cân nhắc và bỏ.
- Không có quyền "xem + sửa" cho người không phải admin.
- Không xem gộp nhiều kho trên một màn (mỗi lúc xem một kho).
- Không cho người xem dùng MCP/extension để đọc kho người khác: MCP và extension Zalo vẫn chỉ đọc/ghi kho của chính chủ khoá.
- Không có màn tự đăng ký; không gửi email mời tự động (Trường tự gửi mật khẩu qua Zalo).
- Không xoá vĩnh viễn tài khoản hay dữ liệu từ app — chỉ khoá.

## Điều cấm (anti-goals — làm thế này là hỏng dù "chạy được")

- Người xem ghi được bất cứ thứ gì vào kho người khác, kể cả các ghi "tự động" của app
  (gắn `ownerUid` cho lead cũ, khởi tạo kho trống, dọn `authLog`, đánh dấu đã đọc…).
- Admin mở kho Trân mà app tự đổi dữ liệu Trân theo danh tính admin — đặc biệt
  [index.html:6163](../../../index.html) đang gắn `ownerUid = window.__authUser.uid` cho lead cũ;
  phải là UID **chủ kho**, không phải người đang đăng nhập.
- Chuyển kho mà dữ liệu kho cũ còn dính trong bộ nhớ/lần lưu đang chờ, rồi bị ghi sang kho mới.
  Đổi kho = huỷ hết listener `onValue`, huỷ `saveTimer`/`pendingRemote`, xoá state, nạp lại từ đầu.
- Ai đó tự cấp quyền cho mình: chỉ admin được ghi các nhánh phân quyền.
- Làm hỏng trải nghiệm hiện tại của Trân: Trân không có quyền xem ai thì không thấy bộ chuyển kho, app như cũ.

## Mô hình dữ liệu (quyết định)

Thêm hai nhánh gốc (tên do builder chốt, ví dụ dưới đây):

```
taiKhoan/<uid>:  { email, ten, coKho: bool, admin: bool, khoa: bool, taoLuc }
quyenXem/<uidNguoiXem>/<uidChuKho>: { crm: bool, zalo: bool, ai: bool, tenChuKho }
```

- `tenChuKho` chép sẵn vào `quyenXem` để người xem hiện được tên trong bộ chuyển kho mà không cần quyền
  đọc `taiKhoan` của người khác.
- Đọc: mỗi người đọc được `taiKhoan/<uid mình>` và `quyenXem/<uid mình>`; admin đọc được tất cả.
- Ghi: **chỉ admin** (qua rules), hoặc backend bằng service account.
- Kho của Trân ánh xạ đặc biệt như hiện có: `uidChuKho === OWNER_UID` → `crmData`/`zalo`/`aiData`; khác → `*_users/<uid>`.
- Bootstrap admin đầu tiên: builder chọn cách (vd. một script chạy bằng service account set
  `taiKhoan/<uid Trường>/admin = true`, hoặc hướng dẫn set tay trong Console). Lấy UID Trường từ Firebase Auth
  theo email `truongnlt99@gmail.com`. Tài khoản Trân và Trường cần bản ghi `taiKhoan` với `coKho: true`.
- Tài khoản chưa có bản ghi `taiKhoan` (dữ liệu cũ) → coi như `coKho: true`, không admin, không xem ai —
  để không ai đang dùng bị khoá ngoài.

## Khoá tài khoản = cắt ngay mọi kênh (Trường quyết định)

Khi admin khoá một tài khoản, người đó mất quyền **ngay lập tức** trên mọi kênh:

- **Rules**: mọi `.read`/`.write` theo `auth.uid` kiểm tra thêm `taiKhoan/<auth.uid>/khoa !== true`.
  Như vậy app đang mở và extension Zalo (đăng nhập Firebase riêng, `extension/background.js`) bị chặn ngay,
  không phải chờ ID token hết hạn.
- **Backend**: khi khoá thì disable user trong Firebase Auth **và** thu hồi refresh token.
- **Khoá MCP**: `api/mcp.ts` đọc DB bằng service account nên rules không chặn được. Backend phải từ chối
  khoá MCP của tài khoản bị khoá (kiểm tra cờ `khoa` của UID trong khoá lúc phân giải scope, hoặc xoá/đổi khoá khi khoá
  tài khoản; builder chọn, nhưng mở khoá tài khoản không được tự bật lại một khoá MCP đã bị lộ).
  Khoá MCP hex thuần (bản cũ, map về chủ cũ) cũng phải theo cờ `khoa` của `OWNER_UID`.
- **Kho của tài khoản bị khoá**: dữ liệu vẫn giữ nguyên; người đang được xem kho đó **vẫn xem được**,
  admin vẫn xem/sửa được.
- Mở khoá: bỏ cờ + enable lại user trong Auth.
- Admin không tự khoá được chính mình (tránh mất admin cuối cùng).

## Security Rules (quyết định hướng, builder viết chi tiết)

Với mỗi nhánh kho (`crmData`, `crmData_users/$uid`, `zalo`, `zalo_users/$uid`, `aiData`, `aiData_users/$uid`):

- `.read`: chủ kho **hoặc** admin **hoặc** `quyenXem/<auth.uid>/<chủ kho>/<nhóm> === true`.
- `.write`: chủ kho **hoặc** admin. Người xem **không bao giờ** ghi.
- Kiểm tra admin: `root.child('taiKhoan/' + auth.uid + '/admin').val() === true`.
- `appConfig*` (khoá MCP): chỉ chủ + admin. Người xem không đọc được.
- `authLog`: thêm quyền đọc cho admin.
- Bỏ `shareLog*`.
- Tài khoản `coKho: false`: builder quyết định có chặn ghi vào kho trống của họ ở rules hay chỉ ẩn trên UI
  (gợi ý: chặn ở rules cho chắc).
- Giữ nguyên toàn bộ `.validate` hiện có.

Nhắc lại: rules **phải dán tay** `firebase-rules-deploy.json` vào Firebase Console. Rules mới chỉ
**thêm** quyền cho admin/người xem, không bớt quyền của chủ kho, nên app cũ vẫn chạy được khi rules mới
lên trước app mới. Builder ghi rõ thứ tự triển khai trong plan.

## Backend (quyết định hướng)

Tạo/khoá tài khoản cần quyền Admin của Firebase Auth → làm ở backend, **trong `api/mcp.ts`** (quy ước
dự án: không tách sang `lib/`). Thêm nhánh kiểu `/api/admin` (rewrite trong `vercel.json`, như `/api/share` cũ):

- Nhận Firebase ID token của người gọi (header), xác minh token, kiểm tra `taiKhoan/<uid>/admin === true`.
- Hành động: tạo user (email, mật khẩu, tên) + ghi `taiKhoan`; khoá/mở khoá (xem mục "Khoá tài khoản").
- Dự án **không dùng `firebase-admin`** (chỉ gọi REST bằng access token service account, xem `getAccessToken()`).
  Builder chọn: dùng Identity Toolkit REST bằng service account, hay thêm `firebase-admin` (lưu ý bundle Vercel).
- Gán quyền xem / bật tắt `coKho` có thể ghi thẳng từ app (rules cho admin ghi) hoặc qua backend — builder chọn,
  nhưng **giữ một đường duy nhất** để dễ kiểm.
- Ghi Firebase luôn PATCH/merge (quy ước dự án).

## App `index.html` (quyết định hướng)

- **Kho hiệu lực**: thay các hàm `userDataRef/zaloBase/aiBase/appConfigBase/currentUid` (đang tính từ
  `auth.currentUser`, [index.html:42-70](../../../index.html)) bằng hàm theo **UID kho đang xem**; mặc định
  là kho của mình (hoặc kho đầu tiên được xem nếu `coKho: false`). Nhớ lựa chọn cuối trong `localStorage` (bọc try/catch).
- **Chế độ chỉ xem** (đang xem kho người khác, không phải admin):
  - chốt chặn **ở tầng ghi** (`saveToCloud`, mọi `update/set` qua `window.__firebase`) — không ghi gì, kể cả ghi tự động;
  - ẩn/khoá nút sửa, kéo thả pipeline, thêm lead, Duyệt/Từ chối đề xuất, chọn phương án báo giá, cài đặt MCP;
  - dải báo cố định "Đang xem dữ liệu của <tên> — chỉ xem".
- **Ẩn theo nhóm**: không có `zalo` → ẩn tab Hội thoại + khối Zalo trong chi tiết lead; không có `ai` → ẩn tab Hồ sơ +
  thẻ đề xuất; nhóm CRM là nền tảng (không có CRM thì cũng không có gì để xem — builder quyết định có cho tick
  Zalo/AI mà không tick CRM không; gợi ý: CRM bắt buộc).
- **Admin đang xem kho người khác**: sửa bình thường như chủ kho. Ghi tự động phải dùng UID chủ kho (xem điều cấm).
- **Màn Quản trị**: chỉ hiện với admin; danh sách tài khoản (email, tên, có kho, đang xem ai, khoá), form tạo
  tài khoản, form gán quyền xem với 3 ô tick, nút khoá/mở khoá, thu hồi quyền.
- Mọi chữ do người dùng nhập (tên, email) vẽ ra HTML phải escape (dự án có test chống XSS cho các khối khác — làm tương tự).

## Kiểm thử (yêu cầu)

- Test hàm thuần (chọn đường dẫn kho theo UID, quyết định quyền hiện tab) không chạm Firebase.
- Test rules: đăng nhập bằng các tài khoản test (chủ, người xem có/không từng nhóm, admin, người lạ) và khẳng định
  đọc/ghi được/không được từng nhánh. Dự án không có emulator; test hiện gọi Firebase thật trên nhánh sandbox
  (`crmDataTest`…). Builder chọn cách test rules (emulator, hoặc tài khoản test trên DB thật sau khi dán rules) và ghi rõ.
- Test khoá: tài khoản bị khoá không đọc/ghi được qua rules, khoá MCP của nó bị từ chối; người xem kho đó vẫn đọc được.
- Test UI chỉ xem bằng Chrome ngầm như các test `.test.html` hiện có: không còn nút sửa, bấm thử không phát lệnh ghi.
- Chạy lại các test hiện có (`npm test`, `test:scope`, `test:mcp-*`…) để chắc không vỡ MCP.

## Để builder quyết định

Tên nhánh/hàm cụ thể, bố cục màn Quản trị, chỗ đặt bộ chuyển kho, cách xác minh ID token, cách bootstrap admin,
cách test rules, thứ tự triển khai, có ghi lịch sử hoạt động "ai sửa" khi admin sửa kho người khác hay không.
