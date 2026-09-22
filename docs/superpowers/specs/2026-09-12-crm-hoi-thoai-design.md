# Thiết kế: Mục "Hội thoại" cho lead trong HayDay CRM

Ngày: 2026-09-12 · Trạng thái: **ĐÃ BỊ THAY THẾ** bởi `2026-09-22-zalo-extension-design.md` (chuyển sang extension Zalo web; chỉ giữ lại phần giao diện bong bóng chat)

## 1. Bối cảnh & bài toán

Bản bàn giao brainstorm ban đầu đề xuất một Chrome extension cào tin nhắn trên `chat.zalo.me`. Khi đi vào thiết kế thì lộ ra hai điều:

- Huyền Trân chat với khách bằng **app Zalo PC và điện thoại**, không dùng Zalo web. Zalo chỉ cho **một phiên máy tính (PC hoặc web) cộng với điện thoại**, và zca-js cũng chiếm đúng phiên máy tính đó. Vì vậy mọi cách tự động bắt tin trên máy tính đều buộc chị bỏ Zalo PC. **Extension tạm gác.**
- Hiện chị **đã tự dán chat vào CRM**. Nỗi đau thật là **xem lại**: đoạn chat dán vào thành một khối chữ dài trong một thẻ ghi chú (`notesList`), lẫn với ghi chú thường, không tách ai nói gì, không tìm được. Thực tế chỉ đọc lại được qua Claude/MCP.

Nhu cầu xem lại (đã xác nhận đủ cả 4): đọc lại nguyên hội thoại, nắm nhanh ý chính, tìm theo từ khóa, xem diễn biến theo thời gian.

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | Mỗi lead có mục **"💬 Hội thoại"** riêng, tách khỏi Ghi chú. Chị dán chat vào đó thay vì dán vào ghi chú. |
| D2 | Nội dung chat lưu ở nhánh gốc riêng **`chatLogs/{leadId}`**, ngoài `crmData`, và chỉ tải khi cần. Trong lead chỉ giữ số liệu nhẹ `chatStats`. |
| D3 | **Không dùng AI trong v1.** Tách tin bằng parser thuần dựa trên định dạng copy của Zalo PC. |
| D4 | Tóm tắt ý chính giao cho **Claude qua MCP, làm sau** (ngoài phạm vi v1). |
| D5 | **Sếp xem được cả chat** (chỉ xem) trên trang chia sẻ. Đã chấp nhận việc chat có thể chứa SĐT/địa chỉ khách, dù trang chia sẻ vẫn ẩn các trường SĐT/Facebook. |
| D6 | Có **tín hiệu trên card kanban**: "Khách chờ trả lời" và "Khách im N ngày". |
| D7 | Có **bước xem trước** trước khi lưu. |

## 3. Ngoài phạm vi v1

- Tool MCP đọc chat và nhờ Claude tóm tắt vào các ô Chân dung / Objection / Lịch trình (D4).
- Nhận dạng định dạng copy từ Zalo điện thoại hoặc Messenger. v1 không nhận ra thì lưu nguyên văn thành ghi chú (mục 6.4).
- Chrome extension Zalo, hoặc bất kỳ cách tự động bắt tin nào.
- Hiển thị ảnh thật. Khi copy chat, ảnh chỉ còn chữ `[Hình ảnh]`.
- Sửa hoặc xoá từng tin nhắn đã lưu.

## 4. Định dạng đầu vào (Zalo PC, copy nhiều tin)

Mẫu thật do Trường cung cấp:

```
[12/09/2026 11:19:44] Quỳnh Anh: @Ngọc Thảo e dùng BaseHCMBC đi
[12/09/2026 11:19:50] Ngọc Thảo: [Hình ảnh] 
[12/09/2026 11:25:39] Quỳnh Anh: [Hình ảnh] 
[12/09/2026 11:25:39] Quỳnh Anh: [Hình ảnh] 
[12/09/2026 11:27:26] Quỳnh Anh: nào e ra sp onboarding.. e sẽ thêm mục coi phong thủy .. thấy làm chỗ cầu nguyện hấp dẫn quá nè 
```

Đặc điểm: mỗi tin có **ngày giờ đầy đủ tới giây** và **tên người gửi**. Trong cùng một giây có thể có nhiều tin giống hệt nhau (hai ảnh gửi liền). Cuối dòng có thể có khoảng trắng thừa.

## 5. Mô hình dữ liệu

### 5.1 Firebase

