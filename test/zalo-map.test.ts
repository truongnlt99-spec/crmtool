/**
 * Test hàm thuần của extension Zalo. Không chạm mạng/database.
 */
import * as M from '../extension/lib/zalo-map.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
const HOUR = 3600_000, DAY = 24 * HOUR;

console.log('\n>> rootsFor');
check('chu cu -> crmData + zalo', JSON.stringify(M.rootsFor(OWNER, OWNER)) === JSON.stringify({ crm: 'crmData', zalo: 'zalo' }));
check('khong co uid -> chu cu', M.rootsFor('', OWNER).zalo === 'zalo');
check('tai khoan khac -> nhanh rieng', M.rootsFor('U1', OWNER).crm === 'crmData_users/U1' && M.rootsFor('U1', OWNER).zalo === 'zalo_users/U1');

console.log('\n>> kindOf / isGroupConv');
check('webchat -> text', M.kindOf('webchat') === 'text');
check('chat.photo -> image', M.kindOf('chat.photo') === 'image');
check('share.file -> file', M.kindOf('share.file') === 'file');
check('la -> other', M.kindOf('chat.xyz') === 'other' && M.kindOf(undefined) === 'other');
check('nhom bat dau bang g', M.isGroupConv('g123') && !M.isGroupConv('123'));

console.log('\n>> fromIdbRecord');
const recMe = { msgId: '7000000000001', cliMsgId: '1758500000000', toUid: '123456789012345678', fromUid: '0', sendDttm: '1758500000123', originMsgType: 'webchat', dName: '' };
const mMe = M.fromIdbRecord(recMe);
check('fromMe khi fromUid = "0"', mMe.fromMe === true && mMe.senderUid === '' && mMe.senderName === '');
check('at la so', mMe.at === 1758500000123);
check('convId = toUid', mMe.convId === '123456789012345678');
check('kind text', mMe.kind === 'text');
const recKh = { ...recMe, msgId: '7000000000002', fromUid: '999', dName: 'Lan (nhom)' };
check('ten tu dName', M.fromIdbRecord(recKh, 'Lan ban be').senderName === 'Lan (nhom)');
check('ten tu danh ba khi thieu dName', M.fromIdbRecord({ ...recKh, dName: '' }, 'Lan ban be').senderName === 'Lan ban be');

console.log('\n>> messagePatch');
const base = 'zalo/msgs/123456789012345678/7000000000001';
const pMeta = M.messagePatch('zalo', mMe);
check('chi sieu du lieu -> KHONG co khoa text', !(`${base}/text` in pMeta) && pMeta[`${base}/at`] === 1758500000123);
check('co fromMe, kind, cliMsgId', pMeta[`${base}/fromMe`] === true && pMeta[`${base}/kind`] === 'text' && pMeta[`${base}/cliMsgId`] === '1758500000000');
const pText = M.messagePatch('zalo', { ...mMe, text: 'Chào em', quote: { title: 'Lan', text: 'hỏi giá' } });
check('co chu -> co khoa text', pText[`${base}/text`] === 'Chào em');
check('co trich dan', pText[`${base}/quote`].text === 'hỏi giá');
check('at khong hop le -> patch rong', Object.keys(M.messagePatch('zalo', { ...mMe, at: NaN })).length === 0);

console.log('\n>> mergeMeta');
const msgs = [
  { ...mMe, at: 1000, fromMe: false }, { ...mMe, at: 3000, fromMe: true }, { ...mMe, at: 2000, fromMe: false },
];
const meta1 = M.mergeMeta(null, msgs, { leadId: 'L1' });
check('first/last', meta1.firstAt === 1000 && meta1.lastAt === 3000);
check('lastCustomerAt / lastMeAt', meta1.lastCustomerAt === 2000 && meta1.lastMeAt === 3000);
check('giu extra', meta1.leadId === 'L1');
const meta2 = M.mergeMeta(meta1, [{ ...mMe, at: 500, fromMe: true }]);
check('tin cu hon khong keo lui last', meta2.lastAt === 3000 && meta2.lastMeAt === 3000 && meta2.firstAt === 500);

