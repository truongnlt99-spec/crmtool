// Nạp venue + sản phẩm (link bài HayDay + tone) vào kho của Trân (crmData), rút từ dữ liệu lead hiện có.
// Chạy thử: node scripts/nap-venue-tran.mjs        (chỉ in ra, không ghi)
// Ghi thật: node scripts/nap-venue-tran.mjs --ghi  (cần .env.local chứa FIREBASE_SERVICE_ACCOUNT)
// Chạy lại không phá gì: venue trùng tên (không dấu) thì dùng lại, sản phẩm trùng link trong venue thì bỏ,
// lead đã có venueId thì không đụng. Chỉ PATCH đúng đường dẫn mới (venues/<id>, toneMau/<id>, leads/<id>/venueId).
import fs from 'node:fs';
import { createSign } from 'node:crypto';
import { khopVenueMau, timVenueTheoTen, taoId } from '../web/venue.js';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const KHO = 'crmData';   // kho của Trân (OWNER_UID)
const GHI = process.argv.includes('--ghi');

// Venue có trong dữ liệu nhưng chưa nằm trong VENUE_MAU (chỉ thấy qua link sản phẩm)
const VENUE_THEM = ['Merastic', 'Bảo tàng Y học cổ truyền', 'Chưa rõ venue'];
const TONE_THEM = [{ id: 'tn_nau', ten: 'Nâu', mau: '#8B5E3C' }];

// Sản phẩm rút từ ghi chú lead (link HayDay đã gửi khách + câu mô tả ngay trước link). Ngày 28/10/2026.
const SAN_PHAM = [
  { venue: 'Gem Center', ten: 'Phim phóng sự tiệc tại Gem Center (decor khu vườn cổ tích, có first dance)', link: 'https://www.youtube.com/watch?v=UrGCdCBCqq4', tone: [] },
  { venue: 'Thisky Hall', ten: 'Phim phóng sự tiệc tại Thisky Hall', link: 'https://www.youtube.com/watch?v=RzjhHL1aHmk', gia: 'Gói Unique', tone: [] },
  { venue: 'An Lâm Retreats', ten: 'Hình phóng sự tiệc có vows tại An Lâm', link: 'https://www.facebook.com/share/p/1EYmDgqMRE/', tone: [] },
  { venue: 'An Lâm Retreats', ten: 'Phim phóng sự có vows và first look tại An Lâm', link: 'https://www.youtube.com/watch?v=ox2AnZNj3EA', tone: [] },
  { venue: 'An Lâm Retreats', ten: 'Phim phóng sự Hà My – Trí tại An Lâm (vows, first look, minigame)', link: 'https://www.youtube.com/watch?v=aVUJWP-5WE0', tone: [] },
  { venue: 'Merastic', ten: 'Phim phóng sự tiệc tại Merastic', link: 'https://www.youtube.com/watch?v=JXoG6VPow-Q', gia: 'Gói Unique', tone: [] },
  { venue: 'Vũ Garden', ten: 'Pre Wedding tại Vũ Garden', link: 'https://www.facebook.com/share/p/1CVu3NJTDw/', tone: [] },
  { venue: 'Bảo tàng Y học cổ truyền', ten: 'Pre Wedding tại Bảo tàng Y học cổ truyền', link: 'https://www.facebook.com/media/set/?set=a.997317722408777&type=3', tone: [] },
  { venue: 'Chưa rõ venue', ten: 'Ảnh áo dài be, decor tông be', link: 'https://www.facebook.com/hayday.media/posts/pfbid02Yj2ExYNiEbxSKZspiX9Sv6JDiNmRUoNoPgofEAKccJBX2Tk6mbkqNTGPi11QTjtel', tone: ['be'] },
  { venue: 'Chưa rõ venue', ten: 'Ảnh áo dài hồng, decor tông be', link: 'https://www.facebook.com/hayday.media/posts/pfbid0ZEcsAgooFa2iFCSdnuogGMyj6hjetU4LXdCxV2S7XLWzWxsFCj5ih4G8kDcnh96dl', tone: ['hong', 'be'] },
  { venue: 'Chưa rõ venue', ten: 'Ảnh áo dài hồng, decor tông be (2)', link: 'https://www.facebook.com/hayday.media/posts/pfbid0osHpwcrRcTt7nnQjweNYHGFACrPxmHAYZc85hF3ehsTV8EHuecTVYUg1ZGK2r1FDl', tone: ['hong', 'be'] },
  { venue: 'Chưa rõ venue', ten: 'Ảnh decor tông xanh dương hồng', link: 'https://www.facebook.com/hayday.media/posts/pfbid0F4QxxLMKhib9pV1JQqGMjHAgDAbeYoshyN4ST9GWciTzvL99JdozqKsK4VuQSWsYl', tone: ['xanh-duong', 'hong'] },
  { venue: 'Chưa rõ venue', ten: 'Hình phóng sự lễ gia tiên tông xanh lá', link: 'https://www.facebook.com/share/p/14jVNyM7eMy/', tone: ['xanh-la'] },
  { venue: 'Chưa rõ venue', ten: 'Hình phóng sự gia tiên tone xanh lá (2)', link: 'https://www.facebook.com/hayday.media/posts/pfbid02mqEot8m6gsKYGDC6SfoG6LRNjd3RpwueA1fQ1ZwASnU7vFAXnPWuQRwB3cWUnJd9l', tone: ['xanh-la'] },
  { venue: 'Chưa rõ venue', ten: 'Hình phóng sự lễ gia tiên tông đỏ', link: 'https://www.facebook.com/share/p/14g6QWqaQGa/', tone: ['do'] },
  { venue: 'Chưa rõ venue', ten: 'Phóng sự decor tông đỏ be, lễ và tiệc tại nhà', link: 'https://www.facebook.com/share/p/1Esrbgpknt/', gia: 'Gói Standard', tone: ['do', 'be'] },
  { venue: 'Chưa rõ venue', ten: 'Phim phóng sự decor tone nâu tại nhà hàng', link: 'https://www.youtube.com/watch?v=m32vHP6LgLA', tone: ['tn_nau'] },
  { venue: 'Chưa rõ venue', ten: 'Clip lễ gia tiên decor tông vàng đồng', link: 'https://www.facebook.com/share/v/1EMsHmbPFT/', tone: ['vang'] },
];

