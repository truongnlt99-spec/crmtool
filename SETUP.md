# Kết nối CRM với Claude qua MCP

Tài liệu này hướng dẫn các bước **bạn phải tự làm** (những việc cần đăng nhập tài khoản, Claude không làm thay được).

Triển khai chia làm 2 giai đoạn. **Làm xong giai đoạn 1 là dùng được.** Giai đoạn 2 là siết bảo mật, quan trọng nhưng cần sửa thêm app.

---

## ⚠️ Đọc trước: tình trạng bảo mật hiện tại

Database Firebase đang **mở công khai**. Bất kỳ ai có link (link này nằm sẵn trong `index.html` trên GitHub public) đều đọc được toàn bộ dữ liệu khách hàng: tên, số điện thoại, Facebook, doanh thu, ghi chú.

Kiểm chứng bằng lệnh này — nó trả về dữ liệu thật mà không cần đăng nhập:

```bash
curl "https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/crmData.json?shallow=true"
```

Mật khẩu `8386` ở màn khóa **không bảo vệ gì cả** — nó nằm ngay trong mã nguồn public, và dữ liệu lấy được thẳng từ database mà không cần qua app.

Việc này đã tồn tại từ trước, không phải do MCP tạo ra. Nhưng nên xử lý sớm (giai đoạn 2).

---

## Test tại máy (không cần deploy)

Đã cài sẵn Node.js. Chạy bộ test bất cứ lúc nào:

```bash
npm test
```

Bộ test tạo một nhánh sandbox riêng tên `crmDataTest` trên Firebase, chạy đủ 6 tool ghi trên đó, kiểm tra kết quả rồi **xóa sandbox**. Dữ liệu thật ở nhánh `crmData` không bị đụng tới.

Cơ chế: biến môi trường `FIREBASE_DATA_ROOT` quyết định nhánh nào được dùng (mặc định `crmData`). Không đặt biến này trên Vercel — để nó chạy mặc định vào dữ liệu thật.

---

## Giai đoạn 1 — Dựng MCP server (dùng được ngay)

### Bước 1.1 — Tạo chuỗi bí mật cho MCP

Chuỗi này đóng vai trò "chìa khóa" vào MCP server. Chạy lệnh sau để sinh ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Chưa có Node thì dùng PowerShell:

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

Copy chuỗi kết quả ra chỗ nào đó. **Không commit chuỗi này lên GitHub.**

### Bước 1.2 — Đặt biến môi trường trên Vercel

Vào Vercel → project `crmtool` → **Settings** → **Environment Variables**, thêm:

| Tên biến | Giá trị | Môi trường |
|---|---|---|
| `MCP_SECRET` | chuỗi vừa sinh ở bước 1.1 | Production |

> Chưa cần `FIREBASE_SERVICE_ACCOUNT` ở giai đoạn này — database còn đang mở nên MCP truy cập được luôn.

### Bước 1.3 — Deploy

Sau khi code được push lên GitHub, Vercel tự deploy. Việc bạn cần làm là **kiểm tra site cũ vẫn chạy bình thường**:

- Mở `https://<tên-site>.vercel.app` → app CRM phải hiện ra như cũ
- Nếu site trắng hoặc lỗi 404 → báo lại ngay, khả năng là `package.json` làm Vercel đổi cách build

### Bước 1.4 — Kiểm tra MCP server sống chưa

```bash
curl -i "https://<tên-site>.vercel.app/api/mcp/<MCP_SECRET>" -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

- Trả về danh sách tool → **thành công**
- Trả về `401 Unauthorized` → sai `MCP_SECRET`
- Trả về `404` → rewrite trong `vercel.json` chưa ăn, thử dạng query: `.../api/mcp?key=<MCP_SECRET>`

### Bước 1.4b — Tắt Deployment Protection (bắt buộc)

Vercel mặc định bật **Vercel Authentication**, chặn mọi truy cập từ ngoài ở tầng hạ tầng — request chưa chạm tới code đã bị trả `401`. **claude.ai cũng sẽ bị chặn y hệt**, nên bước này bắt buộc phải làm thì connector mới hoạt động.

Settings → **Deployment Protection** → **Vercel Authentication** → chuyển **Disabled** → Save.

Chỉ làm sau khi `MCP_SECRET` đã được đặt và redeploy xong. Khi đó endpoint đã có khóa riêng bảo vệ.

Kiểm chứng — cả 4 trường hợp phải đúng như sau:

| Request | Mong đợi |
|---|---|
| `POST /api/mcp` (không khóa) | `401` |
| `POST /api/mcp/khoa-sai` | `401` |
| `POST /api/mcp/<MCP_SECRET>` | `200` |
| `POST /api/mcp?key=<MCP_SECRET>` | `200` |

### Bước 1.5 — Vợ bạn thêm connector vào Claude

Yêu cầu: tài khoản **Claude Pro trở lên**.

1. Vào [claude.ai](https://claude.ai) → **Settings** → **Connectors**
2. Chọn **Add custom connector**
3. Dán URL: `https://<tên-site>.vercel.app/api/mcp/<MCP_SECRET>`
4. Lưu lại

Xong. Giờ có thể hỏi Claude những câu như:

