# Thiết kế: Extension Zalo web → HayDay CRM (thanh bên + đồng bộ tin nhắn)

Ngày: 2026-09-22 · Thay thế: `2026-09-12-crm-hoi-thoai-design.md` (luồng dán tay; giữ lại phần giao diện bong bóng chat)

## 1. Bối cảnh

- Huyền Trân chat với khách chủ yếu qua Zalo. Zalo chỉ cho **một phiên máy tính (PC hoặc web) + điện thoại** → dùng extension thì chị **chuyển từ Zalo PC sang chat.zalo.me** (Trường đã chấp nhận).
- Extension riêng tư, cài dạng unpacked (developer mode), không lên Chrome Web Store.
- Không dùng zca-js, không đăng nhập Zalo hộ, không tự mở hội thoại.

## 2. Kết quả thử thật trên chat.zalo.me (2026-09-22, chỉ đọc)

| Nguồn | Có gì | Ghi chú |
|---|---|---|
| IndexedDB `zdb_<myUid>`, store `message` (keyPath `msgId`) | `toUid` = **mã hội thoại** (số = chat 1-1, tức userId người kia; `g<số>` = nhóm), `fromUid` (`"0"` = mình), `msgId`, `cliMsgId`, `sendDttm` (ms, chuỗi), `msgType`, `originMsgType` | Chỉ mục: `cliMsgIdIndex`, `userId_sendDttm_msgId` = `[toUid, sendDttm, msgId]` |
| Cùng store, trường `message` | **Nội dung đã mã hoá** (base64, độ dài bội 16) | KHÔNG giải mã |
| store `preview_message` (keyPath `convId`, index `messageTime`) | Tin cuối của mỗi hội thoại + thời điểm | Dùng để biết hội thoại nào vừa có tin |
| store `friend` / `group` / `conversation` | Tên hiển thị, isGroup; `phoneNumber` hầu như trống (22/730) | SĐT không dùng làm khoá khớp |
| DOM hội thoại đang mở | `.chat-message[id="bb_msg_id_<cliMsgId>"]`, chữ ở `span.text`, trích dẫn `.message-quote-fragment__title/__description` | Khớp 15/15 với IndexedDB qua `cliMsgIdIndex` |
| DOM danh sách | `.msg-item[anim-data-id=<convId>]`, ảo hoá (~11 mục), preview bị cắt ~42 ký tự | Không dùng lấy nội dung |

Zalo web khi đăng nhập tự đồng bộ ~15 ngày lịch sử (kể cả tin qua điện thoại) và ghi tin mới vào IndexedDB ngay khi đến, với **mọi** hội thoại.

**Hệ quả thiết kế:** siêu dữ liệu (ai, khi nào, chiều nào, loại tin) lấy từ IndexedDB cho mọi hội thoại; **chữ chỉ có với tin hiển thị trong hội thoại chị tự mở**. Tin chưa có chữ vẫn được lưu (chữ `null`) và tự bù chữ khi chị mở hội thoại đó.

## 3. Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | Giao diện chính trên Zalo: **thanh bên Chrome (`chrome.sidePanel`)**, chỉ bật cho tab chat.zalo.me. |
| D2 | Phạm vi thanh bên v1 = mockup đã duyệt: gắn lead (tạo mới / gắn lead có sẵn / không phải khách), thẻ lead, **đổi giai đoạn**, **ghi chú nhanh**, chip "khách chờ trả lời". Các sửa đổi khác làm trong CRM. |
| D3 | **Chỉ hội thoại đã gắn lead mới được tải lên Firebase.** Hội thoại chưa phân loại hoặc "không phải khách" không bao giờ rời trình duyệt. |
| D4 | Gắn lead theo **mã hội thoại Zalo** (`convId`), không theo SĐT. Một lead gắn được nhiều hội thoại (cô dâu, chú rể, nhóm). |
| D5 | Khi gắn một hội thoại, nhập luôn phần lịch sử đang có trong IndexedDB của hội thoại đó (siêu dữ liệu; chữ nếu đang hiển thị). |
| D6 | Không tự mở hội thoại để lấy chữ (sẽ gửi "đã xem" cho khách). |
| D7 | Sếp xem được chat trên trang chia sẻ (đã chốt 12/09) — làm ở giai đoạn 2 của plan. |
| D8 | Tóm tắt bằng Claude/MCP: ngoài phạm vi. |

## 4. Dữ liệu trên Firebase

Theo quy ước tách tài khoản của repo: chủ cũ (`7ePgCPmzxHdEAEazHo9IkyKf2rw2`) dùng `zalo`, tài khoản khác dùng `zalo_users/<uid>`. Gọi chung là `ZROOT`. Nằm **ngoài** `crmData` để app không phải tải toàn bộ chat mỗi lần mở.

