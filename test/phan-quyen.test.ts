/**
 * Test hàm thuần phân quyền tài khoản (web/phan-quyen.js). Không chạm mạng/database.
 */
import * as P from '../web/phan-quyen.js';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${detail}`); }
};
const OWNER = '7ePgCPmzxHdEAEazHo9IkyKf2rw2';
const uids = (ds: any[]) => ds.map(k => k.uid).join(',');
const ALL = { crm: true, zalo: true, ai: true };

console.log('duongDanKho');
check('owner -> crmData', P.duongDanKho(OWNER, OWNER).crm === 'crmData');
check('owner -> zalo/aiData/appConfig', (() => { const d = P.duongDanKho(OWNER, OWNER); return d.zalo === 'zalo' && d.ai === 'aiData' && d.appConfig === 'appConfig'; })());
check('tai khoan khac -> zalo_users/U2', P.duongDanKho('U2', OWNER).zalo === 'zalo_users/U2');
check('tai khoan khac -> du 4 nhanh', (() => { const d = P.duongDanKho('U2', OWNER); return d.crm === 'crmData_users/U2' && d.ai === 'aiData_users/U2' && d.appConfig === 'appConfig_users/U2'; })());

console.log('quyenTaiKhoan');
check('null -> mac dinh', (() => { const q = P.quyenTaiKhoan(null); return q.coKho === true && q.admin === false && q.khoa === false; })());
check('doc coKho false / admin / khoa', (() => { const q = P.quyenTaiKhoan({ coKho: false, admin: true, khoa: true, ten: 'A', email: 'a@x' }); return q.coKho === false && q.admin && q.khoa && q.ten === 'A' && q.email === 'a@x'; })());
check('ten/email mac dinh rong', (() => { const q = P.quyenTaiKhoan({}); return q.ten === '' && q.email === ''; })());

console.log('danhSachKho');
const tran = P.danhSachKho({ uid: OWNER, ownerUid: OWNER, taiKhoanToi: null, quyenXemToi: null, tatCaTaiKhoan: null });
check('Tran: 1 kho cuaToi + sua', tran.length === 1 && tran[0].uid === OWNER && tran[0].cuaToi && tran[0].sua);
check('Tran: du 3 nhom', JSON.stringify(tran[0].nhom) === JSON.stringify(ALL));

const sep = P.danhSachKho({ uid: 'S', ownerUid: OWNER, taiKhoanToi: { coKho: false },
  quyenXemToi: { [OWNER]: { crm: true, zalo: false, ai: true, tenChuKho: 'Trân' } }, tatCaTaiKhoan: null });
check('Sep: 1 kho chi xem', sep.length === 1 && sep[0].uid === OWNER && sep[0].sua === false && !sep[0].cuaToi && sep[0].ten === 'Trân');
check('Sep: nhom dung', JSON.stringify(sep[0].nhom) === JSON.stringify({ crm: true, zalo: false, ai: true }));
check('coKho false khong quyen -> []', P.danhSachKho({ uid: 'S', ownerUid: OWNER, taiKhoanToi: { coKho: false }, quyenXemToi: null, tatCaTaiKhoan: null }).length === 0);
check('muc crm false bi bo', P.danhSachKho({ uid: 'S', ownerUid: OWNER, taiKhoanToi: { coKho: false }, quyenXemToi: { [OWNER]: { crm: false, zalo: true } }, tatCaTaiKhoan: null }).length === 0);
const thuong = P.danhSachKho({ uid: 'U2', ownerUid: OWNER, taiKhoanToi: null, quyenXemToi: { [OWNER]: { crm: true } }, tatCaTaiKhoan: null });
check('co kho + duoc xem: kho minh dung dau', uids(thuong) === `U2,${OWNER}` && thuong[0].cuaToi);

const admin = P.danhSachKho({ uid: 'AD', ownerUid: OWNER, taiKhoanToi: { admin: true },
  quyenXemToi: null, tatCaTaiKhoan: { AD: { coKho: true }, U2: { coKho: true, ten: 'B' }, U3: { coKho: false } } });
check('Admin: minh + OWNER + U2, khong U3, khong trung', uids(admin) === `AD,${OWNER},U2`, uids(admin));
check('Admin: moi kho sua + du nhom', admin.every(k => k.sua && JSON.stringify(k.nhom) === JSON.stringify(ALL)));
check('Admin: ten U2', admin.find(k => k.uid === 'U2')!.ten === 'B');
check('Admin co quyen xem trung OWNER khong lap', uids(P.danhSachKho({ uid: 'AD', ownerUid: OWNER, taiKhoanToi: { admin: true }, quyenXemToi: { [OWNER]: { crm: true } }, tatCaTaiKhoan: {} })) === `AD,${OWNER}`);
check('khoa -> []', P.danhSachKho({ uid: 'AD', ownerUid: OWNER, taiKhoanToi: { admin: true, khoa: true }, quyenXemToi: { [OWNER]: { crm: true } }, tatCaTaiKhoan: {} }).length === 0);

console.log('chonKho');
check('chon dung uid da nho', P.chonKho(sep, OWNER)!.uid === OWNER);
check('uid bi thu hoi -> ds[0]', P.chonKho(admin, 'uid-da-bi-thu-hoi') === admin[0]);
check('null -> ds[0]', P.chonKho(admin, null) === admin[0]);
check('rong -> null', P.chonKho([], 'x') === null);

console.log('chuanHoaQuyenXem');
check('zalo ma khong crm -> loi', (() => { const r: any = P.chuanHoaQuyenXem({ zalo: true }); return r.ok === false && !!r.loi; })());
check('ai ma khong crm -> loi', (P.chuanHoaQuyenXem({ ai: true }) as any).ok === false);
check('ca 3 false -> loi', (P.chuanHoaQuyenXem({}) as any).ok === false);
check('null -> loi', (P.chuanHoaQuyenXem(null) as any).ok === false);
check('crm:1 -> ep boolean', JSON.stringify(P.chuanHoaQuyenXem({ crm: 1 })) === JSON.stringify({ ok: true, gia: { crm: true, zalo: false, ai: false } }));

console.log('escapeHtml / veBangTaiKhoan');
check('escapeHtml', P.escapeHtml(`<a href="x">&'`) === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
const html = P.veBangTaiKhoan([{ uid: 'U"1', email: 'a"b', ten: '<img src=x onerror=1>', coKho: true, admin: false, khoa: false, dangXem: ['<b>X</b>'] }]);
check('khong co <img', !html.includes('<img'));
check('khong co a"b chua escape', !html.includes('a"b'));
check('khong co <b>X', !html.includes('<b>X'));
check('co data-uid da escape', html.includes('data-uid="U&quot;1"'));
check('rong -> van tra chuoi', typeof P.veBangTaiKhoan([]) === 'string');

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
