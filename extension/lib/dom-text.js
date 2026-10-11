/**
 * Đọc nội dung một tin nhắn từ DOM của Zalo web.
 *
 * Cấu trúc thật (dò ngày 2026-09-28, xem test/zalo-dom.test.html):
 *   tin thường:      .text-message__container > … > span.text
 *   tin có ĐỊNH DẠNG (in đậm/nghiêng/gạch chân):
 *                    .text-message__container > … > .editor-input > div > span   (span KHÔNG có class)
 *   giờ gửi:         .card-send-time…            — NẰM NGOÀI .text-message__container
 *   6 emoji thả cảm xúc: .message-reaction-container…  — cũng nằm ngoài
 *
 * Vì vậy quy tắc là: chỉ lấy chữ BÊN TRONG .text-message__container, bỏ phần trích dẫn.
 * Đừng quay lại cách "tìm đúng tên class của chữ": Zalo đổi class theo loại tin.
 *
 * Tin KHÔNG phải chữ (file, link xem trước, ảnh có chú thích) thì không có container đó:
 * dùng attachmentFromMessage() — gom chữ nhìn thấy trong cả bong bóng + href, cố ý KHÔNG
 * dựa vào tên class nào để Zalo đổi class vẫn còn chạy.
 */

// Trích dẫn (tin trả lời) nằm chung bong bóng nhưng không phải nội dung tin.
const TRICH_DAN = '[class*="message-quote-fragment"]';
// Phòng xa: nếu Zalo chuyển mấy phần này vào trong container thì vẫn không lẫn vào nội dung.
const RAC = '[class*="card-send-time"], [class*="bubble-message-time"], [class*="message-reaction-container"], [class*="reaction-emoji"], [class*="message-sender-name"]';
// Thẻ khối — chỉ dùng để DỰ PHÒNG khi không đo được vị trí (bong bóng đang ẩn).
const KHOI = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'TABLE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
// Đuôi file người ta thật sự gửi qua Zalo. Nhận tên file theo danh sách này, KHÔNG theo
// dấu chấm chung — tên miền trong thẻ link xem trước ("hayday.vn") cũng có dấu chấm.
const DUOI_FILE = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpe?g|png|gif|heic|webp|svg|mp4|mov|avi|mkv|mp3|m4a|wav|ai|psd|eps|apk|json)$/i;
// Dong chi co moi ten mien ("www.youtube.com") thi khong phai tieu de link.
const LA_TEN_MIEN = /^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+\/?$/i;

/** Alt của <img> chỉ lấy khi là emoji (Zalo vẽ emoji bằng ảnh), không lấy tên file ảnh. */
const laEmojiAlt = (alt) => !!alt && alt.length <= 8 && !DUOI_FILE.test(alt);

/** Vị trí một nút chữ trên màn hình { top, left, right }, null nếu không đo được (đang ẩn). */
function viTriChu(n) {
  try {
    const r = n.ownerDocument.createRange();
    r.selectNodeContents(n);
    const o = r.getBoundingClientRect();
    return o.height || o.width ? { top: Math.round(o.top), left: Math.round(o.left), right: Math.round(o.right) } : null;
  } catch { return null; }
}

/**
 * Gom chữ trong một nhánh, bỏ phần phụ; <br> thành xuống dòng, emoji lấy từ alt.
 * boTrichDan: bỏ luôn phần trích dẫn (mặc định) — tắt khi đang đọc chính phần trích dẫn.
 * ngatKhoi: tách thành nhiều dòng — dùng cho tin file/link, nơi mỗi ý là một dòng.
 *
 * Tách dòng theo VỊ TRÍ HIỂN THỊ THẬT, không theo thẻ: Zalo cắt tên file dài thành hai
 * mảnh nằm cạnh nhau trên cùng một dòng ("HayDay-CRM-Zalo-v0" + ".1.7.zip") để hiện dấu
 * "…" — cứ thấy thẻ khối là xuống dòng thì tên file bị gãy đôi (lỗi thật ngày 11/10/2026).
 * Không đo được (bong bóng đang ẩn) thì mới quay về cách cũ: mỗi thẻ khối một dòng.
 */
export function chuTrongNhanh(root, { boTrichDan = true, ngatKhoi = false } = {}) {
  const bo = boTrichDan ? `${TRICH_DAN}, ${RAC}` : RAC;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(bo) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let t = '';
  let truoc = null;          // vị trí đoạn chữ liền trước
  let doDuoc = false;        // đã đo được vị trí ít nhất một lần chưa
  const xuongDong = () => { if (t && !t.endsWith('\n')) t += '\n'; };
  const themCach = () => { if (t && !/\s$/.test(t)) t += ' '; };
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === 3) {
      if (ngatKhoi && n.nodeValue.trim()) {
        const o = viTriChu(n);
        if (o !== null) {
          doDuoc = true;
          if (truoc !== null) {
            // Khác dòng -> xuống dòng. Cùng dòng mà cách xa nhau (dung lượng và nút bấm)
            // -> thêm khoảng trắng; sát nhau thì nối liền (hai mảnh của một tên file).
            if (Math.abs(o.top - truoc.top) > 2) xuongDong();
            else if (o.left - truoc.right > 4) themCach();
          }
          truoc = o;
        }
      }
      t += n.nodeValue;
    } else if (n.tagName === 'BR') { t += '\n'; truoc = null; }
    else if (n.tagName === 'IMG' && laEmojiAlt(n.alt)) t += n.alt;   // emoji được vẽ bằng <img alt="😀">
    else if (ngatKhoi && !doDuoc && KHOI.has(n.tagName)) xuongDong();
  }
  return t;
}