```
ZROOT/links/{convId}
  { status: "lead" | "ignored", leadId: "L…" | null, name, isGroup, linkedAt: ms }

ZROOT/meta/{convId}
  { name, isGroup, leadId, firstAt, lastAt, lastCustomerAt, lastMeAt, updatedAt }   // thời gian = ms

ZROOT/msgs/{convId}/{msgId}
  { at: ms, fromMe: bool, senderUid, senderName, kind, text: string|null, quote: {title,text}|null, cliMsgId }
```

- `kind`: `text | image | sticker | file | video | link | card | other` (từ `originMsgType`: `webchat`→text, `chat.photo`→image, `chat.sticker`→sticker, `share.file`→file, `chat.video.msg`→video, `chat.webcontent`→link, `chat.recommended`→card, còn lại→other).
- Khoá tin = `msgId` của Zalo → ghi lặp là ghi đè cùng giá trị, tự chống trùng.
- `meta` do extension gộp (lấy max) sau mỗi đợt ghi; nằm ở nhánh `meta` riêng để app nghe `links` + `meta` (nhỏ) mà không kéo theo tin nhắn. Không lưu tổng số tin (Zalo web chỉ giữ ~15 ngày nên đếm từ extension sẽ sai dần) — app tự đếm khi mở hội thoại. **Không** ghi gì vào object lead cho việc đồng bộ tin.
- Tin ghi theo từng trường (multi-path PATCH): lần ghi chỉ có siêu dữ liệu **không** xoá chữ đã ghi trước đó.
- "Không phải khách" được lưu ở `links` (chỉ `status`, `name`) để máy khác/cài lại không hỏi lại; **không** kèm tin nhắn.

### Security Rules (thêm vào `firebase-rules.json` + `firebase-rules-deploy.json`, Trường dán tay)

```json
"zalo": {
  ".read":  "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'",
  ".write": "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'"
},
"zalo_users": {
  "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" }
}
```

## 5. Kiến trúc extension (thư mục `extension/`, Manifest V3)

```
extension/
  manifest.json
  lib/zalo-map.js      # hàm thuần: bản ghi IDB/DOM → tin chuẩn, kind, meta, đường dẫn ZROOT
  lib/fb.js            # Firebase qua REST: đăng nhập, làm mới token, GET/PATCH
  content.js           # chạy trong chat.zalo.me: đọc IndexedDB + DOM, báo cho background
  background.js        # service worker: hàng đợi ghi, xác thực, định tuyến tin nhắn
  sidepanel.html/.css/.js
```

- **Không tải code từ ngoài** (MV3 cấm) → không dùng Firebase JS SDK; gọi REST:
  - Đăng nhập: `identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<apiKey công khai của app>`; làm mới: `securetoken.googleapis.com/v1/token`.
  - Dữ liệu: `https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/<path>.json?auth=<idToken>`; ghi luôn bằng **PATCH** (quy ước repo).
  - Lưu `refreshToken` + `uid` trong `chrome.storage.local`; **không lưu mật khẩu**. Chị tự nhập email/mật khẩu CRM trong thanh bên.
- **content.js**
  - Tìm DB `zdb_<số>` → `myUid`.
  - **Quét IndexedDB** 15 giây/lần: với mỗi hội thoại **đã gắn lead**, đọc tin có `sendDttm` ≥ mốc đã quét qua chỉ mục `userId_sendDttm_msgId`; mốc lưu trong `chrome.storage.local` (`scanMarks`), gắn mới thì mốc = 0 để nhập lịch sử.
  - Giữ kết nối IndexedDB nhưng **đóng ngay khi Zalo nâng cấp DB** (`onversionchange`) để không chặn Zalo.
  - **Theo dõi DOM** (`MutationObserver` trên `.message-view__scroll`): với mỗi `bb_msg_id_<cliMsgId>` mới → tra IndexedDB lấy `toUid`, `msgId`… → lấy chữ + trích dẫn từ DOM.
  - **Hội thoại đang mở** = `toUid` của các tin đang hiển thị → báo cho thanh bên.
  - Mọi thứ gửi qua `chrome.runtime.sendMessage` cho background; content.js không giữ token.
- **background.js**
  - Giữ danh sách `links` (tải khi đăng nhập, cập nhật khi gắn).
  - Hàng đợi ghi trong `chrome.storage.local` (sống sót khi service worker ngủ/mất mạng), gộp lô ≤ 200 tin/lệnh PATCH, thử lại khi lỗi mạng.
  - Chỉ ghi tin của hội thoại có `links.status === "lead"`.
