// Dò: static import file cùng repo ở thư mục lib/ có hoạt động không?
import { todayISO, STAGE_IDS } from '../lib/crm.ts';

export default {
  async fetch(): Promise<Response> {
    return Response.json({
      ket_luan: 'static import tu lib/ (duoi .ts): OK',
      todayISO: todayISO(),
      soGiaiDoan: STAGE_IDS.length,
    });
  },
};