console.log('\n>> waitingState');
const now = 1_760_000_000_000;
const w = M.waitingState([{ lastCustomerAt: now - 2 * HOUR, lastMeAt: now - 5 * HOUR }], now);
check('khach nhan sau cung -> cho tra loi', w?.type === 'waiting' && w.label === 'Khách chờ trả lời · 2 giờ', JSON.stringify(w));
const w2 = M.waitingState([{ lastCustomerAt: now - 5 * DAY, lastMeAt: now - 4 * DAY }], now);
check('minh nhan sau cung, qua 3 ngay -> im lang', w2?.type === 'silent' && w2.label === 'Khách im 4 ngày', JSON.stringify(w2));
check('vua tra loi -> khong chip', M.waitingState([{ lastCustomerAt: now - 5 * HOUR, lastMeAt: now - 1 * HOUR }], now) === null);
check('nhieu hoi thoai lay moi nhat', M.waitingState([{ lastCustomerAt: now - 9 * DAY, lastMeAt: now - 8 * DAY }, { lastCustomerAt: now - 10 * 60_000, lastMeAt: 0 }], now)?.label === 'Khách chờ trả lời · 10 phút');
check('khong co du lieu -> null', M.waitingState([], now) === null && M.waitingState([null], now) === null);

console.log('\n>> nhan thoi gian giong app');
const d = new Date(2026, 8, 22, 14, 5);
check('todayISOAt', M.todayISOAt(d) === '2026-09-22');
check('nowLabelAt dang "D/M/YYYY, HH:MM"', /^\d{1,2}\/\d{1,2}\/2026, \d{2}:\d{2}$/.test(M.nowLabelAt(d)), M.nowLabelAt(d));

console.log('\n>> newLeadFromZalo');
const lead = M.newLeadFromZalo({ name: '  Ngọc Hân ', phone: '0901 234 567', weddingDate: '2026-12-20', package: 'Signature', leadType: 'Lead salehunt' }, { uid: 'U9', now: d });
check('id theo thoi diem', lead.id === 'L' + d.getTime());
check('truong bat buoc cho rules', lead.name === 'Ngọc Hân' && lead.stage === 'leadin' && !!lead.id);
check('ownerUid + ngay tao + han', lead.ownerUid === 'U9' && lead.createdAt === '2026-09-22' && lead.deadline === '2026-09-22');
check('giu goi + loai hop le', lead.package === 'Signature' && lead.leadType === 'Lead salehunt');
check('activityLog ghi nguon Zalo', lead.activityLog[0].text === 'Lead được tạo (từ Zalo)' && lead.activityLog[0].isNow === true);
const lead2 = M.newLeadFromZalo({ name: 'A', package: 'xyz', leadType: 'abc' }, { uid: 'U9', now: d });
check('goi/loai la -> mac dinh', lead2.package === 'Standard' && lead2.leadType === 'Lead công ty');
let threw = false; try { M.newLeadFromZalo({ name: '  ' }, { uid: 'U9', now: d }); } catch { threw = true; }
check('thieu ten -> loi', threw);

console.log('\n>> stageChangePatch / notePatch');
const L = { id: 'L1', stage: 'leadin', activityLog: [{ time: 'x', text: 'a' }, { time: 'y', text: 'b' }] };
const sp = M.stageChangePatch('crmData', L, 'baogia', d);
check('doi stage', sp['crmData/leads/L1/stage'] === 'baogia');
check('noi activityLog dung index + cau chu app', sp['crmData/leads/L1/activityLog/2']?.text === 'Chuyển từ "Lead in" sang "Báo giá"', JSON.stringify(sp));
check('cham updatedAt', typeof sp['crmData/updatedAt'] === 'string');
threw = false; try { M.stageChangePatch('crmData', L, 'won', d); } catch { threw = true; }
check('won/lost bi chan', threw);
const np = M.notePatch('crmData', { id: 'L1' }, ' khách hẹn thứ 5 ', d);
check('ghi chu index 0 khi chua co', np['crmData/leads/L1/notesList/0']?.text === 'khách hẹn thứ 5');
check('ghi chu co id + nhan', np['crmData/leads/L1/notesList/0'].id === 'n' + d.getTime() && np['crmData/leads/L1/notesList/0'].createdAt === M.nowLabelAt(d));