```
chatLogs/{leadId}/messages/{key}
  {
    at:      "2026-09-12 11:25:39",   // giờ VN theo đúng chữ trong đoạn chat, không kèm múi giờ
    sender:  "Lan Nguyễn",            // tên Zalo nguyên văn
    fromMe:  false,                   // tính lúc lưu, dựa trên chatMyNames
    text:    "…",                     // đã bỏ khoảng trắng cuối; tin nhiều dòng nối bằng \n
    src:     "zalo-pc",
    addedAt: "2026-09-12T04:30:00.000Z"
  }

crmData/leads/{id}.chatStats
  { count, firstAt, lastAt, lastCustomerAt, lastMeAt }   // định dạng thời gian như `at`; có thể null

appConfig/chatMyNames: ["Huyền Trân", …]   // các tên Zalo được coi là "mình"
```

- **Khóa tin** `key` = `YYYYMMDDHHMMSS_<hash8>_<n>`:
  - `hash8` = 8 ký tự hex của hàm băm `cyrb53(sender + "\n" + text)`. Dấu ngăn cách là `\n` vì tên người gửi không bao giờ chứa xuống dòng. Nếu dùng dấu cách, tên "Lan" với nội dung "Nguyễn hi" sẽ trùng với tên "Lan Nguyễn" với nội dung "hi".
  - `n` = thứ tự xuất hiện (bắt đầu từ 1) của các tin giống hệt nhau (cùng `at`, `sender`, `text`) **trong cùng một lần dán**.
  - Dán lại tin cũ sẽ ra đúng khóa cũ, nên việc khử trùng lặp là tự nhiên. Sắp theo khóa cũng là sắp theo thời gian.
  - **Giới hạn đã biết:** nếu hai tin giống hệt nhau trong cùng một giây, mà lần dán sau chỉ chứa tin thứ hai, tin đó bị coi là trùng. Rất hiếm, và thường chỉ mất một nhãn `[Hình ảnh]`.
- `fromMe` được lưu lại chứ không tính lúc hiển thị, để tin cũ vẫn đúng khi chị đổi tên Zalo.
- `chatStats` nằm trong lead để card kanban và trang của sếp dùng được mà không phải tải chat. Nó được ghi qua cơ chế lưu lead bình thường (`scheduleSave`).
- **Tách theo môi trường:** server dùng `CHAT_ROOT = process.env.FIREBASE_CHAT_ROOT || 'chatLogs'`, và test đặt `chatLogsTest`, cùng cơ chế với `FIREBASE_DATA_ROOT` hiện có. App web luôn dùng `chatLogs`.

### 5.2 Security Rules (thêm vào `firebase-rules.json`, Trường tự dán vào Console)

```json
"chatLogs": {
  ".read":  "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'",
  ".write": "auth != null && auth.uid === '7ePgCPmzxHdEAEazHo9IkyKf2rw2'",
  "$leadId": {
    "messages": {
      "$key": {
        ".validate": "newData.hasChildren(['at','sender','fromMe','text']) && newData.child('at').isString() && newData.child('sender').isString() && newData.child('fromMe').isBoolean() && newData.child('text').isString() && newData.child('text').val().length <= 20000"
      }
    }
  }
}
```

`appConfig/chatMyNames` đã nằm trong `appConfig`, chỉ UID của Huyền Trân ghi được, nên không cần thêm rule. Server (MCP/share) dùng service account nên bỏ qua rules. Vì vậy `chatLogsTest` không cần rule.

### 5.3 Vì sao không để chat trong object lead

- App tải toàn bộ `crmData` mỗi lần mở (`initCloudSync`), và `onValue` gọi `JSON.stringify` cả khối mỗi khi có thay đổi. Khoảng 90 lead/tháng, mỗi lead vài chục KB chat, thì sau một năm app sẽ chậm rõ rệt.
- Ghi chat thẳng vào `chatLogs/…` sẽ không đi qua `saveToCloud`, nên không dính lỗi ghi đè từ xa đang được sửa ở một task riêng.

## 6. Parser — file `chat-parser.js` (mới, ở gốc repo)

### 6.1 Vị trí & cách nạp

- Viết dạng script thường, không có `import`, `export` hay `await` ở cấp cao nhất. **Bọc toàn bộ file trong một hàm tự gọi (IIFE)**, để các hàm như `parse` hay `stats` không thành biến toàn cục đụng tên với code trong `index.html`. Thứ duy nhất lộ ra ngoài là `globalThis.ChatParser = { parse, withKeys, stats, looksLikeChat }`.
- Trình duyệt nạp bằng `<script src="chat-parser.js"></script>` đặt trước script chính của `index.html`. `vercel.json` không có rewrite bắt hết mọi đường dẫn, nên file được phục vụ như file tĩnh.
- Test Node dùng `await import('../chat-parser.js')` rồi đọc `globalThis.ChatParser`.
- Đây là ngoại lệ có chủ đích với lối viết một file: đổi lại, test chạy trên đúng code thật, giống cách các test hiện có import `api/mcp.ts`.
- `api/mcp.ts` **không** import file này, vì Vercel không đóng gói file nằm ngoài `api/` (xem SETUP.md). Server chỉ đọc tin đã có cấu trúc nên không cần parser.

