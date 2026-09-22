import { FIREBASE, OWNER_UID } from './lib/config.js';
import { createFb, FbError } from './lib/fb.js';
import {
  rootsFor, messagePatch, mergeMeta, linkPatch, purgeConvPatch, newLeadFromZalo,
  stageChangePatch, notePatch, takeBatch, isGroupConv,
} from './lib/zalo-map.js';

const local = {
  get: (k) => chrome.storage.local.get(k).then((r) => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
};
const fb = createFb({ apiKey: FIREBASE.apiKey, dbUrl: FIREBASE.dbUrl, store: local });
const MAX_KEYS = 1200; // ~200 tin x 6 trường

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.alarms.create('tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') { flush(); refreshLinks(); }
});

async function mustRoots() {
  const u = await fb.currentUser();
  if (!u) throw new FbError('AUTH', 'Chưa đăng nhập CRM', 401);
  return { ...rootsFor(u.uid, OWNER_UID), uid: u.uid };
}

async function setStatus(p) {
  const cur = (await chrome.storage.session.get('status')).status || {};
  await chrome.storage.session.set({ status: { ...cur, ...p } });
}

async function reportError(e) {
  const code = e && e.code;
  const error = code === 'PERMISSION_DENIED' ? 'rules' : code === 'AUTH' ? 'auth' : code === 'NETWORK' ? 'offline' : 'http';
  await setStatus({ error, errorMsg: String((e && e.message) || e) });
}

/* ---------- links ---------- */
async function getLinks() {
  return (await local.get('links')) || {};
}
async function refreshLinks() {
  if (!(await fb.currentUser())) return {};
  try {
    const r = await mustRoots();
    const links = (await fb.get(`${r.zalo}/links`)) || {};
    await local.set('links', links);
    await setStatus({ error: null });
    await tellZaloTabs({ type: 'links', links });
    return links;
  } catch (e) {
    await reportError(e);
    return getLinks();
  }
}
async function tellZaloTabs(message) {
  const tabs = await chrome.tabs.query({ url: 'https://chat.zalo.me/*' });
  await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, message).catch(() => {})));
}

/* ---------- hàng đợi ghi (idempotent: ghi lặp là ghi đè cùng giá trị) ---------- */
let flushing = false;
async function enqueue(patch) {
  if (!Object.keys(patch).length) return;
  const q = (await local.get('queue')) || [];
  q.push(patch);
  await local.set('queue', q);
  await setStatus({ queued: q.length });
}
async function flush() {
  if (flushing || !(await fb.currentUser())) return;
  flushing = true;
  try {
    let q = (await local.get('queue')) || [];
    while (q.length) {
      const [batch, used] = takeBatch(q, MAX_KEYS);
      await fb.patch('', batch);
      q = ((await local.get('queue')) || []).slice(used);
      await local.set('queue', q);
      await setStatus({ queued: q.length, lastSyncAt: Date.now(), error: null });
    }
  } catch (e) {
    await reportError(e);
  } finally {
    flushing = false;
  }
}

/* ---------- tin nhắn ---------- */
async function metaPatchFor(r, convId, msgs, link) {
  const cache = (await local.get('meta')) || {};
  let old = cache[convId];
  if (old === undefined) {
    try { old = await fb.get(`${r.zalo}/meta/${convId}`); } catch { old = null; }
  }
  const m = mergeMeta(old, msgs, { leadId: link.leadId, name: link.name || '', isGroup: isGroupConv(convId), updatedAt: Date.now() });
  cache[convId] = m;
  await local.set('meta', cache);
  return { [`${r.zalo}/meta/${convId}`]: m };
}

async function onMessages(convId, messages) {
  const link = (await getLinks())[convId];
  if (!link || link.status !== 'lead') return { ok: true, skipped: true };
  const r = await mustRoots();
  const patch = {};
  for (const m of messages) Object.assign(patch, messagePatch(r.zalo, m));
  Object.assign(patch, await metaPatchFor(r, convId, messages, link));
  await enqueue(patch);
  flush();
  return { ok: true };
}

