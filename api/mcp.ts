import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import { createSign } from 'node:crypto';

/*
 * LƯU Ý: toàn bộ code hỗ trợ được gộp thẳng vào file này, cố ý không tách
 * sang lib/. Vercel biên dịch từng file trong api/ một cách riêng lẻ và
 * KHÔNG đóng gói file nằm ngoài thư mục api/ — đã kiểm chứng bằng thực nghiệm:
 * import '../lib/crm.ts' và '../lib/crm.js' đều làm function chết với
 * FUNCTION_INVOCATION_FAILED, trong khi import 'zod' từ node_modules chạy tốt.
 */

/* ===================== Firebase Realtime Database (REST) ===================== */

const DB_URL = (
  process.env.FIREBASE_DB_URL ||
  'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app'
).replace(/\/$/, '');

/**
 * Nhánh gốc chứa dữ liệu CRM. Mặc định 'crmData' — trùng với app web.
 * Đổi sang nhánh khác (vd 'crmDataTest') để chạy thử tool ghi mà không
 * đụng dữ liệu thật.
 */
const DATA_ROOT = process.env.FIREBASE_DATA_ROOT || 'crmData';

const SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Trả về access token nếu có cấu hình service account, ngược lại null (DB đang mở). */
async function getAccessToken(): Promise<string | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ. Dán nguyên nội dung file JSON service account tải từ Firebase Console.'
    );
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT thiếu client_email hoặc private_key.');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${base64url(signer.sign(privateKey))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Không lấy được access token Firebase (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function fbRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${DB_URL}/${path.replace(/^\//, '')}.json`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Firebase từ chối truy cập (${res.status}). Nhiều khả năng Security Rules đã siết nhưng chưa đặt FIREBASE_SERVICE_ACCOUNT trên Vercel. Chi tiết: ${body}`
      );
    }
    throw new Error(`Firebase lỗi ${res.status}: ${body}`);
  }
  return res.json();
}

function readPath<T = unknown>(path: string): Promise<T> {
  return fbRequest(path) as Promise<T>;
}

/** Cập nhật một phần (merge) — luôn dùng PATCH để không ghi đè dữ liệu app web ghi song song. */
function patchPath(path: string, data: unknown): Promise<unknown> {
  return fbRequest(path, { method: 'PATCH', body: JSON.stringify(data) });
}

/* ===================== Logic nghiệp vụ CRM ===================== */

/**
 * Vercel Functions chạy giờ UTC, người dùng ở Việt Nam (UTC+7).
 * Mọi mốc "hôm nay"/"bây giờ" phải quy về Asia/Ho_Chi_Minh, nếu không
 * lead tạo lúc sáng sớm sẽ bị ghi nhầm sang ngày hôm trước.
 */
const TZ = 'Asia/Ho_Chi_Minh';

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Nhãn thời gian "DD/MM/YYYY, HH:mm" — đúng định dạng nowLabel() của app web. */
function nowLabel(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return `${date}, ${time}`;
}

const STAGES = [
  { id: 'leadin', name: 'Lead in' },
  { id: 'baogia', name: 'Báo giá' },
  { id: 'follow1', name: 'Follow up lần 1' },
  { id: 'follow2', name: 'Follow up lần 2' },
  { id: 'follow3', name: 'Follow up lần 3' },
  { id: 'nuoidaihan', name: 'Nuôi dài hạn' },
  { id: 'won', name: 'Won' },
  { id: 'lost', name: 'Lost' },
] as const;

type StageId = (typeof STAGES)[number]['id'];

const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
const STAGE_NAME: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.name]));

const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'] as const;
const LEAD_TYPES = ['Lead công ty', 'Lead salehunt'] as const;
const LOST_REASONS = [
  'Chi phí thấp',
  'Khách không phải tệp tiềm năng của HayDay',
  'Đã chọn đơn vị khác',
  'Khách không phản hồi nhiều lần',
] as const;

