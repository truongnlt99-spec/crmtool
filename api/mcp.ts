import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import { patchPath, DATA_ROOT } from '../lib/firebase.ts';
import {
  loadCrm,
  summarizeLead,
  leadStatus,
  reachedStageIndex,
  leadTypeOf,
  daysDiff,
  daysBetween,
  inMonth,
  monthKeyOf,
  currentMonthYear,
  todayISO,
  nowLabel,
  formatMoney,
  STAGE_IDS,
  STAGE_NAME,
  STAGES,
  PACKAGES,
  LEAD_TYPES,
  LOST_REASONS,
  type Lead,
  type CrmData,
} from '../lib/crm.ts';

/* ===================== Tiện ích chung ===================== */

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function say(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/** Tìm lead theo id chính xác, hoặc theo tên (khớp một phần, không phân biệt hoa thường). */
function findLead(crm: CrmData, ref: string): Lead {
  const byId = crm.leads.find((l) => l.id === ref);
  if (byId) return byId;

  const q = ref.toLowerCase().trim();
  const matches = crm.leads.filter((l) => (l.name || '').toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Có ${matches.length} lead khớp "${ref}": ${matches
        .map((m) => `${m.name} (${m.id})`)
        .join(', ')}. Hãy gọi lại bằng leadId cụ thể.`
    );
  }
  throw new Error(`Không tìm thấy lead nào khớp "${ref}".`);
}

/** Ghi thêm 1 dòng vào activityLog của lead (append theo index, không ghi đè cả mảng). */
async function logActivity(lead: Lead, text: string): Promise<void> {
  const log = lead.activityLog || [];
  await patchPath(`${DATA_ROOT}/leads/${lead.id}/activityLog`, {
    [log.length]: { time: nowLabel(), text, isNow: true },
  });
}

/** Đánh dấu thời điểm cập nhật ở gốc, giữ parity với app web. */
async function touch(): Promise<void> {
  await patchPath(DATA_ROOT, { updatedAt: new Date().toISOString() });
}

/* ===================== Định nghĩa các tool ===================== */

const mcpHandler = createMcpHandler(
  (server) => {
    /* ---------- ĐỌC ---------- */

    server.registerTool(
      'list_leads',
      {
        title: 'Danh sách lead',
        description:
          'Liệt kê lead trong CRM, có thể lọc theo giai đoạn, loại lead, gói dịch vụ, hoặc tìm theo tên/số điện thoại. Mặc định bỏ qua lead đã Won/Lost.',
        inputSchema: z.object({
          stage: z
            .enum(STAGE_IDS as [string, ...string[]])
            .optional()
            .describe('Lọc theo giai đoạn cụ thể'),
          leadType: z.enum(LEAD_TYPES).optional().describe('Lead công ty hoặc Lead salehunt'),
          packageName: z.enum(PACKAGES).optional().describe('Lọc theo gói dịch vụ'),
          search: z.string().optional().describe('Tìm theo tên khách hoặc số điện thoại'),
          onlyOverdue: z.boolean().optional().describe('Chỉ lấy lead đã trễ hẹn'),
          includeClosed: z
            .boolean()
            .optional()
            .describe('Bao gồm cả lead đã Won/Lost (mặc định false)'),
          limit: z.number().int().min(1).max(200).optional().describe('Số lead tối đa, mặc định 50'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        let list = crm.leads;

        if (!args.includeClosed && !args.stage) {
          list = list.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
        }
        if (args.stage) list = list.filter((l) => l.stage === args.stage);
        if (args.leadType) list = list.filter((l) => leadTypeOf(l) === args.leadType);
        if (args.packageName) list = list.filter((l) => l.package === args.packageName);
        if (args.onlyOverdue) list = list.filter((l) => leadStatus(l).type === 'red');
        if (args.search) {
          const q = args.search.toLowerCase().trim();
          list = list.filter(
            (l) =>
              (l.name || '').toLowerCase().includes(q) ||
              (l.phone || '').includes(q) ||
              (l.facebook || '').toLowerCase().includes(q)
          );
        }

        // Sắp xếp: trễ hẹn lên đầu, rồi tới deadline gần nhất
        list = [...list].sort((a, b) => {
          const da = daysDiff(a.deadline);
          const db = daysDiff(b.deadline);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });

        const limit = args.limit ?? 50;
        return ok({
          total: list.length,
          shown: Math.min(limit, list.length),
          leads: list.slice(0, limit).map(summarizeLead),
        });
      }
    );

    server.registerTool(
      'get_lead',
      {
        title: 'Chi tiết lead',
        description:
          'Xem đầy đủ thông tin một lead: thông tin khách, ghi chú, việc cần làm, lịch sử hoạt động. Truyền leadId hoặc tên khách.',
        inputSchema: z.object({
          lead: z.string().describe('leadId (vd L1730000000000) hoặc tên khách hàng'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        return ok({
          ...l,
          stageName: STAGE_NAME[l.stage] || l.stage,
          status: leadStatus(l).label,
          revenueExpectedText: formatMoney(l.revenueExpected),
          daysUntilDeadline: daysDiff(l.deadline),
          todos: (l.todos || []).map((t, i) => ({ index: i, ...t })),
        });
      }
    );

    server.registerTool(
      'dashboard_summary',
      {
        title: 'Tổng quan dashboard',
        description:
          'Số liệu tổng quan theo tháng: giá trị pipeline, doanh thu thực tế, doanh thu dự kiến chốt, tỉ lệ chuyển đổi (CR), deal cycle trung bình, lead trễ hẹn. Khớp với dashboard trên app.',
        inputSchema: z.object({
          month: z
            .number()
            .int()
            .min(1)
            .max(12)
            .optional()
            .describe('Tháng cần xem (1-12), mặc định tháng hiện tại'),
          year: z.number().int().min(2020).max(2100).optional().describe('Năm, mặc định năm hiện tại'),
          leadType: z.enum(LEAD_TYPES).optional().describe('Lọc theo loại lead, bỏ trống = tất cả'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const cur = currentMonthYear();
        const month = args.month !== undefined ? args.month - 1 : cur.month;
        const year = args.year ?? cur.year;
        const monthKey = monthKeyOf(month, year);

        const scoped = args.leadType
          ? crm.leads.filter((l) => leadTypeOf(l) === args.leadType)
          : crm.leads;

        const activeLeads = scoped.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
        const monthLeads = scoped.filter((l) => inMonth(l.createdAt, month, year));
        const wonThisMonth = scoped.filter((l) => l.stage === 'won' && inMonth(l.wonAt, month, year));
        const lostThisMonth = scoped.filter(
          (l) => l.stage === 'lost' && inMonth(l.lostAt, month, year)
        );

        const actualRevenue = wonThisMonth.reduce((s, l) => s + (l.revenueActual || 0), 0);
        const pipelineValue = activeLeads.reduce((s, l) => s + (l.revenueExpected || 0), 0);

        const potentialLeads = activeLeads.filter((l) => (l.tags || []).includes('Tiềm năng'));
        const potentialRevenue = potentialLeads.reduce((s, l) => s + (l.revenueExpected || 0), 0);

        const expectedCloseLeads = activeLeads.filter((l) => l.expectedCloseMonth === monthKey);
        const expectedCloseRevenue = expectedCloseLeads.reduce(
          (s, l) => s + (l.revenueExpected || 0),
          0
        );

        // Phễu chuyển đổi — tính trên các lead được TẠO trong tháng đang xem
        const funnelStages = STAGES.filter((s) => s.id !== 'lost');
        const funnel = funnelStages.map((s) => {
          const idx = STAGE_IDS.indexOf(s.id);
          return {
            stage: s.id,
            stageName: s.name,
            reached: monthLeads.filter((l) => reachedStageIndex(l) >= idx).length,
          };
        });
        const wonIdx = STAGE_IDS.indexOf('won');
        const wonReached = monthLeads.filter((l) => reachedStageIndex(l) >= wonIdx).length;
        const crToWon = monthLeads.length ? Math.round((wonReached / monthLeads.length) * 100) : 0;

        // Deal cycle: số ngày trung bình từ lúc tạo lead tới khi Won
        const cycleDays = wonThisMonth
          .map((l) => daysBetween(l.createdAt, l.wonAt))
          .filter((n): n is number => n !== null && n >= 0);
        const avgCycle = cycleDays.length
          ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length)
          : null;

        const overdue = activeLeads.filter((l) => leadStatus(l).type === 'red');
        const dueToday = activeLeads.filter((l) => leadStatus(l).type === 'green');

        const reasonCounts: Record<string, number> = {};
        LOST_REASONS.forEach((r) => (reasonCounts[r] = 0));
        lostThisMonth.forEach((l) => {
          if (l.lostReason) reasonCounts[l.lostReason] = (reasonCounts[l.lostReason] || 0) + 1;
        });

        return ok({
          kyBaoCao: `Tháng ${month + 1}/${year}`,
          homNay: todayISO(),
          loaiLead: args.leadType || 'Tất cả',

          pipeline: {
            soLeadDangCham: activeLeads.length,
            giaTri: pipelineValue,
            giaTriText: formatMoney(pipelineValue),
          },
          doanhThuThucTe: {
            soTien: actualRevenue,
            soTienText: formatMoney(actualRevenue),
            soDealWon: wonThisMonth.length,
            keHoach: crm.planRevenue,
            keHoachText: formatMoney(crm.planRevenue),
            phanTramHoanThanh: crm.planRevenue
              ? Math.round((actualRevenue / crm.planRevenue) * 100)
              : 0,
          },
          leadMoiTrongThang: {
            soLuong: monthLeads.length,
            keHoach: crm.planLeads,
            phanTramHoanThanh: crm.planLeads
              ? Math.round((monthLeads.length / crm.planLeads) * 100)
              : 0,
          },
          doanhThuTiemNang: {
            soTien: potentialRevenue,
            soTienText: formatMoney(potentialRevenue),
            soLead: potentialLeads.length,
          },
          duKienChotTrongThang: {
            soTien: expectedCloseRevenue,
            soTienText: formatMoney(expectedCloseRevenue),
            soLead: expectedCloseLeads.length,
            danhSach: expectedCloseLeads.map(summarizeLead),
          },
          tiLeChuyenDoi: { crToWonPhanTram: crToWon, phanTich: funnel },
          dealCycleTrungBinhNgay: avgCycle,
          cangBaoDong: {
            treHen: overdue.length,
            denHanHomNay: dueToday.length,
            danhSachTreHen: overdue.map(summarizeLead),
          },
          lyDoMatDeal: reasonCounts,
        });
      }
    );

    server.registerTool(
      'upcoming_deadlines',
      {
        title: 'Lead cần xử lý',
        description:
          'Danh sách lead theo mức độ gấp: đã trễ hẹn, đến hạn hôm nay, hoặc sắp tới hạn trong N ngày.',
        inputSchema: z.object({
          scope: z
            .enum(['overdue', 'today', 'upcoming', 'all'])
            .optional()
            .describe('overdue = trễ hẹn, today = hôm nay, upcoming = sắp tới, all = tất cả'),
          withinDays: z.number().int().min(1).max(90).optional().describe('Dùng với upcoming, mặc định 7 ngày'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const scope = args.scope ?? 'all';
        const within = args.withinDays ?? 7;
        const active = crm.leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');

        const overdue = active.filter((l) => leadStatus(l).type === 'red');
        const today = active.filter((l) => leadStatus(l).type === 'green');
        const upcoming = active.filter((l) => {
          const d = daysDiff(l.deadline);
          return d !== null && d > 0 && d <= within;
        });

        const sortByDeadline = (arr: Lead[]) =>
          [...arr]
            .sort((a, b) => (daysDiff(a.deadline) ?? 0) - (daysDiff(b.deadline) ?? 0))
            .map(summarizeLead);

        if (scope === 'overdue') return ok({ treHen: sortByDeadline(overdue) });
        if (scope === 'today') return ok({ denHanHomNay: sortByDeadline(today) });
        if (scope === 'upcoming')
          return ok({ [`sapToiHanTrong${within}Ngay`]: sortByDeadline(upcoming) });

        return ok({
          homNay: todayISO(),
          treHen: sortByDeadline(overdue),
          denHanHomNay: sortByDeadline(today),
          sapToiHan: sortByDeadline(upcoming),
        });
      }
    );

    server.registerTool(
      'list_todos',
      {
        title: 'Việc cần làm',
        description:
          'Liệt kê các việc cần làm gắn với lead. Mặc định chỉ lấy việc chưa hoàn thành.',
        inputSchema: z.object({
          includeDone: z.boolean().optional().describe('Bao gồm cả việc đã xong (mặc định false)'),
          lead: z.string().optional().describe('Chỉ lấy việc của một lead cụ thể (id hoặc tên)'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const source = args.lead ? [findLead(crm, args.lead)] : crm.leads;

        const rows = source.flatMap((l) =>
          (l.todos || [])
            .map((t, i) => ({ ...t, index: i, leadId: l.id, leadName: l.name, stage: l.stage }))
            .filter((t) => (args.includeDone ? true : !t.done))
        );

        return ok({ total: rows.length, todos: rows });
      }
    );

    /* ---------- GHI ---------- */

    server.registerTool(
      'create_lead',
      {
        title: 'Tạo lead mới',
        description: 'Tạo một lead mới trong CRM, bắt đầu ở giai đoạn Lead in.',
        inputSchema: z.object({
          name: z.string().min(1).describe('Tên khách hàng (bắt buộc)'),
          phone: z.string().optional(),
          facebook: z.string().optional(),
          weddingDate: z.string().optional().describe('Ngày cưới, dạng YYYY-MM-DD'),
          packageName: z.enum(PACKAGES).optional().describe('Gói dịch vụ'),
          leadType: z.enum(LEAD_TYPES).optional().describe('Mặc định Lead công ty'),
          revenueExpected: z.number().min(0).optional().describe('Doanh thu dự kiến (VNĐ)'),
          deadline: z.string().optional().describe('Hạn liên hệ tiếp, YYYY-MM-DD. Mặc định hôm nay'),
          expectedCloseMonth: z.string().optional().describe('Tháng chốt dự kiến, dạng YYYY-MM'),
          notes: z.string().optional().describe('Ghi chú đầu tiên'),
        }),
      },
      async (args) => {
        const id = 'L' + Date.now();
        const stamp = nowLabel();

        const lead: Lead = {
          id,
          name: args.name,
          facebook: args.facebook || '',
          phone: args.phone || '',
          weddingDate: args.weddingDate || null,
          package: args.packageName || PACKAGES[0],
          leadType: args.leadType || 'Lead công ty',
          revenueExpected: args.revenueExpected || 0,
          stage: 'leadin',
          deadline: args.deadline || todayISO(),
          expectedCloseMonth: args.expectedCloseMonth || null,
          createdAt: todayISO(),
          schedule: '',
          persona: '',
          objection: '',
          notesList: args.notes
            ? [{ id: 'n' + Date.now(), text: args.notes, createdAt: stamp, updatedAt: stamp }]
            : [],
          tags: [],
          todos: [],
          activityLog: [{ time: stamp, text: 'Lead được tạo', isNow: true }],
        };

        // PATCH vào nhánh leads -> chỉ thêm key mới, không đụng các lead khác
        await patchPath(`${DATA_ROOT}/leads`, { [id]: lead });
        await touch();

        return say(`Đã tạo lead "${args.name}" (id: ${id}), giai đoạn Lead in, hạn liên hệ ${lead.deadline}.`);
      }
    );

    server.registerTool(
      'update_lead',
      {
        title: 'Cập nhật thông tin lead',
        description:
          'Sửa thông tin của lead đã có. Chỉ những field được truyền vào mới bị thay đổi. Không dùng để chuyển giai đoạn (dùng move_stage).',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          name: z.string().optional(),
          phone: z.string().optional(),
          facebook: z.string().optional(),
          weddingDate: z.string().optional().describe('YYYY-MM-DD'),
          packageName: z.enum(PACKAGES).optional(),
          leadType: z.enum(LEAD_TYPES).optional(),
          revenueExpected: z.number().min(0).optional(),
          deadline: z.string().optional().describe('YYYY-MM-DD'),
          expectedCloseMonth: z.string().optional().describe('YYYY-MM'),
          schedule: z.string().optional().describe('Lịch trình'),
          persona: z.string().optional().describe('Chân dung khách hàng'),
          objection: z.string().optional().describe('Objection của khách'),
          markPotential: z.boolean().optional().describe('Gắn/bỏ nhãn "Tiềm năng" 🔥'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);

        const patch: Record<string, unknown> = {};
        const changed: string[] = [];

        const map: Record<string, unknown> = {
          name: args.name,
          phone: args.phone,
          facebook: args.facebook,
          weddingDate: args.weddingDate,
          package: args.packageName,
          leadType: args.leadType,
          revenueExpected: args.revenueExpected,
          deadline: args.deadline,
          expectedCloseMonth: args.expectedCloseMonth,
          schedule: args.schedule,
          persona: args.persona,
          objection: args.objection,
        };
        for (const [k, v] of Object.entries(map)) {
          if (v !== undefined) {
            patch[k] = v;
            changed.push(k);
          }
        }

        if (args.markPotential !== undefined) {
          const tags = new Set(l.tags || []);
          if (args.markPotential) tags.add('Tiềm năng');
          else tags.delete('Tiềm năng');
          patch.tags = [...tags];
          changed.push(args.markPotential ? 'gắn nhãn Tiềm năng' : 'bỏ nhãn Tiềm năng');
        }

        if (!changed.length) return say('Không có thông tin nào được truyền vào để cập nhật.');

        await patchPath(`${DATA_ROOT}/leads/${l.id}`, patch);
        await logActivity(l, `Cập nhật thông tin: ${changed.join(', ')}`);
        await touch();

        return say(`Đã cập nhật lead "${l.name}" (${changed.join(', ')}).`);
      }
    );

    server.registerTool(
      'move_stage',
      {
        title: 'Chuyển giai đoạn lead',
        description:
          'Chuyển lead sang giai đoạn khác trong pipeline. Chuyển sang "won" cần doanh thu thực tế; chuyển sang "lost" cần lý do.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          stage: z.enum(STAGE_IDS as [string, ...string[]]).describe('Giai đoạn đích'),
          revenueActual: z
            .number()
            .min(0)
            .optional()
            .describe('Doanh thu thực tế — bắt buộc khi chuyển sang won'),
          lostReason: z.enum(LOST_REASONS).optional().describe('Lý do — bắt buộc khi chuyển sang lost'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);

        if (l.stage === args.stage) {
          return say(`Lead "${l.name}" đã ở giai đoạn ${STAGE_NAME[args.stage]} rồi.`);
        }

        const patch: Record<string, unknown> = { stage: args.stage };
        let logText: string;

        if (args.stage === 'won') {
          const revenue = args.revenueActual ?? l.revenueExpected ?? 0;
          patch.revenueActual = revenue;
          patch.wonAt = todayISO();
          logText = `Chốt deal thành công — Won 🎉 (doanh thu thực tế ${formatMoney(revenue)})`;
        } else if (args.stage === 'lost') {
          if (!args.lostReason) {
            throw new Error(
              `Chuyển sang Lost cần có lý do. Chọn một trong: ${LOST_REASONS.join(' | ')}`
            );
          }
          patch.lostReason = args.lostReason;
          patch.lostAt = todayISO();
          logText = `Đóng deal — Lost (${args.lostReason})`;
        } else {
          logText = `Chuyển từ "${STAGE_NAME[l.stage]}" sang "${STAGE_NAME[args.stage]}"`;
        }

        await patchPath(`${DATA_ROOT}/leads/${l.id}`, patch);
        await logActivity(l, logText);
        await touch();

        return say(`Lead "${l.name}": ${logText}`);
      }
    );

    server.registerTool(
      'add_note',
      {
        title: 'Thêm ghi chú',
        description: 'Thêm một ghi chú vào dòng ghi chú của lead.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          text: z.string().min(1).describe('Nội dung ghi chú'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const notes = l.notesList || [];
        const stamp = nowLabel();

        await patchPath(`${DATA_ROOT}/leads/${l.id}/notesList`, {
          [notes.length]: {
            id: 'n' + Date.now(),
            text: args.text,
            createdAt: stamp,
            updatedAt: stamp,
          },
        });
        await touch();

        return say(`Đã thêm ghi chú cho lead "${l.name}".`);
      }
    );

    server.registerTool(
      'add_todo',
      {
        title: 'Thêm việc cần làm',
        description: 'Thêm một việc cần làm vào lead.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          text: z.string().min(1).describe('Nội dung việc cần làm'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const todos = l.todos || [];

        await patchPath(`${DATA_ROOT}/leads/${l.id}/todos`, {
          [todos.length]: { text: args.text, done: false },
        });
        await logActivity(l, `Thêm việc cần làm: ${args.text}`);
        await touch();

        return say(`Đã thêm việc "${args.text}" cho lead "${l.name}".`);
      }
    );

    server.registerTool(
      'complete_todo',
      {
        title: 'Đánh dấu việc hoàn thành',
        description:
          'Tick hoàn thành một việc cần làm của lead. Xác định việc bằng số thứ tự (lấy từ get_lead/list_todos) hoặc bằng nội dung việc.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          todoIndex: z.number().int().min(0).optional().describe('Số thứ tự việc trong danh sách'),
          todoText: z.string().optional().describe('Hoặc khớp theo nội dung việc'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const todos = l.todos || [];

        let idx = args.todoIndex;
        if (idx === undefined) {
          if (!args.todoText) {
            throw new Error('Cần truyền todoIndex hoặc todoText để xác định việc cần tick.');
          }
          const q = args.todoText.toLowerCase().trim();
          const found = todos
            .map((t, i) => ({ t, i }))
            .filter((x) => (x.t.text || '').toLowerCase().includes(q) && !x.t.done);
          if (!found.length) throw new Error(`Không tìm thấy việc chưa xong nào khớp "${args.todoText}".`);
          if (found.length > 1) {
            throw new Error(
              `Có ${found.length} việc khớp: ${found
                .map((x) => `[${x.i}] ${x.t.text}`)
                .join(' | ')}. Hãy dùng todoIndex.`
            );
          }
          idx = found[0].i;
        }

        const todo = todos[idx];
        if (!todo) throw new Error(`Lead "${l.name}" không có việc ở vị trí ${idx}.`);
        if (todo.done) return say(`Việc "${todo.text}" đã được đánh dấu hoàn thành từ trước.`);

        await patchPath(`${DATA_ROOT}/leads/${l.id}/todos/${idx}`, {
          done: true,
          completedAt: todayISO(),
        });
        await logActivity(l, `Hoàn thành việc: ${todo.text}`);
        await touch();

        return say(`Đã tick hoàn thành việc "${todo.text}" của lead "${l.name}".`);
      }
    );
  },
  {},
  { basePath: '/api' }
);

/* ===================== Vercel Function (framework: other) ===================== */

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Secret có thể nằm ở query (?key=...) hoặc ở path (/api/mcp/<secret>, nhờ rewrite trong vercel.json)
    let provided = url.searchParams.get('key');
    const fromPath = /^\/api\/mcp\/([^/]+)\/?$/.exec(url.pathname);
    if (!provided && fromPath) provided = decodeURIComponent(fromPath[1]);

    const secret = process.env.MCP_SECRET;
    if (secret && provided !== secret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Chuẩn hóa URL về /api/mcp để mcp-handler định tuyến đúng, và không để lộ secret xuống dưới
    url.pathname = '/api/mcp';
    url.searchParams.delete('key');

    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();

    return mcpHandler(
      new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body,
      })
    );
  },
};
