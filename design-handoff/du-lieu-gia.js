/**
 * DỮ LIỆU GIẢ cho bản demo giao diện (design handoff). KHÔNG có dữ liệu khách thật.
 * Viết dạng hàm thường (không export) để build.mjs vừa chạy được trong Node,
 * vừa nhúng nguyên văn vào file demo HTML. Ngày tháng tính tương đối theo `now`.
 *
 * Trả về cây giống Firebase: { crmData, zalo, appConfig, shareLog }.
 */
function taoDuLieuGia(now) {
  const DAY = 86400000, HOUR = 3600000, MIN = 60000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ngay = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return iso(d); };
  const thang = (n) => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const nhan = (n, gio = '10:00') => { const d = new Date(now); d.setDate(d.getDate() + n); return `${d.toLocaleDateString('vi-VN')}, ${gio}`; };
  const TEN_GD = { leadin: 'Lead in', baogia: 'Báo giá', follow1: 'Follow up lần 1', follow2: 'Follow up lần 2', follow3: 'Follow up lần 3', nuoidaihan: 'Nuôi dài hạn', won: 'Won', lost: 'Lost' };
  const THU_TU = ['leadin', 'baogia', 'follow1', 'follow2', 'follow3'];

  // Log hoạt động đi qua từng giai đoạn — hàm phễu CR của dashboard đọc đúng câu chữ này
  function lichSu(stage, taoCach) {
    const log = [{ time: nhan(-taoCach, '09:15'), text: 'Lead được tạo', isNow: true }];
    const dich = stage === 'won' || stage === 'lost' || stage === 'nuoidaihan' ? 'follow2' : stage;
    const idx = THU_TU.indexOf(dich);
    for (let i = 1; i <= idx; i++) {
      log.push({ time: nhan(-taoCach + i * 2, '14:30'), text: `Chuyển từ "${TEN_GD[THU_TU[i - 1]]}" sang "${TEN_GD[THU_TU[i]]}"`, isNow: true });
    }
    if (stage === 'nuoidaihan') log.push({ time: nhan(-3, '16:00'), text: 'Chuyển từ "Follow up lần 2" sang "Nuôi dài hạn"', isNow: true });
    if (stage === 'won') log.push({ time: nhan(-3, '11:20'), text: 'Chốt deal thành công — Won 🎉', isNow: true });
    if (stage === 'lost') log.push({ time: nhan(-2, '17:40'), text: 'Đóng deal — Lost (Đã chọn đơn vị khác)', isNow: true });
    return log;
  }

  const L = (o) => ({
    ownerUid: 'demo', facebook: '', schedule: '', persona: '', objection: '',
    leadType: 'Lead công ty', tags: [], notesList: [], todos: [], expectedCloseMonth: null,
    ...o,
    activityLog: lichSu(o.stage, o.taoCach || 10),
    createdAt: ngay(-(o.taoCach || 10)),
  });
  const ghiChu = (id, text, n) => ({ id, text, createdAt: nhan(n, '15:20'), updatedAt: nhan(n, '15:20') });
  const viec = (id, text, han, done = false) => ({ id, text, done, dueDate: han, completedAt: done ? han : null });

  const leads = [
    L({ id: 'L01', name: 'Nguyễn Thị Lan', phone: '0901 234 567', facebook: 'fb.com/lan.nguyen', stage: 'baogia', package: 'Signature', revenueExpected: 45000000, weddingDate: ngay(87), deadline: ngay(0), expectedCloseMonth: thang(0), taoCach: 6, tags: ['Tiềm năng'],
      schedule: 'Lễ gia tiên sáng tại nhà gái (Q.7), tiệc tối tại White Palace.', persona: 'Cô dâu 27 tuổi, làm marketing, thích tông ảnh film nhẹ nhàng.', objection: 'Đang so sánh giá với 2 bên khác, băn khoăn có flycam không.',
      notesList: [ghiChu('n1', 'Khách xem portfolio trên page, thích concept ngoài trời.', -5), ghiChu('n2', 'Hẹn gửi báo giá chi tiết gói Signature kèm flycam.', -1)],
      todos: [viec('t0', 'Gửi báo giá chi tiết gói Signature', ngay(0)), viec('t1', 'Hẹn lịch gặp ekip', ngay(2))] }),
    L({ id: 'L02', name: 'Trần Ngọc Hân', phone: '0912 555 010', stage: 'follow1', package: 'Unique', revenueExpected: 32000000, weddingDate: ngay(120), deadline: ngay(-2), taoCach: 12,
      objection: 'Muốn giảm giá nếu book sớm.', todos: [viec('t0', 'Gọi lại tư vấn ưu đãi book sớm', ngay(-2))] }),
    L({ id: 'L03', name: 'Lê Minh Tuấn', phone: '0938 777 222', stage: 'leadin', package: 'Standard', revenueExpected: 18000000, weddingDate: ngay(150), deadline: ngay(1), taoCach: 1,
      todos: [viec('t0', 'Gửi portfolio + bảng giá', ngay(1))] }),
    L({ id: 'L04', name: 'Phạm Thảo Vy', phone: '0977 111 333', stage: 'follow2', package: 'Standard', revenueExpected: 22000000, weddingDate: ngay(64), deadline: ngay(5), taoCach: 20 }),
    L({ id: 'L05', name: 'Võ Hoàng Yến', phone: '0909 888 444', stage: 'follow3', package: 'HayDay Package', revenueExpected: 60000000, weddingDate: ngay(45), deadline: ngay(3), taoCach: 25, tags: ['Tiềm năng'], expectedCloseMonth: thang(0),
      todos: [viec('t0', 'Chốt lịch chụp pre-wedding Đà Lạt', ngay(3))] }),
    L({ id: 'L06', name: 'Đặng Bảo Ngọc', phone: '0966 222 999', stage: 'nuoidaihan', package: 'Unique', revenueExpected: 30000000, weddingDate: ngay(260), deadline: ngay(21), taoCach: 40, expectedCloseMonth: thang(2) }),
    L({ id: 'L07', name: 'Huỳnh Gia Hân', phone: '0935 404 505', stage: 'leadin', package: 'Gói lẻ', revenueExpected: 8000000, weddingDate: ngay(30), deadline: ngay(0), taoCach: 0, leadType: 'Lead salehunt' }),
    L({ id: 'L08', name: 'Bùi Anh Thư', phone: '0944 606 707', stage: 'baogia', package: 'Signature', revenueExpected: 48000000, weddingDate: ngay(95), deadline: ngay(1), taoCach: 8, tags: ['Tiềm năng'], expectedCloseMonth: thang(1),
      todos: [viec('t0', 'Gửi hợp đồng mẫu', ngay(1)), viec('t1', 'Gửi báo giá', ngay(-4), true)] }),
    L({ id: 'L09', name: 'Ngô Quỳnh Như', phone: '0908 121 212', stage: 'won', package: 'Signature', revenueExpected: 50000000, revenueActual: 52000000, weddingDate: ngay(40), deadline: ngay(-3), taoCach: 18, wonAt: ngay(-3),
      todos: [viec('t0', 'Ký hợp đồng + nhận cọc', ngay(-3), true)] }),
    L({ id: 'L10', name: 'Phan Mỹ Duyên', phone: '0919 343 434', stage: 'won', package: 'Unique', revenueExpected: 30000000, revenueActual: 28000000, weddingDate: ngay(70), deadline: ngay(-8), taoCach: 22, wonAt: ngay(-8) }),
    L({ id: 'L11', name: 'Trịnh Khánh Linh', phone: '0987 565 656', stage: 'lost', package: 'Standard', revenueExpected: 20000000, weddingDate: ngay(55), deadline: ngay(-2), taoCach: 15, lostAt: ngay(-2), lostReason: 'Đã chọn đơn vị khác' }),
    L({ id: 'L12', name: 'Đỗ Thùy Trang', phone: '0923 787 878', stage: 'follow1', package: 'Signature', revenueExpected: 40000000, weddingDate: ngay(110), deadline: ngay(2), taoCach: 9, leadType: 'Lead salehunt' }),
    L({ id: 'L13', name: 'Mai Phương Thảo', phone: '0971 909 090', stage: 'leadin', package: 'Standard', revenueExpected: 20000000, weddingDate: ngay(180), deadline: ngay(4), taoCach: 2 }),
    L({ id: 'L14', name: 'Lý Kim Ngân', phone: '0902 131 313', stage: 'baogia', package: 'Unique', revenueExpected: 35000000, weddingDate: ngay(75), deadline: ngay(-1), taoCach: 7 }),
  ];

  /* ---------- Hội thoại Zalo ---------- */
  const t = now.getTime();
  const tin = (phutTruoc, fromMe, text, extra = {}) => ({ at: t - phutTruoc * MIN, fromMe, kind: 'text', text, cliMsgId: String(t - phutTruoc * MIN), senderUid: fromMe ? '' : '55', ...extra });
  const hoiThoai = {
    c01: { lead: 'L01', name: 'Lan Nguyễn', msgs: [
      tin(3 * 24 * 60, false, 'Chào em, chị xem page thấy bên em chụp đẹp quá. Tháng 12 bên em còn lịch không ạ?'),
      tin(3 * 24 * 60 - 20, true, 'Dạ em chào chị ạ 🥰 Chị dự định cưới ngày nào và tổ chức ở đâu ạ?'),
      tin(3 * 24 * 60 - 35, false, 'Chị cưới 18/12, lễ ở nhà Q.7, tiệc tối White Palace'),
      tin(3 * 24 * 60 - 50, true, 'Dạ ngày này bên em còn trống ekip ạ. Em gửi chị portfolio và bảng giá tham khảo nha'),
      tin(5 * 60 + 10, true, 'Em gửi chị bảng giá gói Signature ạ, gói này đã gồm chụp lễ + tiệc + album 30x30'),
      tin(2 * 60 + 5, false, 'Gói này có quay flycam không em?'),
      { ...tin(2 * 60, false, ''), kind: 'image', text: undefined },
      tin(2 * 60 - 1, false, 'Chị muốn concept giống ảnh này, em báo giá lại giúp chị nhé', { quote: { title: 'Huyền Trân', text: 'Em gửi chị bảng giá gói Signature ạ' } }),
    ] },
    g01: { lead: 'L01', name: 'Nhóm cưới Lan & Tuấn', msgs: [
      tin(26 * 60, false, 'Anh gửi lịch trình dự kiến cho em nha', { senderName: 'Minh Tuấn' }),
      tin(26 * 60 - 5, false, 'Sáng 7h rước dâu, 9h lễ gia tiên, tối 18h tiệc', { senderName: 'Minh Tuấn' }),
      tin(25 * 60, true, 'Dạ em ghi nhận ạ. Em sẽ sắp xếp 2 photo + 1 quay phim cho buổi lễ nha anh chị'),
    ] },
    c02: { lead: 'L02', name: 'Ngọc Hân', msgs: [
      tin(4 * 24 * 60, true, 'Dạ em gửi chị ưu đãi book sớm tháng này: giảm 10% gói Unique ạ'),
      tin(4 * 24 * 60 - 60, false, 'Để chị bàn với chồng rồi báo em nha'),
      tin(4 * 24 * 60 - 90, true, 'Dạ vâng ạ, có gì chị nhắn em nha 🌷'),
    ] },
    c04: { lead: 'L04', name: 'Thảo Vy', msgs: [
      tin(6 * 24 * 60, false, 'Bên em có chụp pre-wedding ở Đà Lạt không?'),
      tin(5 * 24 * 60, true, 'Dạ có ạ, em gửi chị bộ ảnh Đà Lạt gần nhất nha'),
    ] },
    c05: { lead: 'L05', name: 'Hoàng Yến', msgs: [
      tin(6 * 60, false, 'Em ơi chị chốt gói HayDay Package nha, cuối tuần qua ký hợp đồng được không?'),
      tin(5 * 60 + 40, true, 'Dạ được ạ! Thứ 7 10h chị ghé studio được không ạ?'),
      tin(4 * 60, false, 'Ok em, thứ 7 chị qua'),
    ] },
    c08: { lead: 'L08', name: 'Anh Thư', msgs: [
      tin(40, false, 'Em gửi chị hợp đồng mẫu xem trước được không?'),
    ] },
    c09: { lead: 'L09', name: 'Quỳnh Như', msgs: [
      tin(3 * 24 * 60 + 30, true, 'Em gửi chị hợp đồng và thông tin chuyển khoản cọc ạ'),
      tin(3 * 24 * 60, false, 'Chị chuyển cọc rồi nha em ❤️'),
      tin(3 * 24 * 60 - 10, true, 'Dạ em nhận được rồi ạ, cảm ơn chị nhiều!'),
    ] },
  };
  const links = {}, meta = {}, msgs = {};
  for (const [convId, h] of Object.entries(hoiThoai)) {
    links[convId] = { status: 'lead', leadId: h.lead, name: h.name, isGroup: convId.startsWith('g'), linkedAt: t - 10 * DAY };
    msgs[convId] = {};
    const m = { firstAt: null, lastAt: 0, lastCustomerAt: 0, lastMeAt: 0 };
    h.msgs.forEach((x, i) => {
      const id = String(7000000000000 + x.at + i);
      const sach = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
      msgs[convId][id] = sach;
      m.firstAt = m.firstAt ? Math.min(m.firstAt, x.at) : x.at;
      m.lastAt = Math.max(m.lastAt, x.at);
      if (x.fromMe) m.lastMeAt = Math.max(m.lastMeAt, x.at); else m.lastCustomerAt = Math.max(m.lastCustomerAt, x.at);
    });
    meta[convId] = { ...m, leadId: h.lead, name: h.name, isGroup: convId.startsWith('g'), updatedAt: t };
  }
  // Hội thoại "không phải khách" — phải KHÔNG bao giờ hiện ở đâu
  links.c99 = { status: 'ignored', leadId: null, name: 'Mẹ', isGroup: false, linkedAt: t - 10 * DAY };

  return {
    crmData: {
      leads: Object.fromEntries(leads.map((l) => [l.id, l])),
      dailyTodos: {},
      planRevenue: 300000000,
      planLeads: 30,
      updatedAt: now.toISOString(),
    },
    zalo: { links, meta, msgs },
    appConfig: {},
    shareLog: {},
  };
}