interface Todo {
  id?: string;
  text: string;
  done?: boolean;
  dueDate?: string | null;
  completedAt?: string | null;
}

interface Note {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface Activity {
  time: string;
  text: string;
  isNow?: boolean;
}

interface Lead {
  id: string;
  name: string;
  facebook?: string;
  phone?: string;
  weddingDate?: string | null;
  package?: string;
  leadType?: string;
  revenueExpected?: number;
  revenueActual?: number;
  stage: StageId;
  deadline?: string | null;
  expectedCloseMonth?: string | null;
  createdAt?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  schedule?: string;
  persona?: string;
  objection?: string;
  notesList?: Note[];
  tags?: string[];
  todos?: Todo[];
  activityLog?: Activity[];
}

interface CrmData {
  leads: Lead[];
  dailyTodos: Todo[];
  planRevenue: number;
  planLeads: number;
}

/** Bù field có thể thiếu ở lead cũ — tương ứng migrateLead() trong app. */
function normalizeLead(l: Lead): Lead {
  if (!l.leadType) l.leadType = 'Lead công ty';
  if (!Array.isArray(l.notesList)) l.notesList = [];
  if (!Array.isArray(l.tags)) l.tags = [];
  if (!Array.isArray(l.todos)) l.todos = [];
  if (!Array.isArray(l.activityLog)) l.activityLog = [];

  // Bù id + hạn cho việc cũ — phải dùng ĐÚNG công thức như migrateLead() trong
  // index.html, nếu không app và MCP sẽ gán id khác nhau cho cùng một việc.
  l.todos.forEach((t, i) => {
    if (!t.id) t.id = 't' + i;
    if (t.dueDate === undefined) t.dueDate = l.deadline || null;
  });
  return l;
}

/** Trạng thái của một việc theo hạn riêng của nó. Mirror todoStatus() của app. */
function todoStatus(t: Todo): { type: string; label: string } {
  if (t.done) return { type: 'gray', label: 'Đã xong' };
  if (!t.dueDate) return { type: 'gray', label: 'Chưa hẹn' };
  const diff = daysDiff(t.dueDate);
  if (diff === null) return { type: 'gray', label: 'Chưa hẹn' };
  if (diff < 0) return { type: 'red', label: `Trễ ${Math.abs(diff)} ngày` };
  if (diff === 0) return { type: 'green', label: 'Hôm nay' };
  return { type: 'gray', label: `Còn ${diff} ngày` };
}

/**
 * Hạn lead phải bao trùm hạn các việc chưa xong. Trả về hạn mới nếu cần dời,
 * hoặc null nếu giữ nguyên. Chỉ dời ra xa, không kéo gần lại.
 */
function nextLeadDeadline(lead: Lead, extraDue?: string | null): string | null {
  const dues = (lead.todos || []).filter((t) => !t.done && t.dueDate).map((t) => t.dueDate as string);
  if (extraDue) dues.push(extraDue);
  if (!dues.length) return null;
  const latest = dues.sort().pop() as string;
  if (!lead.deadline || latest > lead.deadline) return latest;
  return null;
}

async function loadCrm(): Promise<CrmData> {
  const raw = await readPath<{
    leads?: Record<string, Lead>;
    dailyTodos?: Record<string, Todo>;
    planRevenue?: number;
    planLeads?: number;
  } | null>(DATA_ROOT);

  const data = raw || {};
  return {
    leads: Object.values(data.leads || {}).map(normalizeLead),
    dailyTodos: Object.values(data.dailyTodos || {}),
    planRevenue: typeof data.planRevenue === 'number' ? data.planRevenue : 0,
    planLeads: typeof data.planLeads === 'number' ? data.planLeads : 0,
  };
}

function daysDiff(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  const today = Date.parse(todayISO() + 'T00:00:00Z');
  if (isNaN(target)) return null;
  return Math.round((target - today) / 86400000);
}

function daysBetween(fromStr?: string | null, toStr?: string | null): number | null {
  if (!fromStr || !toStr) return null;
  const a = Date.parse(String(fromStr).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toStr).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function inMonth(dateStr: string | null | undefined, month: number, year: number): boolean {
  if (!dateStr) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).slice(0, 10));
  if (!m) return false;
  return Number(m[1]) === year && Number(m[2]) === month + 1;
}

