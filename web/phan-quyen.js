// Logic thuần về phân quyền tài khoản (kho dữ liệu nào được mở, ai được sửa/xem).
// KHÔNG chạm DOM / Firebase để test được bằng Node (test/phan-quyen.test.ts).
// index.html nạp bằng <script type="module"> (window.PhanQuyen). ownerUid luôn truyền vào,
// không hardcode ở đây.

const DAY_DU = () => ({ crm: true, zalo: true, ai: true });

export function quyenTaiKhoan(ban){
  const b = ban && typeof ban === 'object' ? ban : {};
  return {
    coKho: b.coKho !== false,
    admin: b.admin === true,
    khoa: b.khoa === true,
    ten: typeof b.ten === 'string' ? b.ten : '',
    email: typeof b.email === 'string' ? b.email : '',
  };
}

export function duongDanKho(chuKhoUid, ownerUid){
  if (chuKhoUid === ownerUid) return { crm: 'crmData', zalo: 'zalo', ai: 'aiData', appConfig: 'appConfig' };
  return {
    crm: `crmData_users/${chuKhoUid}`,
    zalo: `zalo_users/${chuKhoUid}`,
    ai: `aiData_users/${chuKhoUid}`,
    appConfig: `appConfig_users/${chuKhoUid}`,
  };
}

export function danhSachKho({ uid, ownerUid, taiKhoanToi, quyenXemToi, tatCaTaiKhoan }){
  const q = quyenTaiKhoan(taiKhoanToi);
  if (q.khoa) return [];
  const ds = [];
  const co = new Set();
  const them = k => { if (!co.has(k.uid)) { co.add(k.uid); ds.push(k); } };

  if (q.coKho) them({ uid, ten: q.ten || 'Kho của tôi', cuaToi: true, sua: true, nhom: DAY_DU() });

  if (q.admin) {
    const tat = tatCaTaiKhoan && typeof tatCaTaiKhoan === 'object' ? tatCaTaiKhoan : {};
    const tenCua = u => { const t = tat[u] || {}; return t.ten || t.email || u; };
    if (ownerUid !== uid || !q.coKho) {
      const t = tat[ownerUid] || {};
      them({ uid: ownerUid, ten: t.ten || t.email || 'Chủ kho', cuaToi: false, sua: true, nhom: DAY_DU() });
    }
    for (const u of Object.keys(tat)) {
      const t = tat[u];
      if (!t || t.coKho === false || u === uid) continue;
      them({ uid: u, ten: tenCua(u), cuaToi: false, sua: true, nhom: DAY_DU() });
    }
    return ds;
  }

  const xem = quyenXemToi && typeof quyenXemToi === 'object' ? quyenXemToi : {};
  for (const u of Object.keys(xem)) {
    const m = xem[u];
    if (!m || m.crm !== true) continue;
    them({
      uid: u,
      ten: m.tenChuKho || u,
      cuaToi: false,
      sua: false,
      nhom: { crm: true, zalo: m.zalo === true, ai: m.ai === true },
    });
  }
  return ds;
}

export function chonKho(ds, uidDaNho){
  if (!Array.isArray(ds) || !ds.length) return null;
  return ds.find(k => k.uid === uidDaNho) || ds[0];
}

export function chuanHoaQuyenXem(q){
  const gia = { crm: !!(q && q.crm), zalo: !!(q && q.zalo), ai: !!(q && q.ai) };
  if (!gia.crm && !gia.zalo && !gia.ai) return { ok: false, loi: 'Chọn ít nhất một nhóm dữ liệu để cho xem.' };
  if (!gia.crm) return { ok: false, loi: 'Muốn cho xem Zalo hoặc Hồ sơ AI thì phải tick CRM trước.' };
  return { ok: true, gia };
}

export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function veBangTaiKhoan(rows){
  const ds = Array.isArray(rows) ? rows : [];
  const e = escapeHtml;
  const dong = r => `<tr data-uid="${e(r.uid)}">`
    + `<td>${e(r.ten)}</td><td>${e(r.email)}</td>`
    + `<td>${r.coKho ? 'Có' : 'Không'}</td><td>${r.admin ? 'Admin' : ''}</td><td>${r.khoa ? 'Đã khoá' : ''}</td>`
    + `<td>${(Array.isArray(r.dangXem) ? r.dangXem : []).map(e).join(', ')}</td></tr>`;
  return '<table class="bang-tai-khoan"><thead><tr><th>Tên</th><th>Email</th><th>Có kho</th><th>Vai trò</th><th>Trạng thái</th><th>Đang xem</th></tr></thead>'
    + `<tbody>${ds.map(dong).join('')}</tbody></table>`;
}
