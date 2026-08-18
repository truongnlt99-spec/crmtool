/**
 * Endpoint chẩn đoán tạm thời — xác định vì sao /api/mcp trả 500.
 * File này KHÔNG import gì ở cấp module, nên nó luôn chạy được kể cả khi
 * việc phân giải module của lib/ bị hỏng. Xóa sau khi đã sửa xong.
 */
export default {
  async fetch(): Promise<Response> {
    const info: Record<string, unknown> = {
      nodeVersion: process.version,
      cwd: process.cwd(),
    };

    // Thử từng kiểu đuôi import để biết Vercel phân giải được kiểu nào
    for (const [label, spec] of [
      ['import_dui_ts', '../lib/crm.ts'],
      ['import_dui_js', '../lib/crm.js'],
      ['import_khong_dui', '../lib/crm'],
    ] as const) {
      try {
        const m: any = await import(spec);
        info[label] = 'OK -> todayISO() = ' + m.todayISO();
      } catch (e: any) {
        info[label] = 'FAIL: ' + (e?.code || '') + ' ' + (e?.message || String(e)).slice(0, 200);
      }
    }

    // Thử nạp các package phụ thuộc
    for (const [label, spec] of [
      ['pkg_zod', 'zod'],
      ['pkg_mcp_handler', 'mcp-handler'],
      ['pkg_mcp_server', '@modelcontextprotocol/server'],
    ] as const) {
      try {
        await import(spec);
        info[label] = 'OK';
      } catch (e: any) {
        info[label] = 'FAIL: ' + (e?.message || String(e)).slice(0, 200);
      }
    }

    return new Response(JSON.stringify(info, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