- *"Lead nào đang trễ hẹn?"*
- *"Tháng này dự kiến chốt bao nhiêu doanh thu?"*
- *"Chi tiết lead chị Lan"*
- *"Thêm ghi chú cho chị Lan: khách hẹn gọi lại thứ 5"*
- *"Chuyển lead anh Minh sang Follow up lần 2"*

> **Lưu ý về link:** ai có URL này là có toàn quyền đọc/ghi CRM. Đừng gửi qua nhóm chat chung hay đăng lên đâu cả.

---

## Giai đoạn 2 — Siết bảo mật database

Mục tiêu: đóng database lại, chỉ app (có đăng nhập) và MCP (service account) mới vào được.

**Thứ tự bắt buộc — làm sai thứ tự là app của vợ mất dữ liệu hiển thị:**

### Bước 2.1 — Thêm đăng nhập Firebase thật vào app

Đây là phần sửa code, Claude làm được — nhưng phải làm **trước** khi dán rules. Nội dung: thay màn khóa mật khẩu `8386` bằng đăng nhập Firebase Authentication (Email/Password) với một tài khoản duy nhất cho vợ bạn.

Bạn cần tự làm phần này trong Firebase Console:

1. Vào **Firebase Console** → project `huyentrancrm` → **Authentication** → **Get started**
2. Bật phương thức **Email/Password**
3. Tab **Users** → **Add user** → tạo tài khoản cho vợ bạn (email + mật khẩu)

### Bước 2.2 — Tạo service account cho MCP

1. Firebase Console → ⚙️ **Project settings** → tab **Service accounts**
2. Bấm **Generate new private key** → tải file JSON về
3. Mở file JSON, copy **toàn bộ nội dung**

> File này là chìa khóa admin của database. Không commit lên GitHub, không gửi qua chat.

### Bước 2.3 — Nạp service account lên Vercel

Vercel → project `crmtool` → **Settings** → **Environment Variables**:

| Tên biến | Giá trị | Môi trường |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | dán nguyên nội dung file JSON | Production |

Deploy lại để biến môi trường có hiệu lực.

### Bước 2.4 — Dán Security Rules

Chỉ làm bước này **sau khi 2.1–2.3 đã xong và đã kiểm tra app đăng nhập được**.

1. Firebase Console → **Realtime Database** → tab **Rules**
2. Dán nội dung phần `rules` trong file [`firebase-rules.json`](firebase-rules.json)
3. Bấm **Publish**

### Bước 2.5 — Kiểm chứng đã đóng

```bash
curl "https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app/crmData.json?shallow=true"
```

Phải trả về lỗi `Permission denied`. Nếu vẫn ra dữ liệu là rules chưa ăn.

Sau đó kiểm tra lại: app của vợ vẫn vào được (sau khi đăng nhập), và Claude vẫn gọi tool được.

---

## Ghi chú kỹ thuật

**Vì sao toàn bộ code nằm trong một file `api/mcp.ts`?**

Vercel biên dịch từng file trong `api/` một cách riêng lẻ và **không đóng gói file nằm ngoài thư mục đó**. Đã kiểm chứng bằng thực nghiệm trên preview:

| Kiểu import | Kết quả |
|---|---|
| `import { z } from 'zod'` (node_modules) | HTTP 200 ✅ |
| `import ... from '../lib/crm.ts'` | HTTP 500 ❌ |
| `import ... from '../lib/crm.js'` | HTTP 500 ❌ |

Đổi đuôi kiểu gì cũng vô ích. Nên đừng tách code sang thư mục ngoài `api/` — function sẽ chết với `FUNCTION_INVOCATION_FAILED`.

**Về chỉ số CR trên dashboard.** CR tính trên *lead được tạo trong tháng*, nên deal chốt trong tháng này nhưng lead tạo từ tháng trước sẽ không được tính. Ví dụ tháng 8/2026: có 3 deal Won nhưng cả 3 đều tạo ngày 31/07, nên CR hiển thị 0%. Đây là định nghĩa sẵn có của app, MCP tái hiện nguyên vẹn — không phải lỗi.

---

## Hạn chế đã biết

**Xung đột ghi khi dùng song song.** App web lưu bằng cách ghi đè toàn bộ khối dữ liệu. Đã bổ sung đồng bộ realtime (`onValue`) nên app sẽ nhận thay đổi do Claude ghi trong vòng dưới 1 giây. Nhưng nếu vợ bạn sửa gì đó trong app *đúng khoảnh khắc* Claude đang ghi (chênh nhau dưới ~1 giây), thay đổi của Claude vẫn có thể bị ghi đè.

Thực tế rất hiếm gặp. Muốn chắc chắn tuyệt đối thì đừng nhờ Claude sửa dữ liệu trong lúc đang mở app. Cần triệt để hơn thì phải refactor app để ghi theo từng lead thay vì ghi cả khối — việc này lớn hơn, để sau.

---

## Danh sách tool MCP

**Đọc:** `list_leads`, `get_lead`, `dashboard_summary`, `upcoming_deadlines`, `list_todos`

**Ghi:** `create_lead`, `update_lead`, `move_stage`, `add_note`, `add_todo`, `complete_todo`
