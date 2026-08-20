/**
 * Test 6 tool GHI trên nhánh sandbox 'crmDataTest'.
 * KHÔNG đụng vào 'crmData' (dữ liệu thật của vợ).
 * Cuối bài luôn xóa sandbox, kể cả khi lỗi giữa chừng.
 */

// Phải đặt TRƯỚC khi import module, vì DATA_ROOT đọc env lúc nạp module
process.env.FIREBASE_DATA_ROOT = 'crmDataTest';

const DB = 'https://huyentrancrm-default-rtdb.asia-southeast1.firebasedatabase.app';
const ROOT = 'crmDataTest';

const mod: any = await import('../api/mcp.ts');
const handler = mod.default;

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  OK   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

async function rpc(method: string, params: unknown) {
  const res = await handler.fetch(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    })
  );
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return JSON.parse(line ? line.slice(5).trim() : text);
}

async function callTool(name: string, args: Record<string, unknown>) {
  const body = await rpc('tools/call', { name, arguments: args });
  if (body?.error) return { error: JSON.stringify(body.error) };
  const text = body?.result?.content?.[0]?.text ?? '';
  return { text, isError: !!body?.result?.isError };
}

const readSandbox = async (path = '') =>
  (await fetch(`${DB}/${ROOT}${path}.json`)).json() as Promise<any>;