const envPath = new URL('../.env.local', import.meta.url);
const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').trim() : '');
if (!raw) { console.error('Thieu .env.local (FIREBASE_SERVICE_ACCOUNT)'); process.exit(1); }
const sa = JSON.parse(raw);
const b64 = (x) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = Math.floor(Date.now() / 1000);
const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }));
const sg = createSign('RSA-SHA256'); sg.update(`${head}.${claim}`);
const tk = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64(sg.sign(sa.private_key.replace(/\\n/g, '\n')))}` }),
})).json()).access_token;
if (!tk) throw new Error('Khong lay duoc access token');
const url = (p) => `${DB}/${p}.json?access_token=${tk}`;

const d = await (await fetch(url(KHO))).json();
if (!d || !d.leads) throw new Error('Khong doc duoc kho ' + KHO);
const venues = { ...(d.venues || {}) };
const toneMau = d.toneMau || {};
const leads = Object.values(d.leads);
const patch = {};
const isoNow = new Date().toISOString();

const layVenue = (ten) => {
  const co = timVenueTheoTen(venues, ten);
  if (co) return co.id;
  const id = taoId('vn_');
  venues[id] = { id, ten, taoLuc: isoNow };
  patch[`venues/${id}`] = venues[id];
  return id;
};

// 1. Venue gợi ý từ lead + gắn lead khớp đúng 1 venue (chưa có venueId)
const { goiY, canChonTay } = khopVenueMau(leads, venues);
let soGan = 0;
for (const g of goiY) {
  const id = layVenue(g.ten);
  for (const lid of g.leadIds) {
    if (!d.leads[lid]) throw new Error(`Lead ${lid} không nằm ở leads/${lid} — dừng để không ghi lệch chỗ`);
    patch[`leads/${lid}/venueId`] = id; soGan++;
  }
}
for (const t of VENUE_THEM) layVenue(t);

// 2. Tone thêm
for (const t of TONE_THEM) if (!toneMau[t.id]) patch[`toneMau/${t.id}`] = t;

// 3. Sản phẩm
let soSp = 0;
for (const sp of SAN_PHAM) {
  const vid = layVenue(sp.venue);
  const v = venues[vid];
  const coSan = Object.values(v.sanPham || {}).some((x) => x && x.link === sp.link);
  if (coSan) continue;
  const id = taoId('sp_');
  const obj = { id, ten: sp.ten, link: sp.link, gia: sp.gia || null, tone: sp.tone, taoLuc: isoNow };
  v.sanPham = { ...(v.sanPham || {}), [id]: obj };
  // Một lệnh PATCH không được có cả venues/<id> lẫn đường dẫn con của nó -> venue mới thì nhét sản phẩm vào object venue
  if (patch[`venues/${vid}`]) patch[`venues/${vid}`] = v;
  else patch[`venues/${vid}/sanPham/${id}`] = obj;
  soSp++;
}

const tenLead = (id) => (d.leads[id] && d.leads[id].name) || id;
const soVenueMoi = Object.keys(patch).filter((k) => /^venues\/[^/]+$/.test(k)).length;
console.log(`Venue mới: ${soVenueMoi} · gắn lead: ${soGan} · sản phẩm mới: ${soSp} · tone mới: ${Object.keys(patch).filter((k) => k.startsWith('toneMau/')).length}`);
for (const g of goiY) console.log(`  ${g.ten}: ${g.leadIds.map(tenLead).join(', ') || '(không gắn lead)'}`);
console.log('Lead nhắc ≥2 venue (để Trân tự chọn):');
for (const c of canChonTay) console.log(`  ${tenLead(c.leadId)}: ${c.ten.join(' / ')}`);

if (!GHI) { console.log('\n(Chạy thử — chưa ghi. Thêm --ghi để ghi thật.)'); process.exit(0); }
if (!Object.keys(patch).length) { console.log('Không có gì mới để ghi.'); process.exit(0); }
patch.updatedAt = isoNow;
const r = await fetch(url(KHO), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
if (!r.ok) throw new Error(`Ghi lỗi ${r.status}: ${await r.text()}`);
console.log(`\nĐã ghi ${Object.keys(patch).length - 1} đường dẫn vào ${KHO}.`);
