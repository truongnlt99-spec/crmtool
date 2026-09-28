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
 */

// Trích dẫn (tin trả lời) nằm chung bong bóng nhưng không phải nội dung tin.
const TRICH_DAN = '[class*="message-quote-fragment"]';
// Phòng xa: nếu Zalo chuyển mấy phần này vào trong container thì vẫn không lẫn vào nội dung.
const RAC = '[class*="card-send-time"], [class*="bubble-message-time"], [class*="message-reaction-container"], [class*="reaction-emoji"], [class*="message-sender-name"]';

/** Gom chữ trong một nhánh, bỏ trích dẫn và phần phụ; <br> thành xuống dòng, emoji lấy từ alt. */
export function chuTrongNhanh(root) {
  const bo = `${TRICH_DAN}, ${RAC}`;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(bo) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let t = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeType === 3) t += n.nodeValue;
    else if (n.tagName === 'BR') t += '\n';
    else if (n.tagName === 'IMG' && n.alt) t += n.alt;   // emoji được vẽ bằng <img alt="😀">
  }
  return t;
}

/** Nội dung tin, hoặc null nếu tin chưa vẽ xong / không phải tin chữ. */
export function textFromMessage(el) {
  const containers = [...el.querySelectorAll('[class*="text-message__container"]')];
  if (containers.length) {
    const t = containers.map(chuTrongNhanh).join('').trim();
    return t || null;
  }
  // Dự phòng cho bố cục khác: vẫn ưu tiên span.text như bản đầu
  const spans = [...el.querySelectorAll('span.text')].filter((s) => !s.closest(TRICH_DAN));
  const t = spans.map((s) => s.innerText).join('').trim();
  return t || null;
}

/** Trích dẫn của tin trả lời: { title, text } hoặc null. */
export function quoteFromMessage(el) {
  const q = el.querySelector('[class*="message-quote-fragment__description"]');
  if (!q) return null;
  const title = el.querySelector('[class*="message-quote-fragment__title"]');
  return { title: (title && title.textContent.trim()) || '', text: q.textContent.trim() };
}