/* ---------- lead ---------- */
async function readLead(r, leadId) {
  return fb.get(`${r.crm}/leads/${leadId}`);
}

async function handle(msg) {
  switch (msg.type) {
    case 'whoami': return { ok: true, user: await fb.currentUser() };
    case 'signIn': {
      const user = await fb.signIn(msg.email, msg.password);
      await local.remove('meta');
      await refreshLinks();
      return { ok: true, user };
    }
    case 'signOut':
      await fb.signOut();
      await Promise.all(['links', 'meta', 'queue'].map((k) => local.remove(k)));
      await chrome.storage.session.remove('status');
      return { ok: true };
    case 'getLinks': return { ok: true, links: await getLinks() };
    case 'messages': return onMessages(msg.convId, msg.messages || []);
    case 'activeConv':
      await chrome.storage.session.set({ activeConv: msg.conv || null });
      return { ok: true };
    case 'health':
      await setStatus({ zalo: msg.health });
      return { ok: true };
    case 'loadLeads': {
      const r = await mustRoots();
      const leads = (await fb.get(`${r.crm}/leads`)) || {};
      return { ok: true, leads: Object.values(leads).filter((l) => l && l.id) };
    }
    case 'getLead': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      const convs = Object.entries(await getLinks()).filter(([, l]) => l && l.leadId === msg.leadId).map(([c]) => c);
      const metas = await Promise.all(convs.map((c) => fb.get(`${r.zalo}/meta/${c}`).catch(() => null)));
      return { ok: true, lead, metas };
    }
    case 'link': {
      const r = await mustRoots();
      const now = new Date();
      let leadId = msg.leadId || null;
      let patch = {};
      if (msg.mode === 'create') {
        const lead = newLeadFromZalo(msg.form || {}, { uid: r.uid, now });
        leadId = lead.id;
        patch[`${r.crm}/leads/${lead.id}`] = lead;
        patch[`${r.crm}/updatedAt`] = now.toISOString();
      }
      const status = msg.mode === 'ignore' ? 'ignored' : 'lead';
      patch = { ...patch, ...linkPatch(r.zalo, msg.convId, { status, leadId, name: msg.name || '', now }) };
      await fb.patch('', patch);
      await refreshLinks();
      if (status === 'lead') {
        const cache = (await local.get('meta')) || {};
        delete cache[msg.convId];
        await local.set('meta', cache);
        await tellZaloTabs({ type: 'backfill', convId: msg.convId });
      }
      return { ok: true, leadId };
    }
    case 'unlink': {
      const r = await mustRoots();
      await fb.patch('', purgeConvPatch(r.zalo, msg.convId));
      const cache = (await local.get('meta')) || {};
      delete cache[msg.convId];
      await local.set('meta', cache);
      await refreshLinks();
      await tellZaloTabs({ type: 'forget', convId: msg.convId });
      return { ok: true };
    }
    case 'changeStage': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      if (!lead) throw new Error('Lead không còn tồn tại');
      if (lead.stage !== msg.stage) await fb.patch('', stageChangePatch(r.crm, lead, msg.stage, new Date()));
      return { ok: true, lead: await readLead(r, msg.leadId) };
    }
    case 'addNote': {
      const r = await mustRoots();
      const lead = await readLead(r, msg.leadId);
      if (!lead) throw new Error('Lead không còn tồn tại');
      await fb.patch('', notePatch(r.crm, lead, msg.text, new Date()));
      return { ok: true, lead: await readLead(r, msg.leadId) };
    }
    default:
      return { ok: false, error: 'Lệnh không hợp lệ: ' + msg.type };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, async (e) => {
    if (e && e.code) await reportError(e);
    sendResponse({ ok: false, error: String((e && e.message) || e), code: e && e.code });
  });
  return true; // phản hồi bất đồng bộ
});
