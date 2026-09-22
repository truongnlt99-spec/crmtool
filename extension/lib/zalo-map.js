/**
 * Hàm thuần dùng chung cho extension Zalo, CRM (index.html) và test Node.
 * Không chạm DOM, mạng hay chrome.* — chỉ biến đổi dữ liệu.
 */

export const STAGES = [
  { id: 'leadin', name: 'Lead in' },
  { id: 'baogia', name: 'Báo giá' },
  { id: 'follow1', name: 'Follow up lần 1' },
  { id: 'follow2', name: 'Follow up lần 2' },
  { id: 'follow3', name: 'Follow up lần 3' },
  { id: 'nuoidaihan', name: 'Nuôi dài hạn' },
  { id: 'won', name: 'Won' },
  { id: 'lost', name: 'Lost' },
];
const STAGE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.name]));
export const OPEN_STAGES = STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost');
export const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'];
export const LEAD_TYPES = ['Lead công ty', 'Lead salehunt'];
export const SILENT_DAYS = 3;

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** Kho dữ liệu theo tài khoản — cùng quy ước với userDataRef() trong index.html. */
export function rootsFor(uid, ownerUid) {
  const owner = !uid || uid === ownerUid;
  return {
    crm: owner ? 'crmData' : `crmData_users/${uid}`,
    zalo: owner ? 'zalo' : `zalo_users/${uid}`,
  };
}

const KIND_BY_ORIGIN = {
  webchat: 'text',
  'chat.photo': 'image',
  'chat.sticker': 'sticker',
  'share.file': 'file',
  'chat.video.msg': 'video',
  'chat.webcontent': 'link',
  'chat.recommended': 'card',
};
export function kindOf(originMsgType) {
  return KIND_BY_ORIGIN[originMsgType] || 'other';
}
export const KIND_LABEL = {
  text: '', image: 'Hình ảnh', sticker: 'Sticker', file: 'File', video: 'Video',
  link: 'Liên kết', card: 'Danh thiếp', other: 'Tin nhắn đặc biệt',
};

export function isGroupConv(convId) {
  return String(convId).startsWith('g');
}

/** Bản ghi store `message` trong IndexedDB của Zalo web → tin chuẩn (chưa có chữ). */
export function fromIdbRecord(rec, friendName = '') {
  const me = String(rec.fromUid) === '0';
  return {
    msgId: String(rec.msgId),
    cliMsgId: String(rec.cliMsgId || ''),
    convId: String(rec.toUid),
    at: Number(rec.sendDttm),
    fromMe: me,
    senderUid: me ? '' : String(rec.fromUid),
    senderName: me ? '' : String(rec.dName || friendName || ''),
    kind: kindOf(rec.originMsgType),
  };
}

/**
 * Patch nhiều đường dẫn cho một tin. Ghi TỪNG TRƯỜNG để lần ghi chỉ có siêu dữ liệu
 * không xoá chữ đã ghi trước đó (chữ chỉ có khi hội thoại được mở trên Zalo web).
 */
export function messagePatch(zroot, msg) {
  if (!Number.isFinite(msg.at)) return {};
  const b = `${zroot}/msgs/${msg.convId}/${msg.msgId}`;
  const p = {
    [`${b}/at`]: msg.at,
    [`${b}/fromMe`]: !!msg.fromMe,
    [`${b}/kind`]: msg.kind,
    [`${b}/cliMsgId`]: msg.cliMsgId,
    [`${b}/senderUid`]: msg.senderUid || '',
  };
  if (msg.senderName) p[`${b}/senderName`] = msg.senderName;
  if (typeof msg.text === 'string') p[`${b}/text`] = msg.text;
  if (msg.quote) p[`${b}/quote`] = msg.quote;
  return p;
}

/** Gộp mốc thời gian theo kiểu lấy max/min — tin cũ đến sau không kéo lùi. */
export function mergeMeta(old, msgs, extra = {}) {
  const m = { firstAt: null, lastAt: null, lastCustomerAt: null, lastMeAt: null, ...(old || {}) };
  for (const x of msgs) {
    if (!Number.isFinite(x.at)) continue;
    m.firstAt = m.firstAt ? Math.min(m.firstAt, x.at) : x.at;
    m.lastAt = Math.max(m.lastAt || 0, x.at);
    if (x.fromMe) m.lastMeAt = Math.max(m.lastMeAt || 0, x.at);
    else m.lastCustomerAt = Math.max(m.lastCustomerAt || 0, x.at);
  }
  return { ...m, ...extra };
}

function khoang(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} phút`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ`;
  return `${Math.floor(ms / DAY)} ngày`;
}