### 6.2 `parse(raw) → { messages, senders, unparsed }`

1. Chuẩn hoá xuống dòng: đổi `\r\n` và `\r` thành `\n`.
2. Nhận diện dòng đầu tin bằng `^\[(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})\] (.+?): ?(.*)$`. Tên người gửi tính tới dấu `": "` đầu tiên.
3. Dòng **không** khớp:
   - Nếu đã có tin trước đó thì nối vào tin đó bằng `\n`.
   - Nếu chưa có tin nào thì gom vào `unparsed` (phần mở đầu).
4. Với mỗi tin: bỏ khoảng trắng cuối từng dòng, bỏ dòng trống ở cuối tin, rồi đổi `at` sang `YYYY-MM-DD HH:MM:SS`. Ngày không hợp lệ (ví dụ 31/02) thì dòng đó được coi là dòng không khớp.
5. `senders` là danh sách tên duy nhất, theo thứ tự xuất hiện lần đầu.
6. Không có dòng đầu tin nào thì `messages = []` và toàn bộ chữ nằm trong `unparsed`.

### 6.3 Các hàm còn lại

- `withKeys(messages)` gắn `key` theo mục 5.1.
- `stats(messages)` nhận các tin đã có `fromMe` và trả `{ count, firstAt, lastAt, lastCustomerAt, lastMeAt }`.
- `looksLikeChat(text)` trả `true` nếu có ít nhất một dòng đầu tin. Hàm này dùng để hiện nút chuyển trên ghi chú cũ.
- **Nhãn đính kèm:** một tin mà `text` khớp `^\[[^\]\n]{1,30}\]$` (`[Hình ảnh]`, `[Sticker]`, `[File]`…) sẽ hiển thị thành nhãn. Việc này thuộc về phần hiển thị, parser không đổi dữ liệu.

### 6.4 Không nhận ra định dạng

Nếu `messages` rỗng, hộp thoại dán báo "Không nhận ra định dạng Zalo PC", kèm nút **"Lưu thành ghi chú"**. Nút này đi theo đúng luồng ghi chú hiện có, nên không mất chữ nào. Nếu có tin nhận ra được và còn thêm `unparsed` (phần mở đầu), phần mở đầu cũng được đề nghị lưu thành ghi chú.

## 7. Giao diện (theo mockup đã duyệt)

### 7.1 Mục "💬 Hội thoại" trong drawer lead

- Là một `detail-block` riêng ở cột trái, **đặt ngay trên khối Ghi chú**. Tiêu đề khối dùng cùng kiểu với các khối khác.
- Dòng tóm tắt: `42 tin · 08/09 → 12/09 · lần cuối khách nhắn 12/09 11:27`.
- Nút **"Dán đoạn chat"** và ô **tìm trong hội thoại**. Ô tìm lọc theo tin, tô sáng chữ khớp, và ẩn dải ngày khi đang tìm.
- **Bong bóng chat:**
  - Tin của khách nằm bên trái, có tên người gửi. Nhóm có cả cô dâu và chú rể vẫn hiển thị đúng.
  - Tin của mình nằm bên phải, màu xanh của app.
  - Giờ `HH:MM` nằm dưới mỗi tin.
  - Có dải ngày kiểu "Thứ Sáu, 12/09".
- Vùng tin có chiều cao tối đa khoảng 420px, cuộn bên trong. Mở ra thì tự cuộn xuống tin mới nhất.
- **Tải dữ liệu:** `openLead()` gọi `get(chatLogs/{id}/messages)` và hiện "Đang tải…" trong lúc chờ. Kết quả được giữ trong bộ nhớ cho tới khi tải lại trang. Lỗi tải thì hiện dòng báo lỗi ngay trong khối, drawer vẫn dùng bình thường.
- Hỗ trợ đầy đủ chế độ tối và bố cục điện thoại (< 768px) bằng các biến màu hiện có.

### 7.2 Hộp thoại dán & xem trước

