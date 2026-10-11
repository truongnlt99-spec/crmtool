/* Dán vào Console của TAB ZALO (chat.zalo.me), ở hội thoại đang có tin kèm link.
   CHỈ ĐỌC màn hình: không bấm, không gửi, không sửa gì. Gửi lại toàn bộ phần in ra. */
(() => {
  const gon = (h) => h.replace(/\s+/g, ' ')
    .replace(/(src|srcset|style|data-src)="[^"]{30,}"/g, '$1="…"')
    .slice(0, 2200);
  const els = [...document.querySelectorAll('[id^="bb_msg_id_"]')];

  console.log('=== TOAN CANH: ' + els.length + ' bong bong tren man hinh ===');
  els.forEach((el, i) => {
    const chu = (el.innerText || '').replace(/\s+/g, ' ').slice(0, 55);
    console.log(`#${i} ${el.id} | coContainerChu=${!!el.querySelector('[class*="text-message__container"]')}`
      + ` | a[href]=${el.querySelectorAll('a[href]').length} | "${chu}"`);
  });

  // Bong bong KHONG phai tin chu thuan: in nguyen cau truc
  const dangQuanTam = els.filter((el) => {
    const c = el.querySelector('[class*="text-message__container"]');
    const chuC = c ? (c.innerText || '').trim() : '';
    const chuEl = (el.innerText || '').trim();
    return !c || chuEl.length > chuC.length + 12;   // co phan ngoai chu: the link, file, chu thich...
  });
  console.log('\n=== ' + dangQuanTam.length + ' bong bong co phan NGOAI chu (thu link/file/anh) ===');
  dangQuanTam.slice(-4).forEach((el, i) => {
    console.log(`\n--- MAU ${i + 1} (${el.id}) ---`);
    console.log('innerText:', JSON.stringify((el.innerText || '').slice(0, 300)));
    // Thuoc tinh co the chua URL
    const thuocTinh = [];
    el.querySelectorAll('*').forEach((n) => {
      for (const a of n.attributes || []) {
        if (/^(href|data-|title|aria-label)/.test(a.name) && /https?:|\.(vn|com|net|org)\b/i.test(a.value)) {
          thuocTinh.push(`${n.tagName.toLowerCase()}[${a.name}]=${a.value.slice(0, 120)}`);
        }
      }
    });
    console.log('thuoc tinh co dau hieu URL:', thuocTinh.length ? thuocTinh : 'KHONG CO');
    console.log('html:', gon(el.outerHTML));
  });
  return 'Chep tat ca phan tren gui lai nhe';
})();
