import { OPEN_STAGES, STAGES, PACKAGES, LEAD_TYPES, searchLeads, waitingState, todayISOAt } from './lib/zalo-map.js';
import { CRM_URL } from './lib/config.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const STAGE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.name]));
const send = (m) => chrome.runtime.sendMessage(m);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => (v ? new Intl.NumberFormat('vi-VN').format(v) + ' đ' : '—');
const dateVN = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN') : '—');

const st = { user: null, conv: null, links: {}, status: {}, view: 'auto', leads: null, lead: null, metas: [], busy: false, error: '', flash: '' };

async function boot() {
  const who = await send({ type: 'whoami' });
  st.user = (who && who.user) || null;
  const s = await chrome.storage.session.get(['activeConv', 'status']);
  st.conv = s.activeConv || null;
  st.status = s.status || {};
  st.links = (await chrome.storage.local.get('links')).links || {};
  render();
  renderStatus();
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'session' && ch.activeConv) {
    const n = ch.activeConv.newValue || null;
    if ((n && n.convId) !== (st.conv && st.conv.convId)) {
      st.conv = n; st.view = 'auto'; st.lead = null; st.error = '';
      render();
    }
  }
  if (area === 'session' && ch.status) { st.status = ch.status.newValue || {}; renderStatus(); }
  if (area === 'local' && ch.links) { st.links = ch.links.newValue || {}; if (st.view === 'auto' && !st.busy) render(); }
});

const show = (html) => { app.innerHTML = html; };
const userLine = () => `<p class="tiny">Đăng nhập: ${esc(st.user.email)} · <a href="#" data-act="signout">Đăng xuất</a></p>`;
const convHead = (sub) => `<div class="conv"><div class="conv-name">${esc((st.conv && st.conv.name) || 'Hội thoại')}</div><div class="muted">${esc(sub)}</div></div>`;
const errLine = () => (st.error ? `<p class="err">${esc(st.error)}</p>` : '');
const linkOf = () => (st.conv ? st.links[st.conv.convId] : null);

function render() {
  if (!st.user) return renderLogin();
  if (!st.conv) return show(`<h1>HayDay CRM</h1><p class="muted">Mở một hội thoại trên Zalo web để xem lead tương ứng.</p>${errLine()}${userLine()}`);
  if (st.view === 'create') return renderCreate();
  if (st.view === 'attach') return renderAttach();
  const link = linkOf();
  if (!link) return renderUnlinked();
  if (link.status === 'ignored') return renderIgnored();
  return renderLinked(link);
}

function renderLogin() {
  show(`<h1>HayDay CRM</h1><p class="muted">Đăng nhập bằng tài khoản CRM (chỉ cần một lần trên máy này).</p>
  <form data-form="login">
    <label>Email<input name="email" type="email" required autocomplete="username"></label>
    <label>Mật khẩu<input name="password" type="password" required autocomplete="current-password"></label>
    ${errLine()}
    <button class="primary" type="submit">Đăng nhập</button>
  </form>`);
}

function renderUnlinked() {
  show(`${convHead((st.conv.isGroup ? 'Nhóm · ' : '') + 'Chưa gắn với lead nào')}
  <button class="primary block" data-act="create">＋ Tạo lead mới</button>
  <button class="block" data-act="attach">Gắn vào lead có sẵn…</button>
  <button class="block" data-act="ignore">Không phải khách</button>
  ${errLine()}
  <p class="tiny">Chọn một lần. Từ đó mọi tin của hội thoại này tự vào CRM.</p>
  ${userLine()}`);
}

function renderIgnored() {
  show(`${convHead('Đã đánh dấu: không phải khách')}
  <p class="muted">Tin nhắn của hội thoại này không được gửi lên CRM.</p>
  <button class="block" data-act="undo-ignore">Hoàn tác</button>
  ${errLine()}${userLine()}`);
}

function renderCreate() {
  show(`${convHead('Tạo lead mới')}
  <form data-form="create">
    <label>Tên khách hàng<input name="name" required value="${esc(st.conv.name || '')}"></label>
    <label>Số điện thoại<input name="phone" type="tel" placeholder="09xx xxx xxx"></label>
    <label>Ngày cưới<input name="weddingDate" type="date"></label>
    <label>Gói dịch vụ<select name="package">${PACKAGES.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
    <label>Loại lead<select name="leadType">${LEAD_TYPES.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
    ${errLine()}
    <div class="row"><button type="button" data-act="back">Hủy</button><button class="primary" type="submit">Tạo và gắn</button></div>
  </form>`);
}

