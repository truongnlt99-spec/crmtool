/**
 * Chạy trong chat.zalo.me. CHỈ ĐỌC: không bấm, không mở hội thoại, không gửi tin.
 * - IndexedDB (zdb_<uid>): siêu dữ liệu tin của các hội thoại đã gắn lead.
 * - DOM hội thoại đang mở: chữ của tin, nối với IndexedDB qua cliMsgId.
 */
(async () => {
  const M = await import(chrome.runtime.getURL('lib/zalo-map.js'));
  const SCAN_MS = 15000;
  let db = null;
  let links = {};
  let lastActive = null;
  const doneDom = new Set(); // cliMsgId đã gửi kèm chữ trong phiên này

  const send = (m) => chrome.runtime.sendMessage(m).catch(() => null);
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const isLead = (convId) => links[convId] && links[convId].status === 'lead';

  async function openDb() {
    const dbs = await indexedDB.databases();
    const name = (dbs.find((d) => /^zdb_\d+$/.test(d.name || '')) || {}).name;
    if (!name) return null;
    const handle = await new Promise((res, rej) => {
      const r = indexedDB.open(name); // không truyền version -> không bao giờ tự nâng cấp DB của Zalo
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    // Zalo nâng cấp DB -> đóng ngay để không chặn Zalo, lần quét sau mở lại
    handle.onversionchange = () => { handle.close(); db = null; };
    return handle;
  }

  function checkHealth(h) {
    if (!h) return { ok: false, reason: 'chưa thấy dữ liệu Zalo (đã đăng nhập Zalo web chưa?)' };
    for (const s of ['message', 'friend']) if (!h.objectStoreNames.contains(s)) return { ok: false, reason: 'thiếu store ' + s };
    const idx = h.transaction('message', 'readonly').objectStore('message').indexNames;
    for (const i of ['cliMsgIdIndex', 'userId_sendDttm_msgId']) if (!idx.contains(i)) return { ok: false, reason: 'thiếu chỉ mục ' + i };
    return { ok: true };
  }

  async function ensureDb() {
    if (db) return true;
    try { db = await openDb(); } catch { db = null; }
    const health = checkHealth(db);
    await send({ type: 'health', health });
    if (!health.ok && db) { db.close(); db = null; }
    return health.ok;
  }

  const store = (name) => db.transaction(name, 'readonly').objectStore(name);
  async function friendName(uid) {
    if (!uid || uid === '0') return '';
    try {
      const f = await reqP(store('friend').get(uid));
      return f ? f.displayName || f.zaloName || '' : '';
    } catch { return ''; }
  }
  async function byCli(cli) {
    try { return await reqP(store('message').index('cliMsgIdIndex').get(cli)); } catch { return null; }
  }
  async function convSince(convId, since) {
    const range = IDBKeyRange.bound([convId, String(since)], [convId, '\uffff']);
    return reqP(store('message').index('userId_sendDttm_msgId').getAll(range));
  }

  /* ---------- quét IndexedDB: mọi hội thoại đã gắn ---------- */
  async function scanIdb() {
    if (!(await ensureDb())) return;
    const marks = (await chrome.storage.local.get('scanMarks')).scanMarks || {};
    for (const convId of Object.keys(links).filter(isLead)) {
      const since = marks[convId] || 0;
      let recs;
      try { recs = await convSince(convId, since); } catch { continue; }
      if (!recs.length) continue;
      const msgs = [];
      for (const rec of recs) msgs.push(M.fromIdbRecord(rec, await friendName(String(rec.fromUid))));
      const res = await send({ type: 'messages', convId, messages: msgs });
      if (res && res.ok) marks[convId] = Math.max(since, ...msgs.map((m) => m.at).filter(Number.isFinite));
    }
    await chrome.storage.local.set({ scanMarks: marks });
  }

  /* ---------- DOM hội thoại đang mở ---------- */
  function domText(el) {
    const spans = [...el.querySelectorAll('span.text')].filter((s) => !s.closest('[class*="message-quote-fragment"]'));
    const t = spans.map((s) => s.innerText).join('').trim();
    return t || null;
  }
  function domQuote(el) {
    const q = el.querySelector('[class*="message-quote-fragment__description"]');
    if (!q) return null;
    const title = el.querySelector('[class*="message-quote-fragment__title"]');
    return { title: (title && title.innerText.trim()) || '', text: q.innerText.trim() };
  }
  function headerName() {
    const h = document.querySelector('.header-title');
    return h ? (h.innerText || '').split('\n')[0].trim() : '';
  }

  async function scanDom() {
    if (!(await ensureDb())) return;
    const els = [...document.querySelectorAll('[id^="bb_msg_id_"]')];
    const count = {};
    const batches = {};
    for (const el of els) {
      const cli = el.id.slice('bb_msg_id_'.length);
      const rec = await byCli(cli);
      if (!rec) continue;
      const convId = String(rec.toUid);
      count[convId] = (count[convId] || 0) + 1;
      if (doneDom.has(cli) || !isLead(convId)) continue;
      const m = M.fromIdbRecord(rec, await friendName(String(rec.fromUid)));
      const text = domText(el);
      if (m.kind === 'text' && !text) continue; // chưa vẽ xong, lần quét sau thử lại
      m.text = text;
      const q = domQuote(el);
      if (q) m.quote = q;
      (batches[convId] = batches[convId] || []).push(m);
      doneDom.add(cli);
    }
    for (const [convId, msgs] of Object.entries(batches)) {
      const res = await send({ type: 'messages', convId, messages: msgs });
      if (!res || !res.ok) msgs.forEach((m) => doneDom.delete(m.cliMsgId));
    }
    const active = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const conv = active ? { convId: active[0], name: headerName(), isGroup: M.isGroupConv(active[0]) } : null;
    const key = JSON.stringify(conv);
    if (key !== lastActive) { lastActive = key; await send({ type: 'activeConv', conv }); }
  }

  /* ---------- nối dây ---------- */
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'links') { links = m.links || {}; }
    if (m.type === 'backfill' || m.type === 'forget') {
      chrome.storage.local.get('scanMarks').then(({ scanMarks }) => {
        const marks = scanMarks || {};
        delete marks[m.convId];
        return chrome.storage.local.set({ scanMarks: marks });
      }).then(async () => {
        const r = await send({ type: 'getLinks' });
        links = (r && r.links) || links;
        doneDom.clear();
        if (m.type === 'backfill') { await scanIdb(); await scanDom(); }
      });
    }
  });

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => scanDom().catch(console.warn), 400); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  async function tick() {
    const r = await send({ type: 'getLinks' });
    if (r && r.ok) links = r.links || {};
    await scanIdb().catch(console.warn);
    await scanDom().catch(console.warn);
  }
  await tick();
  setInterval(() => tick(), SCAN_MS);
})();