console.log('\n>> linkPatch / purgeConvPatch');
const lp = M.linkPatch('zalo', 'g77', { status: 'lead', leadId: 'L1', name: 'Nhóm cưới', now: d });
check('link nhom', lp['zalo/links/g77'].isGroup === true && lp['zalo/links/g77'].leadId === 'L1' && lp['zalo/links/g77'].linkedAt === d.getTime());
const pp = M.purgeConvPatch('zalo', 'g77');
check('go sach 3 nhanh', pp['zalo/links/g77'] === null && pp['zalo/meta/g77'] === null && pp['zalo/msgs/g77'] === null);

console.log('\n>> searchLeads');
const leads = [{ id: 'L1', name: 'Lan Nguyễn', phone: '090 123 4567' }, { id: 'L2', name: 'Minh Tuấn', phone: '' }];
check('khong dau van tim duoc', M.searchLeads(leads, 'lan nguyen').map((l: any) => l.id).join() === 'L1');
check('tim theo so', M.searchLeads(leads, '1234567').map((l: any) => l.id).join() === 'L1');
check('rong -> rong', M.searchLeads(leads, '  ').length === 0);

console.log('\n>> takeBatch');
const [b1, n1] = M.takeBatch([{ a: 1, b: 2 }, { c: 3 }, { d: 4, e: 5 }], 3);
check('gop toi da 3 khoa', JSON.stringify(b1) === JSON.stringify({ a: 1, b: 2, c: 3 }) && n1 === 2);
const [b2, n2] = M.takeBatch([{ a: 1, b: 2, c: 3, d: 4 }, { e: 5 }], 3);
check('lo qua lon van lay 1', Object.keys(b2).length === 4 && n2 === 1);

console.log('\n>> Ten nguoi gui bi Zalo ma hoa (dName base64)');
const MA_HOA = 'lDWqNsuflkEXdcRVtAc6QXLvzLNX6Ux1sM1b53pxss0=';
check('nhan ra chuoi ma hoa', M.looksEncrypted(MA_HOA));
check('ten that khong bi coi la ma hoa', !M.looksEncrypted('Lan Nguyễn') && !M.looksEncrypted('Chloe') && !M.looksEncrypted('') && !M.looksEncrypted('AnhKhoaBase'));
check('fromIdbRecord bo dName ma hoa, dung ten danh ba', M.fromIdbRecord({ ...recKh, dName: MA_HOA }, 'Lan ban be').senderName === 'Lan ban be');
check('fromIdbRecord bo dName ma hoa, khong co danh ba -> rong', M.fromIdbRecord({ ...recKh, dName: MA_HOA }).senderName === '');
const conv11 = { convId: '123', name: 'Vợ yêu', isGroup: false };
const convNhom = { convId: 'g9', name: 'Nhóm cưới', isGroup: true };
check('chat 1-1 -> ten cuoc hoi thoai', M.displaySender({ fromMe: false, senderName: MA_HOA }, conv11) === 'Vợ yêu');
check('chat 1-1 du lieu cu khong co ten -> van la ten hoi thoai', M.displaySender({ fromMe: false }, conv11) === 'Vợ yêu');
check('nhom + ten that -> giu ten', M.displaySender({ fromMe: false, senderName: 'Minh Tuấn' }, convNhom) === 'Minh Tuấn');
check('nhom + ten ma hoa -> rong', M.displaySender({ fromMe: false, senderName: MA_HOA }, convNhom) === '');
check('tin cua minh -> rong', M.displaySender({ fromMe: true, senderName: 'x' }, conv11) === '');
check('khong biet hoi thoai -> loc ma hoa', M.displaySender({ fromMe: false, senderName: MA_HOA }, null) === '');