1. Ô nhập để dán chữ. Parser chạy ngay mỗi lần chữ thay đổi.
2. Tóm tắt: `12 tin nhận ra được · 11/09 → 12/09 · 3 tin đã có, sẽ bỏ qua`. Số tin trùng được tính bằng cách so khóa với các tin đã tải.
3. Chip tên người gửi, **bấm để đổi mình/khách**:
   - Tên có trong `chatMyNames` được đánh dấu "mình" sẵn.
   - Nếu chưa tên nào là "mình", hiện dòng "Chọn tên của bạn" và nút lưu vẫn bấm được. Bấm lưu lúc này thì hiện lỗi ngay tại chỗ, không lưu.
4. Nút **"Lưu N tin mới"**, rồi làm lần lượt:
   - (a) Tên nào vừa được đánh dấu "mình" thì thêm vào `appConfig/chatMyNames`.
   - (b) Ghi tất cả tin mới trong **một** lệnh `update(ref('chatLogs/{id}/messages'), {...})`.
   - (c) Gộp vào bộ nhớ, tính lại `chatStats`, gán vào lead rồi gọi `scheduleSave()`.
   - (d) Gọi `logActivity(lead, "Thêm N tin nhắn Zalo")`. Chữ này không chứa tên giai đoạn trong ngoặc kép, nên không ảnh hưởng `reachedStageIndex`.
5. Nếu mọi tin đều đã có thì hiện "Không có tin mới" và không ghi gì.

### 7.3 Chuyển chat cũ trong Ghi chú

- Ghi chú nào có `looksLikeChat(text)` sẽ có nút **"Chuyển vào hội thoại"** trên đầu thẻ.
- Bấm vào mở đúng hộp thoại ở 7.2 với chữ của ghi chú điền sẵn, kèm ô **"Xoá ghi chú gốc sau khi chuyển"** được tick sẵn.
- Lưu thành công thì xoá ghi chú (nếu ô được tick) và ghi log "Chuyển N tin từ ghi chú vào Hội thoại".

### 7.4 Tín hiệu trên card kanban

Chỉ áp dụng cho lead chưa Won/Lost và có `chatStats`:

- `lastCustomerAt` > `lastMeAt` (hoặc chưa có `lastMeAt`) thì hiện chip đỏ **"Khách chờ trả lời · X"**. X là khoảng thời gian từ `lastCustomerAt` tới hiện tại: dưới một ngày thì tính theo giờ, từ một ngày trở lên thì theo ngày.
- Ngược lại, nếu tính từ `lastMeAt` đã qua **từ 3 ngày trở lên** thì hiện chip vàng **"Khách im N ngày"**. Mốc 3 ngày để trong hằng số `NGUONG_IM_LANG = 3`.
- **Giới hạn đã biết:** tín hiệu chỉ đúng tới lần dán gần nhất.

### 7.5 Tìm trên tất cả lead

- Trong ô tìm kiếm trên thanh công cụ (`onSearch` / `matchesFilters`), khi từ khóa dài từ 3 ký tự trở lên thì tìm cả trong nội dung chat.
- Lần đầu cần tìm, gọi `get(ref('chatLogs'))` một lần, dựng bảng `leadId → chữ thường đã nối`, rồi giữ trong bộ nhớ cho tới khi tải lại trang. Lead có tin mới dán thì cập nhật bảng tại chỗ.
- Card nào khớp nhờ chat (tên hoặc SĐT không khớp) hiện nhãn nhỏ **"khớp trong chat"**.

### 7.6 Xoá lead

Trong `deleteCurrentLead()` (`index.html`, khoảng dòng 2850), sau khi người dùng xác nhận, gọi thêm `update(ref('chatLogs'), { [id]: null })` và xoá lead đó khỏi bộ nhớ tạm của chat (mục 7.1) và khỏi bảng tìm kiếm (mục 7.5). Nếu lệnh này thất bại thì chỉ ghi `console.warn`: chat mồ côi vô hại và không làm hỏng dữ liệu lead.

## 8. Trang chia sẻ cho sếp

- **`api/mcp.ts`, chế độ share:**
  - Thêm nhánh xử lý `body.loai === 'chat'`. Nhánh này bắt buộc có `session` hợp lệ (`phienConHieuLuc`): không hỏi lại mật khẩu và không ghi `shareLog`, giống các lượt đổi kỳ.
  - Kiểm tra `leadId` bằng `^[A-Za-z0-9_-]{1,64}$` để chặn đường dẫn lạ, rồi đọc `${CHAT_ROOT}/${leadId}/messages`.
  - Trả `{ ok: true, messages: [...] }` đã sắp theo khóa. Chỉ gồm các trường `at, sender, fromMe, text`.