function monthKeyOf(month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Tháng/năm hiện tại theo giờ VN (month 0-based, giống app). */
function currentMonthYear(): { month: number; year: number } {
  const [y, m] = todayISO().split('-').map(Number);
  return { month: m - 1, year: y };
}

function leadStatus(lead: Lead): { type: string; label: string } {
  if (lead.stage === 'won') return { type: 'won', label: 'Đã chốt ✓' };
  if (lead.stage === 'lost') return { type: 'lost', label: 'Đã đóng' };
  if (!lead.deadline) return { type: 'gray', label: 'Chưa hẹn' };
  const diff = daysDiff(lead.deadline);
  if (diff === null) return { type: 'gray', label: 'Chưa hẹn' };
  if (diff < 0) return { type: 'red', label: `Trễ ${Math.abs(diff)} ngày` };
  if (diff === 0) return { type: 'green', label: 'Hôm nay' };
  return { type: 'gray', label: `Còn ${diff} ngày` };
}

/** Giai đoạn xa nhất lead từng đạt tới — dùng tính CR. Mirror reachedStageIndex() của app. */
function reachedStageIndex(l: Lead): number {
  const nameToIdx: Record<string, number> = {};
  STAGES.forEach((s, i) => {
    nameToIdx[s.name] = i;
  });
  let maxIdx = 0;
  const curIdx = STAGE_IDS.indexOf(l.stage);
  if (l.stage !== 'lost' && curIdx >= 0) maxIdx = curIdx;
  (l.activityLog || []).forEach((a) => {
    const t = a.text || '';
    if (t.indexOf('Chốt deal thành công') !== -1) {
      maxIdx = Math.max(maxIdx, STAGE_IDS.indexOf('won'));
    }
    const m = /sang "(.+?)"/.exec(t) || /Chuyển vào giai đoạn "(.+?)"/.exec(t);
    if (m && nameToIdx[m[1]] !== undefined) maxIdx = Math.max(maxIdx, nameToIdx[m[1]]);
  });
  return maxIdx;
}

function leadTypeOf(l: Lead): string {
  return l.leadType || 'Lead công ty';
}

function formatMoney(n?: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN') + ' đ';
}

/** Rút gọn lead cho danh sách — tránh trả activityLog dài làm tốn context. */
function summarizeLead(l: Lead) {
  const status = leadStatus(l);
  return {
    id: l.id,
    name: l.name,
    stage: l.stage,
    stageName: STAGE_NAME[l.stage] || l.stage,
    leadType: leadTypeOf(l),
    package: l.package || null,
    phone: l.phone || null,
    revenueExpected: l.revenueExpected || 0,
    revenueExpectedText: formatMoney(l.revenueExpected),
    deadline: l.deadline || null,
    status: status.label,
    isOverdue: status.type === 'red',
    isPotential: (l.tags || []).includes('Tiềm năng'),
    expectedCloseMonth: l.expectedCloseMonth || null,
    weddingDate: l.weddingDate || null,
    openTodos: (l.todos || []).filter((t) => !t.done).length,
  };
}

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

/**
 * Xác định việc cần thao tác. Ưu tiên id vì nó ổn định; chỉ số mảng chỉ dùng khi
 * không có id, và có rủi ro: xóa một việc là mọi chỉ số phía sau dịch đi.
 */
function resolveTodo(
  l: Lead,
  ref: { todoId?: string; todoIndex?: number; todoText?: string },
  chuaXongThoi = false
): { idx: number; todo: Todo } {
  const todos = l.todos || [];

  if (ref.todoId) {
    const idx = todos.findIndex((t) => t.id === ref.todoId);
    if (idx < 0) throw new Error(`Lead "${l.name}" không có việc nào mang id ${ref.todoId}.`);
    return { idx, todo: todos[idx] };
  }

  if (ref.todoIndex !== undefined) {
    const todo = todos[ref.todoIndex];
    if (!todo) throw new Error(`Lead "${l.name}" không có việc ở vị trí ${ref.todoIndex}.`);
    return { idx: ref.todoIndex, todo };
  }

  if (!ref.todoText) {
    throw new Error('Cần truyền todoId, todoIndex hoặc todoText để xác định việc.');
  }

  const q = ref.todoText.toLowerCase().trim();
  const found = todos
    .map((t, i) => ({ t, i }))
    .filter((x) => (x.t.text || '').toLowerCase().includes(q) && (chuaXongThoi ? !x.t.done : true));

  if (!found.length) throw new Error(`Không tìm thấy việc nào khớp "${ref.todoText}".`);
  if (found.length > 1) {
    throw new Error(
      `Có ${found.length} việc khớp: ${found
        .map((x) => `[${x.i}] ${x.t.text}`)
        .join(' | ')}. Hãy dùng todoId cho chắc.`
    );
  }
  return { idx: found[0].i, todo: found[0].t };
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
          todos: (l.todos || []).map((t, i) => ({
            index: i,
            ...t,
            status: todoStatus(t).label,
            daysUntilDue: daysDiff(t.dueDate),
          })),
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
          'Liệt kê các việc cần làm gắn với lead, kèm hạn riêng của từng việc. Mặc định chỉ lấy việc chưa hoàn thành, sắp xếp việc gấp lên trước.',
        inputSchema: z.object({
          includeDone: z.boolean().optional().describe('Bao gồm cả việc đã xong (mặc định false)'),
          lead: z.string().optional().describe('Chỉ lấy việc của một lead cụ thể (id hoặc tên)'),
          scope: z
            .enum(['overdue', 'today', 'week', 'all'])
            .optional()
            .describe('overdue = trễ hạn, today = hạn hôm nay trở về trước, week = trong 7 ngày tới, all = tất cả'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const source = args.lead ? [findLead(crm, args.lead)] : crm.leads;

        let rows = source.flatMap((l) =>
          (l.todos || [])
            .map((t, i) => {
              const st = todoStatus(t);
              return {
                ...t,
                index: i,
                leadId: l.id,
                leadName: l.name,
                stage: l.stage,
                stageName: STAGE_NAME[l.stage] || l.stage,
                status: st.label,
                isOverdue: st.type === 'red',
                daysUntilDue: daysDiff(t.dueDate),
              };
            })
            .filter((t) => (args.includeDone ? true : !t.done))
        );

        const scope = args.scope ?? 'all';
        if (scope !== 'all') {
          rows = rows.filter((t) => {
            const d = t.daysUntilDue;
            if (d === null) return false;
            if (scope === 'overdue') return d < 0;
            if (scope === 'today') return d <= 0;
            return d >= 0 && d <= 7; // week
          });
        }

        // Việc gấp lên trước; việc chưa hẹn xuống cuối
        rows.sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999));

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
        description:
          'Thêm một việc cần làm vào lead, có hạn riêng của việc đó. Bỏ trống hạn thì lấy theo hạn hiện tại của lead. Nếu hạn việc xa hơn hạn lead, hạn lead tự dời theo.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          text: z.string().min(1).describe('Nội dung việc cần làm'),
          dueDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo dạng YYYY-MM-DD')
            .optional()
            .describe('Hạn riêng của việc này, dạng YYYY-MM-DD'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const todos = l.todos || [];
        const dueDate = args.dueDate || l.deadline || null;

        await patchPath(`${DATA_ROOT}/leads/${l.id}/todos`, {
          [todos.length]: {
            id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
            text: args.text,
            done: false,
            dueDate,
            completedAt: null,
          },
        });

        // Hạn lead phải bao trùm hạn việc
        const moved = nextLeadDeadline(l, dueDate);
        if (moved) await patchPath(`${DATA_ROOT}/leads/${l.id}`, { deadline: moved });

        await logActivity(l, `Thêm việc cần làm: ${args.text}${dueDate ? ` (hạn ${dueDate})` : ''}`);
        await touch();

        return say(
          `Đã thêm việc "${args.text}" cho lead "${l.name}"${dueDate ? `, hạn ${dueDate}` : ''}.` +
            (moved ? ` Hạn của lead cũng dời sang ${moved} cho khớp.` : '')
        );
      }
    );

    server.registerTool(
      'complete_todo',
      {
        title: 'Đánh dấu việc hoàn thành',
        description:
          'Tick hoàn thành một việc cần làm của lead. Xác định việc bằng todoId (chắc chắn nhất, lấy từ get_lead/list_todos), hoặc bằng nội dung việc.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          todoId: z.string().optional().describe('id của việc — cách xác định chắc chắn nhất'),
          todoIndex: z.number().int().min(0).optional().describe('Số thứ tự việc trong danh sách'),
          todoText: z.string().optional().describe('Hoặc khớp theo nội dung việc'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const { idx, todo } = resolveTodo(l, args, true);

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

    server.registerTool(
      'update_todo',
      {
        title: 'Sửa việc cần làm',
        description:
          'Đổi hạn hoặc nội dung của một việc đã có. Nếu hạn mới xa hơn hạn lead thì hạn lead tự dời theo.',
        inputSchema: z.object({
          lead: z.string().describe('leadId hoặc tên khách'),
          todoId: z.string().optional().describe('id của việc — cách xác định chắc chắn nhất'),
          todoIndex: z.number().int().min(0).optional().describe('Số thứ tự việc trong danh sách'),
          todoText: z.string().optional().describe('Hoặc khớp theo nội dung việc hiện tại'),
          dueDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo dạng YYYY-MM-DD')
            .nullable()
            .optional()
            .describe('Hạn mới, dạng YYYY-MM-DD. Truyền null để bỏ hạn.'),
          newText: z.string().min(1).optional().describe('Nội dung mới cho việc'),
        }),
      },
      async (args) => {
        const crm = await loadCrm();
        const l = findLead(crm, args.lead);
        const { idx, todo } = resolveTodo(l, args);

        const patch: Record<string, unknown> = {};
        const changed: string[] = [];
        if (args.dueDate !== undefined) {
          patch.dueDate = args.dueDate;
          changed.push(args.dueDate ? `hạn ${args.dueDate}` : 'bỏ hạn');
        }
        if (args.newText !== undefined) {
          patch.text = args.newText;
          changed.push(`nội dung "${args.newText}"`);
        }
        if (!changed.length) return say('Không có gì để sửa — truyền dueDate hoặc newText.');

        await patchPath(`${DATA_ROOT}/leads/${l.id}/todos/${idx}`, patch);

        let moved: string | null = null;
        if (args.dueDate) {
          // Tính lại trên bản đã cập nhật để hạn lead bao trùm đúng
          todo.dueDate = args.dueDate;
          moved = nextLeadDeadline(l);
          if (moved) await patchPath(`${DATA_ROOT}/leads/${l.id}`, { deadline: moved });
        }

        await logActivity(l, `Sửa việc "${todo.text}": ${changed.join(', ')}`);
        await touch();

        return say(
          `Đã sửa việc "${todo.text}" của lead "${l.name}" (${changed.join(', ')}).` +
            (moved ? ` Hạn của lead dời sang ${moved} cho khớp.` : '')
        );
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