- **Thanh bên**: trạng thái *chưa đăng nhập* / *không có hội thoại mở* / *chưa phân loại* / *đã gắn lead* / *không phải khách* (có nút "Hoàn tác").
  - *Tạo lead mới*: form ngắn (tên — điền sẵn tên Zalo, ngày cưới, gói, loại lead) → tạo lead đúng cấu trúc `submitAddLead()` của app (`id: 'L'+Date.now()`, `ownerUid`, `stage: 'leadin'`, `createdAt`, `deadline` hôm nay, `activityLog` "Lead được tạo (từ Zalo)"…) rồi ghi `links`.
  - *Gắn lead có sẵn*: tìm theo tên/SĐT trong danh sách lead (tải `leads` 1 lần, lọc tại chỗ).
  - *Đổi giai đoạn*: PATCH `leads/{id}/stage` + nối `activityLog` (cùng câu chữ `Chuyển từ "X" sang "Y"` như app); chuyển sang Won/Lost **không** làm ở thanh bên (cần doanh thu/lý do) → nút "Mở trong CRM".
  - *Ghi chú nhanh*: nối vào `leads/{id}/notesList` đúng cấu trúc `{id, text, createdAt, updatedAt}` với nhãn `DD/MM/YYYY, HH:MM`.

## 6. Thay đổi trong CRM (`index.html`)

- **Khối "💬 Hội thoại Zalo"** trong drawer lead (giao diện bong bóng đã duyệt 12/09, bỏ phần dán): tải `links` → các `convId` của lead → `msgs/{convId}` (500 tin cuối), nghe realtime khi drawer mở; tin chưa có chữ hiện "Chưa có nội dung — mở hội thoại này trên Zalo web"; tìm trong hội thoại; nhiều hội thoại → tab nhỏ theo tên.
- **Chip trên card** (khách chờ trả lời / khách im ≥ 3 ngày) tính từ `convs/*/meta` của các hội thoại gắn với lead.
- Đường dẫn `ZROOT` tính giống `userDataRef()` (chủ cũ → `zalo`, còn lại → `zalo_users/<uid>`).
- Xoá lead → gỡ `links`, `meta`, `msgs` của các hội thoại trỏ tới lead đó.

## 7. Giai đoạn 2 (cùng plan, làm sau cùng)

- Trang chia sẻ cho sếp: `/api/share` thêm `loai: 'chat'` (dùng phiên xem sẵn có, đọc qua kho hiệu lực của token) + khối hội thoại chỉ xem trong `xem.html`.

## 8. Lỗi & giới hạn đã biết

| Tình huống | Hành vi |
|---|---|
| Chưa dán rules | Thanh bên báo "Chưa bật quyền cho dữ liệu Zalo (cần cập nhật Security Rules)"; hàng đợi giữ nguyên. |
| Mất mạng / token hết hạn | Làm mới token; hàng đợi thử lại; không mất tin. |
| Zalo đổi cấu trúc DOM/IndexedDB | content.js tự kiểm tra (tìm được DB, chỉ mục, phần tử); thiếu thì thanh bên hiện "Zalo vừa thay đổi giao diện — extension tạm ngưng đồng bộ" thay vì ghi dữ liệu sai. |
| Tab Zalo đóng | Không đồng bộ; mở lại thì quét IndexedDB từ mốc cũ nên không sót (trong phạm vi lịch sử Zalo web giữ). |
| Tin chưa từng hiển thị | Lưu siêu dữ liệu, `text: null`. |
| API key Firebase bị giới hạn theo referrer | **Đã kiểm tra 2026-09-22: không bị giới hạn** — gọi Identity Toolkit không kèm referrer và với Origin `chrome-extension://` đều tới được API (trả `INVALID_ID_TOKEN` như mong đợi). Nếu sau này có ai bật giới hạn thì phải thêm ngoại lệ. |
| Lỗi app ghi đè thay đổi từ xa (nhánh `claude/blissful-hamilton-e8de1e`, chưa merge) | Nếu CRM đang mở drawer đúng lead đó, đổi giai đoạn/ghi chú từ thanh bên có thể bị app ghi đè. **Cần merge bản sửa trước khi dùng thật.** Đồng bộ tin nhắn không bị ảnh hưởng (không ghi vào lead). |

## 9. Kiểm thử

- `test/zalo-map.test.ts` (Node, không mạng): ánh xạ bản ghi IndexedDB → tin chuẩn, `kind`, chiều gửi, tính `meta` (chờ trả lời / im lặng), đường dẫn `ZROOT` theo uid, lô ghi, cấu trúc lead tạo mới & câu chữ activityLog khớp app.
- `test/zalo-rtdb.test.ts`: ghi/đọc thật trên nhánh sandbox `zaloTest` bằng service account (kiểm tra PATCH nhiều đường dẫn không xoá chữ, gỡ hội thoại sạch). Rules kiểm tra tay khi thử extension.
- Thử tay trên Chrome thật với extension unpacked: đăng nhập, gắn/tạo lead, "không phải khách", đồng bộ tin mới cả hai chiều, tin nhận trên điện thoại, đổi giai đoạn, ghi chú, CRM hiện hội thoại realtime, chip trên card, tắt mạng rồi bật lại.

## 10. Triển khai

1. Merge nhánh sửa lỗi ghi đè (Trường duyệt).
2. Trường dán rules mới.
3. Deploy CRM.
4. Cài extension unpacked trên máy của Huyền Trân, đăng nhập Zalo web + CRM trong thanh bên.
5. Phân loại dần các hội thoại khi chị mở chúng.