console.log('\n>> conversationList (tab Hoi thoai)');
{
  const NOW = 1_760_000_000_000;
  const links = {
    c1: { status: 'lead', leadId: 'L1', name: 'Lan Nguyễn' },
    g2: { status: 'lead', leadId: 'L2', name: 'Nhóm cưới Hân & Tú' },
    c3: { status: 'lead', leadId: 'L3', name: 'Thảo Vy' },
    c4: { status: 'ignored', leadId: null, name: 'Mẹ' },
    c5: { status: 'lead', leadId: 'LXOA', name: 'Lead đã xoá' },
    c6: { status: 'lead', leadId: 'L6', name: 'Khách đã chốt' },
  };
  const meta = {
    c1: { lastAt: NOW - 2 * HOUR, lastCustomerAt: NOW - 2 * HOUR, lastMeAt: NOW - 5 * HOUR },
    g2: { lastAt: NOW - 4 * HOUR, lastCustomerAt: NOW - 4 * HOUR, lastMeAt: 0 },
    c3: { lastAt: NOW - 4 * DAY, lastCustomerAt: NOW - 6 * DAY, lastMeAt: NOW - 4 * DAY },
    c6: { lastAt: NOW - 1 * HOUR, lastCustomerAt: NOW - 1 * HOUR, lastMeAt: 0 },
  };
  const leads = [
    { id: 'L1', name: 'Lan Nguyễn', stage: 'baogia', package: 'Signature' },
    { id: 'L2', name: 'Ngọc Hân', stage: 'follow1', package: 'Unique' },
    { id: 'L3', name: 'Thảo Vy', stage: 'follow2', package: 'Standard' },
    { id: 'L6', name: 'Khách đã chốt', stage: 'won', package: 'Standard' },
  ];
  const r = M.conversationList({ links, meta, leads, now: NOW });
  check('bo hoi thoai "khong phai khach" va lead da xoa', r.items.map((x: any) => x.convId).join() === 'c6,c1,g2,c3', r.items.map((x: any) => x.convId).join());
  check('moi nhat len dau', r.items[0].convId === 'c6');
  check('co ten lead + giai doan', r.items[2].leadName === 'Ngọc Hân' && r.items[2].stageName === 'Follow up lần 1' && r.items[2].isGroup === true);
  check('chip cho tra loi', r.items[1].state?.type === 'waiting');
  check('chip khach im', r.items[3].state?.type === 'silent');
  check('lead Won/Lost khong co chip', r.items[0].state === null);
  check('dem theo bo loc', r.counts.all === 4 && r.counts.waiting === 2 && r.counts.silent === 1, JSON.stringify(r.counts));
  const rw = M.conversationList({ links, meta, leads, now: NOW, filter: 'waiting' });
  check('loc cho tra loi', rw.items.map((x: any) => x.convId).join() === 'c1,g2');
  check('loc van giu so dem tong', rw.counts.all === 4);
  check('tim khong dau theo ten hoi thoai', M.conversationList({ links, meta, leads, now: NOW, query: 'thao vy' }).items.map((x: any) => x.convId).join() === 'c3');
  check('tim theo ten lead (nhom)', M.conversationList({ links, meta, leads, now: NOW, query: 'ngoc han' }).items.map((x: any) => x.convId).join() === 'g2');
  const khongMeta = M.conversationList({ links: { c9: { status: 'lead', leadId: 'L1', name: 'Mới gắn' } }, meta: {}, leads, now: NOW });
  check('chua co meta van hien, khong loi', khongMeta.items.length === 1 && khongMeta.items[0].lastAt === null && khongMeta.items[0].state === null);
  check('du lieu rong', M.conversationList({ links: null, meta: null, leads: [], now: NOW }).items.length === 0);
}

console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
if (fail) process.exitCode = 1;
