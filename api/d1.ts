// Dò: static import từ node_modules có hoạt động không?
import { z } from 'zod';

export default {
  async fetch(): Promise<Response> {
    const schema = z.object({ n: z.number() });
    const parsed = schema.safeParse({ n: 42 });
    return Response.json({
      ket_luan: 'static import tu node_modules: OK',
      zod_hoat_dong: parsed.success,
      nodeVersion: process.version,
    });
  },
};