/** Chip trên card/thanh bên: khách đang chờ mình, hoặc mình nhắn mà khách im lâu. */
export function waitingState(metas, nowMs, silentDays = SILENT_DAYS) {
  let lastC = 0, lastMe = 0;
  for (const m of metas || []) {
    if (!m) continue;
    lastC = Math.max(lastC, m.lastCustomerAt || 0);
    lastMe = Math.max(lastMe, m.lastMeAt || 0);
  }
  if (lastC && lastC > lastMe) {
    return { type: 'waiting', label: `Khách chờ trả lời · ${khoang(nowMs - lastC)}` };
  }
  if (lastMe && nowMs - lastMe >= silentDays * DAY) {
    return { type: 'silent', label: `Khách im ${Math.floor((nowMs - lastMe) / DAY)} ngày` };
  }
  return null;
}

export function todayISOAt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Cùng công thức với nowLabel() trong index.html: formatDate(todayISO()) + giờ:phút vi-VN. */
export function nowLabelAt(d) {
  const ngay = new Date(todayISOAt(d) + 'T00:00:00').toLocaleDateString('vi-VN');
  const gio = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${ngay}, ${gio}`;
}

/** Lead mới đúng cấu trúc submitAddLead() của app. */
export function newLeadFromZalo(form, { uid, now }) {
  const name = String(form.name || '').trim();
  if (!name) throw new Error('Thiếu tên khách hàng');
  const today = todayISOAt(now);
  return {
    id: 'L' + now.getTime(),
    ownerUid: uid || null,
    name,
    facebook: '',
    phone: String(form.phone || '').trim(),
    weddingDate: form.weddingDate || null,
    package: PACKAGES.includes(form.package) ? form.package : 'Standard',
    leadType: LEAD_TYPES.includes(form.leadType) ? form.leadType : 'Lead công ty',
    revenueExpected: 0,
    stage: 'leadin',
    deadline: today,
    expectedCloseMonth: null,
    createdAt: today,
    schedule: '', persona: '', objection: '',
    notesList: [], tags: [], todos: [],
    activityLog: [{ time: nowLabelAt(now), text: 'Lead được tạo (từ Zalo)', isNow: true }],
  };
}

export function stageChangeText(fromId, toId) {
  return `Chuyển từ "${STAGE_NAME[fromId] || fromId}" sang "${STAGE_NAME[toId] || toId}"`;
}

/** Chỉ số kế tiếp cho mảng Firebase (REST trả mảng hoặc object khoá số). */
function nextIndex(arr) {
  if (!arr) return 0;
  const ks = Object.keys(arr).map(Number).filter(Number.isInteger);
  return ks.length ? Math.max(...ks) + 1 : 0;
}

export function stageChangePatch(croot, lead, toId, now) {
  if (!OPEN_STAGES.some((s) => s.id === toId)) throw new Error('Won/Lost cần đổi trong CRM (cần doanh thu hoặc lý do).');
  const i = nextIndex(lead.activityLog);
  return {
    [`${croot}/leads/${lead.id}/stage`]: toId,
    [`${croot}/leads/${lead.id}/activityLog/${i}`]: { time: nowLabelAt(now), text: stageChangeText(lead.stage, toId), isNow: true },
    [`${croot}/updatedAt`]: now.toISOString(),
  };
}

export function notePatch(croot, lead, text, now) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Ghi chú trống');
  const label = nowLabelAt(now);
  return {
    [`${croot}/leads/${lead.id}/notesList/${nextIndex(lead.notesList)}`]: { id: 'n' + now.getTime(), text: t, createdAt: label, updatedAt: label },
    [`${croot}/updatedAt`]: now.toISOString(),
  };
}

export function linkPatch(zroot, convId, { status, leadId = null, name = '', now }) {
  return {
    [`${zroot}/links/${convId}`]: { status, leadId: status === 'lead' ? leadId : null, name, isGroup: isGroupConv(convId), linkedAt: now.getTime() },
  };
}

export function purgeConvPatch(zroot, convId) {
  return { [`${zroot}/links/${convId}`]: null, [`${zroot}/meta/${convId}`]: null, [`${zroot}/msgs/${convId}`]: null };
}

function boDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
const chuSo = (s) => String(s || '').replace(/\D/g, '');

export function searchLeads(leads, query, limit = 8) {
  const q = boDau(query), qs = chuSo(query);
  if (!q) return [];
  return (leads || [])
    .filter((l) => boDau(l.name).includes(q) || (qs.length >= 4 && chuSo(l.phone).includes(qs)))
    .slice(0, limit);
}

/** Gộp các patch đầu hàng đợi thành một lệnh PATCH ≤ maxKeys khoá (luôn lấy ít nhất 1). */
export function takeBatch(queue, maxKeys) {
  const out = {};
  let n = 0, keys = 0;
  for (const p of queue) {
    const k = Object.keys(p).length;
    if (n > 0 && keys + k > maxKeys) break;
    Object.assign(out, p);
    keys += k; n++;
  }
  return [out, n];
}