try {
  /* ---------- Seed sandbox ---------- */
  console.log('\n>> Dung du lieu sandbox tai /' + ROOT);
  const seedRes = await fetch(`${DB}/${ROOT}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leads: {
        LTEST1: {
          id: 'LTEST1',
          name: 'Nguyen Van Sandbox',
          stage: 'baogia',
          leadType: 'Lead công ty',
          package: 'Signature',
          revenueExpected: 50000000,
          deadline: '2026-08-20',
          createdAt: '2026-08-01',
          tags: [],
          todos: [{ text: 'Goi lai cho khach', done: false }],
          notesList: [],
          activityLog: [{ time: '01/08/2026, 09:00', text: 'Lead được tạo' }],
        },
      },
      planRevenue: 100000000,
      planLeads: 10,
    }),
  });
  if (!seedRes.ok) throw new Error('Khong seed duoc sandbox: ' + (await seedRes.text()));
  console.log('   seed OK');

  /* ---------- 1. create_lead ---------- */
  console.log('\n>> 1. create_lead');
  const r1 = await callTool('create_lead', {
    name: 'Khach Moi Test',
    phone: '0900000001',
    packageName: 'Unique',
    leadType: 'Lead salehunt',
    revenueExpected: 30000000,
    expectedCloseMonth: '2026-09',
    notes: 'Ghi chu dau tien',
  });
  check('tool khong bao loi', !r1.isError && !r1.error, JSON.stringify(r1).slice(0, 200));
  const afterCreate = await readSandbox('/leads');
  const created = Object.values<any>(afterCreate || {}).find((l) => l.name === 'Khach Moi Test');
  check('lead moi ton tai trong DB', !!created);
  check('lead cu con nguyen (khong bi ghi de)', !!afterCreate?.LTEST1, 'LTEST1 bi mat!');
  check('stage = leadin', created?.stage === 'leadin', created?.stage);
  check('leadType dung', created?.leadType === 'Lead salehunt', created?.leadType);
  check('notesList co 1 ghi chu', created?.notesList?.length === 1);
  check('activityLog co "Lead được tạo"', created?.activityLog?.[0]?.text === 'Lead được tạo');
  const newId = created?.id;

  /* ---------- 2. add_note ---------- */
  console.log('\n>> 2. add_note (tim lead theo TEN)');
  const r2 = await callTool('add_note', { lead: 'Nguyen Van Sandbox', text: 'Khach hen goi lai thu 5' });
  check('tool khong bao loi', !r2.isError && !r2.error, JSON.stringify(r2).slice(0, 200));
  const l1notes = (await readSandbox('/leads/LTEST1'))?.notesList;
  check('them duoc note', l1notes?.length === 1, JSON.stringify(l1notes));
  check('noi dung note dung', l1notes?.[0]?.text === 'Khach hen goi lai thu 5');

  /* ---------- 3. add_todo ---------- */
  console.log('\n>> 3. add_todo');
  const r3 = await callTool('add_todo', { lead: 'LTEST1', text: 'Gui bao gia lan 2' });
  check('tool khong bao loi', !r3.isError && !r3.error, JSON.stringify(r3).slice(0, 200));
  const l1 = await readSandbox('/leads/LTEST1');
  check('todo duoc APPEND (2 viec)', l1?.todos?.length === 2, JSON.stringify(l1?.todos));
  check('todo cu con nguyen', l1?.todos?.[0]?.text === 'Goi lai cho khach');
  check('todo moi dung noi dung', l1?.todos?.[1]?.text === 'Gui bao gia lan 2');
  check('activityLog duoc append', (l1?.activityLog?.length ?? 0) >= 2);

  /* ---------- 4. complete_todo ---------- */
  console.log('\n>> 4. complete_todo (khop theo NOI DUNG)');
  const r4 = await callTool('complete_todo', { lead: 'LTEST1', todoText: 'bao gia lan 2' });
  check('tool khong bao loi', !r4.isError && !r4.error, JSON.stringify(r4).slice(0, 200));
  const l1b = await readSandbox('/leads/LTEST1');
  check('todo[1].done = true', l1b?.todos?.[1]?.done === true);
  check('co completedAt', !!l1b?.todos?.[1]?.completedAt, String(l1b?.todos?.[1]?.completedAt));
  check('todo[0] van chua xong', l1b?.todos?.[0]?.done !== true);

  /* ---------- 5. update_lead ---------- */
  console.log('\n>> 5. update_lead');
  const r5 = await callTool('update_lead', {
    lead: 'LTEST1',
    revenueExpected: 75000000,
    deadline: '2026-09-01',
    markPotential: true,
  });
  check('tool khong bao loi', !r5.isError && !r5.error, JSON.stringify(r5).slice(0, 200));
  const l1c = await readSandbox('/leads/LTEST1');
  check('revenueExpected cap nhat', l1c?.revenueExpected === 75000000, String(l1c?.revenueExpected));
  check('deadline cap nhat', l1c?.deadline === '2026-09-01', String(l1c?.deadline));
  check('gan nhan Tiem nang', (l1c?.tags || []).includes('Tiềm năng'), JSON.stringify(l1c?.tags));
  check('ten khong bi xoa', l1c?.name === 'Nguyen Van Sandbox', String(l1c?.name));
  check('todos khong bi mat', l1c?.todos?.length === 2);

  /* ---------- 6. move_stage ---------- */
  console.log('\n>> 6. move_stage — thuong');
  const r6 = await callTool('move_stage', { lead: 'LTEST1', stage: 'follow2' });
  check('tool khong bao loi', !r6.isError && !r6.error, JSON.stringify(r6).slice(0, 200));
  const l1d = await readSandbox('/leads/LTEST1');
  check('stage = follow2', l1d?.stage === 'follow2', String(l1d?.stage));
  const lastLog = l1d?.activityLog?.[l1d.activityLog.length - 1]?.text ?? '';
  check('log dung dinh dang "Chuyển từ ... sang ..."', /Chuyển từ ".+" sang ".+"/.test(lastLog), lastLog);

  console.log('\n>> 6b. move_stage -> lost KHONG co ly do (phai bi tu choi)');
  const r6b = await callTool('move_stage', { lead: 'LTEST1', stage: 'lost' });
  check('bi tu choi dung nhu mong doi', !!r6b.isError || !!r6b.error);
  const l1e = await readSandbox('/leads/LTEST1');
  check('stage KHONG doi sau khi bi tu choi', l1e?.stage === 'follow2', String(l1e?.stage));

  console.log('\n>> 6c. move_stage -> won');
  const r6c = await callTool('move_stage', { lead: newId, stage: 'won', revenueActual: 42000000 });
  check('tool khong bao loi', !r6c.isError && !r6c.error, JSON.stringify(r6c).slice(0, 200));
  const wonLead = await readSandbox(`/leads/${newId}`);
  check('stage = won', wonLead?.stage === 'won', String(wonLead?.stage));
  check('revenueActual duoc ghi', wonLead?.revenueActual === 42000000, String(wonLead?.revenueActual));
  check('co wonAt', !!wonLead?.wonAt, String(wonLead?.wonAt));

  /* ---------- 7. Hạn riêng của việc ---------- */
  console.log('\n>> 7. add_todo CO han rieng, xa hon han lead');
  const r7 = await callTool('add_todo', {
    lead: 'LTEST1',
    text: 'Gui hop dong',
    dueDate: '2026-12-31',
  });
  check('tool khong bao loi', !r7.isError && !r7.error, JSON.stringify(r7).slice(0, 200));
  const l1f = await readSandbox('/leads/LTEST1');
  const viecMoi = (l1f?.todos || []).find((t: any) => t.text === 'Gui hop dong');
  check('viec moi co dueDate dung', viecMoi?.dueDate === '2026-12-31', String(viecMoi?.dueDate));
  check('viec moi co id', !!viecMoi?.id, String(viecMoi?.id));
  check('HAN LEAD tu doi ra xa theo viec', l1f?.deadline === '2026-12-31', String(l1f?.deadline));

  console.log('\n>> 7b. add_todo KHONG co han -> ke thua han lead');
  await callTool('add_todo', { lead: 'LTEST1', text: 'Viec khong hen' });
  const l1g = await readSandbox('/leads/LTEST1');
  const viecKhongHen = (l1g?.todos || []).find((t: any) => t.text === 'Viec khong hen');
  check('ke thua han cua lead', viecKhongHen?.dueDate === '2026-12-31', String(viecKhongHen?.dueDate));

  console.log('\n>> 7c. update_todo doi han GAN lai -> han lead KHONG bi keo gan');
  const r7c = await callTool('update_todo', {
    lead: 'LTEST1',
    todoId: viecMoi?.id,
    dueDate: '2026-09-15',
  });
  check('tool khong bao loi', !r7c.isError && !r7c.error, JSON.stringify(r7c).slice(0, 200));
  const l1h = await readSandbox('/leads/LTEST1');
  const viecSua = (l1h?.todos || []).find((t: any) => t.id === viecMoi?.id);
  check('han viec da doi', viecSua?.dueDate === '2026-09-15', String(viecSua?.dueDate));
  check('han lead GIU NGUYEN (chi doi ra xa)', l1h?.deadline === '2026-12-31', String(l1h?.deadline));

  console.log('\n>> 7d. complete_todo bang todoId');
  const r7d = await callTool('complete_todo', { lead: 'LTEST1', todoId: viecMoi?.id });
  check('tool khong bao loi', !r7d.isError && !r7d.error, JSON.stringify(r7d).slice(0, 200));
  const l1i = await readSandbox('/leads/LTEST1');
  const viecXong = (l1i?.todos || []).find((t: any) => t.id === viecMoi?.id);
  check('done = true', viecXong?.done === true);
  check('co completedAt', !!viecXong?.completedAt, String(viecXong?.completedAt));

  console.log('\n>> 7e. list_todos loc theo scope');
  const r7e = await callTool('list_todos', { lead: 'LTEST1', scope: 'all' });
  const dsTodo = JSON.parse(r7e.text || '{}');
  check('tra ve dueDate cho tung viec', (dsTodo.todos || []).every((t: any) => 'dueDate' in t));
  check('co truong trang thai', (dsTodo.todos || []).every((t: any) => 'status' in t));

  console.log('\n>> 7f. viec cu KHONG co id -> van thao tac duoc (bu id theo vi tri)');
  // LTEST1 ban dau co 1 viec seed khong id, khong dueDate
  const r7f = await callTool('complete_todo', { lead: 'LTEST1', todoText: 'Goi lai cho khach' });
  check('tick duoc viec cu khong id', !r7f.isError && !r7f.error, JSON.stringify(r7f).slice(0, 200));

  /* ---------- 8. dashboard doc lai sandbox ---------- */
  console.log('\n>> 8. dashboard_summary doc lai sandbox');
  const r8 = await callTool("dashboard_summary", { month: 8, year: 2026 });
  const dash = JSON.parse(r8.text || "{}");
  check('dashboard chay duoc', !r8.isError, String(r8.text).slice(0, 200));
  check('dem duoc 1 deal won', dash?.doanhThuThucTe?.soDealWon === 1, JSON.stringify(dash?.doanhThuThucTe));
} catch (e: any) {
  fail++;
  console.log('\nNGOAI LE: ' + e.message + '\n' + e.stack);
} finally {
  /* ---------- Dọn sandbox ---------- */
  const del = await fetch(`${DB}/${ROOT}.json`, { method: 'DELETE' });
  const leftover = await (await fetch(`${DB}/${ROOT}.json`)).json();
  console.log(`\n>> Xoa sandbox: HTTP ${del.status} | con lai: ${JSON.stringify(leftover)}`);

  // Chốt lại: dữ liệu thật phải còn nguyên
  const realCount = Object.keys((await (await fetch(`${DB}/crmData/leads.json?shallow=true`)).json()) || {}).length;
  console.log(`>> Kiem tra du lieu THAT: ${realCount} lead trong crmData`);

  console.log(`\n${'='.repeat(50)}\nKET QUA: ${pass} PASS / ${fail} FAIL\n${'='.repeat(50)}`);
}
