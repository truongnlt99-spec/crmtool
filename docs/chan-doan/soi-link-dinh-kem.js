/* Dán nguyên khối này vào Console của TAB ZALO (chat.zalo.me), không phải tab CRM.
   Chỉ ĐỌC màn hình, không bấm, không gửi gì. Rồi gửi lại toàn bộ kết quả in ra. */
(() => {
  const RAC = '[class*="card-send-time"], [class*="bubble-message-time"], [class*="message-reaction-container"], [class*="reaction-emoji"], [class*="message-sender-name"]';
  const TRICH = '[class*="message-quote-fragment"]';
  const KHOI = new Set(['DIV','P','LI','UL','OL','TABLE','TR','SECTION','ARTICLE','HEADER','FOOTER','H1','H2','H3','H4','H5','H6']);
  const DUOI = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpe?g|png|gif|heic|webp|svg|mp4|mov|avi|mkv|mp3|m4a|wav|ai|psd|eps|apk|json)$/i;

  // Bản sao y hệt logic extension đang dùng, để xem nó trả về gì trên DOM thật
  function chuBongBong(root) {
    const w = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(`${TRICH}, ${RAC}`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let t = '';
    while (w.nextNode()) { const n = w.currentNode;
      if (n.nodeType === 3) t += n.nodeValue;
      else if (n.tagName === 'BR') t += '\n';
      else if (n.tagName === 'IMG' && n.alt && n.alt.length <= 8 && !DUOI.test(n.alt)) t += n.alt;
      else if (KHOI.has(n.tagName) && !t.endsWith('\n')) t += '\n'; }
    return t.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  const layLink = (el) => {
    for (const a of el.querySelectorAll('a[href], [data-href]')) {
      if (a.closest(TRICH)) continue;
      const h = a.getAttribute('href') || a.getAttribute('data-href') || '';
      if (/^https?:\/\//i.test(h)) return h;
    } return null;
  };

  const els = [...document.querySelectorAll('[id^="bb_msg_id_"]')];
  const bao = { soBongBong: els.length, mau: [] };
  const gon = (h) => h.replace(/\s+/g, ' ').replace(/(src|style|srcset)="[^"]{40,}"/g, '$1="…"').slice(0, 1400);

  for (const el of els) {
    const coChu = !!el.querySelector('[class*="text-message__container"]');
    const neo = [...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    const dh = [...el.querySelectorAll('[data-href]')].map((a) => a.getAttribute('data-href'));
    const dong = chuBongBong(el);
    const coUrlTrongChu = dong.some((d) => /https?:\/\/|www\./i.test(d));
    const coTenFile = dong.some((d) => DUOI.test(d));
    const dangNgo = !coChu || neo.length || dh.length || coUrlTrongChu || coTenFile;
    if (!dangNgo) continue;
    bao.mau.push({
      id: el.id, coContainerChu: coChu, hrefTimDuoc: neo, dataHref: dh,
      layLinkTraVe: layLink(el), dongChuDocDuoc: dong.slice(0, 6), coTenFile, coUrlTrongChu,
      html: gon(el.outerHTML),
    });
    if (bao.mau.length >= 3) break;
  }
  console.log('=== SOI LINK DINH KEM ===');
  console.log(JSON.stringify(bao, null, 1));
  return 'Chep toan bo phan tren gui lai nhe';
})();