/** Nội dung tin, hoặc null nếu tin chưa vẽ xong / không phải tin chữ. */
export function textFromMessage(el) {
  const containers = [...el.querySelectorAll('[class*="text-message__container"]')];
  if (containers.length) {
    const t = containers.map((c) => chuTrongNhanh(c)).join('').trim();
    return t || null;
  }
  // Dự phòng cho bố cục khác: vẫn ưu tiên span.text như bản đầu
  const spans = [...el.querySelectorAll('span.text')].filter((s) => !s.closest(TRICH_DAN));
  const t = spans.map((s) => s.innerText).join('').trim();
  return t || null;
}

/** Trích dẫn của tin trả lời: { title, text } hoặc null. Giữ xuống dòng và emoji. */
export function quoteFromMessage(el) {
  const q = el.querySelector('[class*="message-quote-fragment__description"]');
  if (!q) return null;
  const title = el.querySelector('[class*="message-quote-fragment__title"]');
  const doc = (n) => chuTrongNhanh(n, { boTrichDan: false, ngatKhoi: true }).replace(/\n{2,}/g, '\n').trim();
  return { title: title ? doc(title) : '', text: doc(q) };
}

/** Link đầu tiên trong bong bóng (bỏ phần trích dẫn), hoặc null. */
export function linkFromMessage(el) {
  for (const a of el.querySelectorAll('a[href], [data-href]')) {
    if (a.closest(TRICH_DAN)) continue;
    const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
    if (/^https?:\/\//i.test(href)) return href;
  }
  return null;
}

/**
 * URL nằm trong chính phần chữ nhìn thấy. Cần vì thẻ link xem trước của Zalo KHÔNG phải
 * <a href> mà là div bắt sự kiện bấm (dò trên tin thật ngày 11/10/2026) — chỉ còn URL hiện
 * ra dưới dạng chữ mới lấy được.
 */
function linkTrongChu(dong) {
  for (const d of dong) {
    const m = /https?:\/\/[^\s"'<>]+/i.exec(d);
    if (m) return m[0].replace(/[.,;:!?)\]}]+$/, '');
  }
  return null;
}

/**
 * Phần ngoài chữ của tin: { text?, url?, fileName? } — chỉ gồm khoá nào có thật.
 * Dùng cho tin KHÔNG phải chữ: file (lấy tên file), link xem trước (lấy URL + tiêu đề),
 * ảnh có chú thích (lấy chú thích). Sticker không có chữ nên trả về {}.
 */
export function attachmentFromMessage(el) {
  const out = {};
  const dong = chuTrongNhanh(el, { ngatKhoi: true }).split('\n').map((s) => s.trim()).filter(Boolean);
  const url = linkFromMessage(el) || linkTrongChu(dong);   // href thật trước, rồi mới tới URL hiện thành chữ
  if (url) out.url = url;
  const text = dong.join('\n');
  if (text) out.text = text.slice(0, 4000);
  const ten = dong.find((d) => d.length <= 200 && DUOI_FILE.test(d));
  if (ten) out.fileName = ten;
  // Tiêu đề thẻ xem trước: Zalo đã tự tải sẵn, lưu lại để đọc được nội dung link mà
  // không phải mở trang (nhất là link Facebook — mở ngoài vào chỉ thấy màn đăng nhập).
  if (url) {
    const chuTin = new Set((textFromMessage(el) || '').split('\n').map((s) => s.trim()).filter(Boolean));
    const tieuDe = dong.find((d) => !chuTin.has(d) && !d.includes(url) && !LA_TEN_MIEN.test(d)
      && d.length >= 8 && !DUOI_FILE.test(d));
    if (tieuDe) out.linkTitle = tieuDe.slice(0, 300);
  }
  return out;
}

/**
 * Gắn mọi thứ đọc được từ DOM vào tin đã có siêu dữ liệu từ IndexedDB.
 * content.js chỉ gọi hàm này — logic nằm ở đây để test được bằng DOM thật.
 * Trả về null khi tin CHỮ chưa vẽ xong (lần quét sau thử lại).
 */
export function enrichFromDom(msg, el) {
  const out = { ...msg };
  const text = textFromMessage(el);
  if (text) out.text = text;
  // Tin chữ đã có nội dung thì khỏi dò thêm; còn lại (file, link, ảnh có chú thích) dò tiếp
  if (!text || msg.kind !== 'text') {
    const pl = attachmentFromMessage(el);
    if (!text && pl.text) out.text = pl.text;
    if (pl.url) out.url = pl.url;
    if (pl.fileName) out.fileName = pl.fileName;
    if (pl.linkTitle) out.linkTitle = pl.linkTitle;
  }
  const q = quoteFromMessage(el);
  if (q) out.quote = q;
  if (msg.kind === 'text' && !out.text) return null;
  return out;
}
