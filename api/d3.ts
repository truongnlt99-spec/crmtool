// Dò: static import lib/ nhưng dùng đuôi .js (quy ước TypeScript)
import { todayISO, STAGE_IDS } from '../lib/crm.js';

export default {
  async fetch(): Promise<Response> {
    return Response.json({
      ket_luan: 'static import tu lib/ (duoi .js): OK',
      todayISO: todayISO(),
      soGiaiDoan: STAGE_IDS.length,
    });
  },
};