- **`leadChiTiet`** thêm `chatStats: l.chatStats || null`. **Không** nhúng nội dung chat vào response tổng, vì response này chứa mọi lead.
- **`xem.html` → `moLead()`:**
  - Thêm khối **"Hội thoại (N)"** dạng bong bóng giản lược, chỉ xem, đặt trên khối Ghi chú.
  - Chỉ gọi `/api/share` với `loai: 'chat'` khi sếp mở deal có `chatStats.count > 0`.
  - Lỗi thì hiện "Không tải được hội thoại", các khối khác vẫn hiện bình thường.
  - Chip "Khách chờ trả lời" và "Khách im N ngày" hiện giống app.

## 9. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Chưa dán rules mới, ghi `chatLogs` bị từ chối | Báo "Chưa bật quyền cho Hội thoại — cần cập nhật Security Rules". **Giữ nguyên chữ** trong ô dán. |
| Mất mạng khi lưu | Lệnh update nhiều đường dẫn của Firebase thực hiện trọn gói: hoặc lưu hết, hoặc không lưu gì. Báo lỗi và giữ nguyên chữ để thử lại. |
| Chat lưu được nhưng lưu `chatStats` lỗi | Mỗi lần mở mục Hội thoại, `chatStats` được tính lại từ tin nhắn và ghi nếu khác, nên tự đúng trở lại. |
| Không nhận ra định dạng | Đề nghị lưu thành ghi chú (6.4). |
| Chưa chọn tên "mình" | Lỗi hiện ngay tại chỗ, không lưu. |
| Tải chat lỗi (app hoặc trang của sếp) | Báo trong khối Hội thoại, phần còn lại vẫn dùng được. |

## 10. Kiểm thử

**`test/chat-parser.test.ts`** (script mới `npm run test:chat`, không đụng database), dùng mẫu thật ở mục 4 cộng các trường hợp:

- Tin nhiều dòng (dòng tiếp nối).
- Hai `[Hình ảnh]` cùng một giây: phải ra 2 tin với 2 khóa `_1` và `_2`.
- Dán lại đúng đoạn cũ: phải ra cùng bộ khóa.
- Dán một đoạn chồng lấn một phần với đoạn cũ.
- Phần mở đầu không phải dòng đầu tin (vào `unparsed`).
- Chữ hoàn toàn lạ (`messages` rỗng).
- `\r\n` kiểu Windows.
- Khoảng trắng thừa cuối dòng.
- Ngày không hợp lệ.
- Tên người gửi có dấu hai chấm (tên chỉ lấy tới dấu `": "` đầu tiên, và ghi rõ hành vi này trong test).
- `stats()` với tin cuối là của khách, rồi với tin cuối là của mình.
- `looksLikeChat()` đúng và sai.

**`test/share.test.ts`** (mở rộng) chạy trên nhánh sandbox `crmDataTest` / `chatLogsTest`:

- `loai: 'chat'` không có session thì trả 401.
- `leadId` lạ thì trả 400.
- Hợp lệ thì trả đúng tin, đúng thứ tự, không thừa trường nào.
- Dọn sandbox sau khi chạy.

**Thử tay trên app thật** (một lead thử, xoá sau khi xong):

- Dán mẫu, dán lại, dán chồng lấn.
- Chọn tên "mình".
- Chip trên card.
- Tìm trong một lead và trên tất cả lead.
- Chuyển một ghi chú cũ.
- Chế độ tối.
- Màn hình điện thoại.
- Trang của sếp mở deal.
- Xoá lead thì `chatLogs/{id}` biến mất.

## 11. Triển khai

1. **Merge task sửa lỗi ghi đè từ xa trước.** Task đó chạy riêng và cũng sửa `saveToCloud`. `chatStats` đi qua đường lưu đó, nên merge trước sẽ tránh xung đột code.
2. Trường dán rules mới (mục 5.2) vào Firebase Console, rồi cập nhật `firebase-rules.json` trong repo cho khớp.
3. Deploy (Vercel tự deploy khi push).
4. Thử tay theo mục 10.
5. Huyền Trân chuyển dần chat cũ từ ghi chú sang, không cần làm hết một lần.

## 12. Lưu ý liên quan (không thuộc phạm vi này)

- **MCP đang trả `401 Permission denied`** khi đọc Firebase (ghi nhận ngày 2026-09-12). Nhiều khả năng `FIREBASE_SERVICE_ACCOUNT` trên Vercel chưa đặt hoặc đã sai. Việc này ảnh hưởng tới D4 và trang chia sẻ cho sếp (cùng dùng service account), nên cần kiểm tra trước bước 4 ở mục 11.
- Zalo có thể đổi định dạng copy. Khi đó parser rơi về 6.4 (lưu thành ghi chú) chứ không làm hỏng dữ liệu.
