/**
 * Logic nghiệp vụ CRM — phản chiếu đúng cách tính trong index.html
 * để số liệu MCP trả về khớp với số liệu hiển thị trên app.
 */

import { readPath } from './firebase.js';

/**
 * Vercel Functions chạy theo giờ UTC, còn người dùng ở Việt Nam (UTC+7).
 * Mọi mốc "hôm nay" / "bây giờ" đều phải quy về Asia/Ho_Chi_Minh, nếu không
 * lead tạo lúc sáng sớm sẽ bị ghi nhầm sang ngày hôm trước.
 */
const TZ = 'Asia/Ho_Chi_Minh';

/** Ngày hôm nay theo giờ VN, dạng YYYY-MM-DD (khớp field createdAt/deadline của app). */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Nhãn thời gian dạng "DD/MM/YYYY, HH:mm" — đúng định dạng nowLabel() của app. */
export function nowLabel(): string {
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

export const STAGES = [
  { id: 'leadin', name: 'Lead in' },
  { id: 'baogia', name: 'Báo giá' },
  { id: 'follow1', name: 'Follow up lần 1' },
  { id: 'follow2', name: 'Follow up lần 2' },
  { id: 'follow3', name: 'Follow up lần 3' },
  { id: 'nuoidaihan', name: 'Nuôi dài hạn' },
  { id: 'won', name: 'Won' },
  { id: 'lost', name: 'Lost' },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const STAGE_NAME: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.name])
);

export const PACKAGES = ['Standard', 'Unique', 'Signature', 'HayDay Package', 'Gói lẻ'] as const;
export const LEAD_TYPES = ['Lead công ty', 'Lead salehunt'] as const;
export const LOST_REASONS = [
  'Chi phí thấp',
  'Khách không phải tệp tiềm năng của HayDay',
  'Đã chọn đơn vị khác',
  'Khách không phản hồi nhiều lần',
] as const;

export interface Todo {
  id?: string;
  text: string;
  done?: boolean;
  dueDate?: string | null;
  completedAt?: string | null;
}

export interface Note {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  time: string;
  text: string;
  isNow?: boolean;
}

export interface Lead {
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

export interface CrmData {
  leads: Lead[];
  dailyTodos: Todo[];
  planRevenue: number;
  planLeads: number;
}

/** Đọc toàn bộ dữ liệu CRM từ Firebase và chuẩn hóa về mảng. */
export async function loadCrm(): Promise<CrmData> {
  const raw = await readPath<{
    leads?: Record<string, Lead>;
    dailyTodos?: Record<string, Todo>;
    planRevenue?: number;
    planLeads?: number;
  } | null>('crmData');

  const data = raw || {};
  return {
    leads: Object.values(data.leads || {}).map(normalizeLead),
    dailyTodos: Object.values(data.dailyTodos || {}),
    planRevenue: typeof data.planRevenue === 'number' ? data.planRevenue : 0,
    planLeads: typeof data.planLeads === 'number' ? data.planLeads : 0,
  };
}

/** Bù các field có thể thiếu ở lead cũ — tương ứng migrateLead() trong app. */
function normalizeLead(l: Lead): Lead {
  if (!l.leadType) l.leadType = 'Lead công ty';
  if (!Array.isArray(l.notesList)) l.notesList = [];
  if (!Array.isArray(l.tags)) l.tags = [];
  if (!Array.isArray(l.todos)) l.todos = [];
  if (!Array.isArray(l.activityLog)) l.activityLog = [];
  return l;
}

/* ===================== Helper ngày tháng ===================== */

export function daysDiff(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  const today = Date.parse(todayISO() + 'T00:00:00Z');
  if (isNaN(target)) return null;
  return Math.round((target - today) / 86400000);
}

export function daysBetween(fromStr?: string | null, toStr?: string | null): number | null {
  if (!fromStr || !toStr) return null;
  const a = Date.parse(String(fromStr).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toStr).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function inMonth(dateStr: string | null | undefined, month: number, year: number): boolean {
  if (!dateStr) return false;
  const s = String(dateStr).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  return Number(m[1]) === year && Number(m[2]) === month + 1;
}

export function monthKeyOf(month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Tháng/năm hiện tại theo giờ VN (month là 0-based, giống app). */
export function currentMonthYear(): { month: number; year: number } {
  const [y, m] = todayISO().split('-').map(Number);
  return { month: m - 1, year: y };
}

/* ===================== Trạng thái & phễu ===================== */

export function leadStatus(lead: Lead): { type: string; label: string } {
  if (lead.stage === 'won') return { type: 'won', label: 'Đã chốt ✓' };
  if (lead.stage === 'lost') return { type: 'lost', label: 'Đã đóng' };
  if (!lead.deadline) return { type: 'gray', label: 'Chưa hẹn' };
  const diff = daysDiff(lead.deadline);
  if (diff === null) return { type: 'gray', label: 'Chưa hẹn' };
  if (diff < 0) return { type: 'red', label: `Trễ ${Math.abs(diff)} ngày` };
  if (diff === 0) return { type: 'green', label: 'Hôm nay' };
  return { type: 'gray', label: `Còn ${diff} ngày` };
}

/** Giai đoạn xa nhất lead từng đạt tới — dùng để tính CR. Mirror reachedStageIndex() của app. */
export function reachedStageIndex(l: Lead): number {
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

export function leadTypeOf(l: Lead): string {
  return l.leadType || 'Lead công ty';
}

export function formatMoney(n?: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN') + ' đ';
}

/** Rút gọn lead cho danh sách — tránh trả về activityLog dài dòng làm tốn context. */
export function summarizeLead(l: Lead) {
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