async function renderAttach() {
  if (!st.leads) {
    show(`${convHead('Gắn vào lead có sẵn')}<p class="muted">Đang tải danh sách lead…</p>`);
    const r = await send({ type: 'loadLeads' });
    if (!r || !r.ok) { st.error = friendly(r); st.view = 'auto'; return render(); }
    st.leads = r.leads;
  }
  show(`${convHead('Gắn vào lead có sẵn')}
  <input id="q" placeholder="Tìm theo tên hoặc SĐT" autocomplete="off">
  <div id="results" class="results"></div>
  ${errLine()}
  <button class="block" data-act="back">Hủy</button>`);
  const q = document.getElementById('q');
  const draw = () => {
    const items = searchLeads(st.leads, q.value);
    document.getElementById('results').innerHTML = items.length
      ? items.map((l) => `<button class="result" data-act="pick" data-id="${esc(l.id)}"><b>${esc(l.name)}</b><span class="tiny">${esc(STAGE_NAME[l.stage] || l.stage)}${l.phone ? ' · ' + esc(l.phone) : ''}</span></button>`).join('')
      : `<p class="muted">${q.value.trim() ? 'Không thấy lead nào.' : 'Gõ tên hoặc số điện thoại để tìm.'}</p>`;
  };
  q.addEventListener('input', draw);
  q.value = st.conv.name || '';
  draw();
  q.focus();
}

async function renderLinked(link) {
  if (!st.lead || st.lead.id !== link.leadId) {
    show(convHead('Đang tải lead…'));
    const r = await send({ type: 'getLead', leadId: link.leadId });
    if (!r || !r.ok || !r.lead) {
      show(`${convHead('Không tải được lead (có thể đã bị xoá)')}${r && !r.ok ? `<p class="err">${esc(friendly(r))}</p>` : ''}
      <button class="block" data-act="unlink">Bỏ gắn hội thoại này</button>${userLine()}`);
      return;
    }
    st.lead = r.lead;
    st.metas = r.metas || [];
  }
  const l = st.lead;
  const w = waitingState(st.metas, Date.now());
  const closed = l.stage === 'won' || l.stage === 'lost';
  const overdue = !closed && l.deadline && l.deadline < todayISOAt(new Date());
  const stageCtl = closed
    ? `<div class="val">${esc(STAGE_NAME[l.stage])}</div>`
    : `<select data-change="stage">${OPEN_STAGES.map((s) => `<option value="${s.id}" ${s.id === l.stage ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
       <span class="tiny">Won/Lost: đổi trong CRM (cần doanh thu hoặc lý do).</span>`;
  show(`<div class="conv"><div class="conv-name">${esc(l.name)}</div><div class="muted">Zalo: ${esc(st.conv.name || '')}</div></div>
  ${w ? `<div class="chip ${w.type}">${esc(w.label)}</div>` : ''}
  <label>Giai đoạn${stageCtl}</label>
  <div class="kv"><span>Gói · dự kiến</span><b>${esc(l.package || '—')} · ${money(l.revenueExpected)}</b></div>
  <div class="kv"><span>Ngày cưới</span><b>${dateVN(l.weddingDate)}</b></div>
  <div class="kv"><span>Hạn liên hệ</span><b class="${overdue ? 'err' : ''}">${dateVN(l.deadline)}</b></div>
  <form data-form="note">
    <textarea name="text" rows="2" placeholder="Thêm ghi chú nhanh…"></textarea>
    <button type="submit">Lưu ghi chú</button>
  </form>
  ${errLine()}
  <div class="row"><a href="${CRM_URL}" target="_blank" rel="noopener">Mở trong CRM ↗</a><a href="#" data-act="unlink" class="danger">Bỏ gắn</a></div>
  ${userLine()}`);
}

function friendly(r) {
  if (!r) return 'Không liên lạc được với extension. Đóng rồi mở lại thanh bên.';
  if (r.code === 'PERMISSION_DENIED') return 'Chưa bật quyền cho dữ liệu Zalo (cần cập nhật Security Rules).';
  if (r.code === 'AUTH') return 'Sai email/mật khẩu hoặc phiên đăng nhập đã hết. Đăng nhập lại.';
  if (r.code === 'NETWORK') return 'Mất kết nối mạng. Thử lại sau.';
  return r.error || 'Có lỗi xảy ra.';
}

async function run(fn, onOk) {
  if (st.busy) return;
  st.busy = true; st.error = '';
  app.classList.add('busy');
  try {
    const r = await fn();
    if (!r || !r.ok) st.error = friendly(r);
    else if (onOk) onOk(r);
  } catch (e) {
    st.error = String(e.message || e);
  } finally {
    st.busy = false;
    app.classList.remove('busy');
    render();
  }
}

const doLink = (extra) => run(
  () => send({ type: 'link', convId: st.conv.convId, name: st.conv.name || '', ...extra }),
  () => { st.view = 'auto'; st.lead = null; st.leads = null; },
);

function flash(msg) {
  st.flash = msg;
  renderStatus();
  setTimeout(() => { st.flash = ''; renderStatus(); }, 2500);
}

function renderStatus() {
  const s = st.status || {};
  const parts = [];
  if (st.flash) parts.push(`<span class="ok">${esc(st.flash)}</span>`);
  if (s.zalo && !s.zalo.ok) parts.push(`<span class="err">Tạm ngưng đồng bộ: ${esc(s.zalo.reason || 'Zalo vừa thay đổi')}</span>`);
  if (s.error === 'rules') parts.push('<span class="err">Chưa bật quyền cho dữ liệu Zalo (Security Rules)</span>');
  else if (s.error === 'auth') parts.push('<span class="err">Cần đăng nhập lại CRM</span>');
  else if (s.error === 'offline') parts.push('<span class="err">Mất mạng — sẽ tự gửi lại</span>');
  else if (s.error === 'http') parts.push(`<span class="err">Lỗi máy chủ: ${esc(s.errorMsg || '')}</span>`);
  if (s.queued) parts.push(`${s.queued} lô đang chờ gửi`);
  if (s.boQuaTin) parts.push(`<span class="err">bỏ qua ${s.boQuaTin} tin mã lạ</span>`);
  if (s.boQuaLo) parts.push(`<span class="err">bỏ ${s.boQuaLo} lô máy chủ từ chối</span>`);
  if (s.lastSyncAt) parts.push(`Đồng bộ lúc ${new Date(s.lastSyncAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`);
  statusEl.innerHTML = parts.join(' · ');
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  e.preventDefault();
  st.error = '';
  switch (t.dataset.act) {
    case 'create': st.view = 'create'; return render();
    case 'attach': st.view = 'attach'; return render();
    case 'back': st.view = 'auto'; return render();
    case 'ignore': return doLink({ mode: 'ignore' });
    case 'pick': return doLink({ mode: 'attach', leadId: t.dataset.id });
    case 'undo-ignore': return run(() => send({ type: 'unlink', convId: st.conv.convId }));
    case 'unlink':
      if (!confirm('Bỏ gắn hội thoại này? Tin nhắn đã lưu của hội thoại sẽ bị xoá khỏi CRM (lead vẫn giữ nguyên).')) return;
      return run(() => send({ type: 'unlink', convId: st.conv.convId }), () => { st.lead = null; });
    case 'signout':
      await send({ type: 'signOut' });
      st.user = null; st.leads = null; st.lead = null;
      return render();
  }
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'login') return run(() => send({ type: 'signIn', email: data.email, password: data.password }), (r) => { st.user = r.user; });
  if (f.dataset.form === 'create') return doLink({ mode: 'create', form: data });
  if (f.dataset.form === 'note') {
    if (!String(data.text || '').trim()) return;
    return run(() => send({ type: 'addNote', leadId: st.lead.id, text: data.text }), (r) => { st.lead = r.lead; flash('Đã lưu ghi chú'); });
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.change === 'stage') {
    run(() => send({ type: 'changeStage', leadId: st.lead.id, stage: t.value }), (r) => { st.lead = r.lead; flash('Đã đổi giai đoạn'); });
  }
});

boot();
