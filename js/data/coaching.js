// 상담 · 계획 · 학부모 보고
// 계획 한 장 = 상담일 ~ 다음 상담일. 상담 1회 = 지난 계획 마감 + 새 계획 + 보고 1개.
import { sb } from '../sb.js';
import { today, addDays, mondayOf, short } from '../date.js';

function check(res) { if (res.error) throw res.error; return res.data; }
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/* ---------- 상담일 ---------- */
// 이번 주(월 기준) 코칭 요일 날짜
export const scheduledOn = (weekday, base = today()) => addDays(mondayOf(base), weekday - 1);

/* ---------- 이번 주 상담 현황 (코칭 탭용) ---------- */
// Map(studentId → coaching row) : 이번 주 예정일 기준
export async function loadWeekCoachings(base = today()) {
  const mon = mondayOf(base);
  const rows = check(await sb.from('coachings').select('id,student_id,scheduled_on,held_on,kind')
    .gte('scheduled_on', mon).lte('scheduled_on', addDays(mon, 6)));
  return new Map(rows.map((r) => [r.student_id, r]));
}
// 진행 중인 계획: Map(studentId → plan)
export async function loadOpenPlans() {
  const rows = check(await sb.from('plans').select('id,student_id,start_date,due_date,author_role,status').neq('status', '마감'));
  return new Map(rows.map((r) => [r.student_id, r]));
}

/* ---------- 상담 화면 데이터 ---------- */
// 반환: { coaching, report, prevPlan, prevItems, newPlan, newItems, progress: Map(itemId → [{on_date,pct}]), subjects }
export async function loadConsult(studentId, scheduled) {
  const [coaching, plans, subjects] = await Promise.all([
    sb.from('coachings').select('*').eq('student_id', studentId).eq('scheduled_on', scheduled).maybeSingle().then(check),
    sb.from('plans').select('*').eq('student_id', studentId).order('start_date', { ascending: false }).limit(6).then(check),
    sb.from('student_subjects').select('*').eq('student_id', studentId).order('sort_order').then(check),
  ]);
  plans.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const find = (id) => plans.find((p) => p.id === id) || null;

  let prevPlan = null, newPlan = null;
  if (coaching) {
    prevPlan = find(coaching.closed_plan_id);
    newPlan = find(coaching.new_plan_id);
  } else {
    const open = plans.find((p) => p.status !== '마감');
    if (open && open.start_date >= scheduled) {
      newPlan = open;                                    // 학생이 미리 세운 자율 계획
      prevPlan = plans.find((p) => p !== open && p.start_date < open.start_date) || null;
    } else {
      prevPlan = open || plans.find((p) => p.start_date < scheduled) || null;
    }
  }

  const ids = [prevPlan?.id, newPlan?.id].filter(Boolean);
  const items = ids.length ? check(await sb.from('plan_items').select('*').in('plan_id', ids)) : [];
  const prevItems = items.filter((i) => i.plan_id === prevPlan?.id).sort(byOrder);
  const newItems = items.filter((i) => i.plan_id === newPlan?.id).sort(byOrder);

  const progress = new Map();
  if (prevItems.length) {
    const rows = check(await sb.from('plan_progress').select('item_id,on_date,pct').in('item_id', prevItems.map((i) => i.id)));
    rows.sort((a, b) => (a.on_date < b.on_date ? -1 : 1));
    for (const r of rows) { if (!progress.has(r.item_id)) progress.set(r.item_id, []); progress.get(r.item_id).push(r); }
  }

  const report = coaching
    ? check(await sb.from('reports').select('*').eq('coaching_id', coaching.id).maybeSingle())
    : null;

  return { coaching, report, prevPlan, prevItems, newPlan, newItems, progress, subjects };
}

// 지난 계획들 (이월 가져오기용): 마감된 최근 계획 2개의 항목
export async function loadCarryCandidates(studentId, excludeIds = []) {
  const plans = check(await sb.from('plans').select('id,start_date,due_date').eq('student_id', studentId)
    .order('start_date', { ascending: false }).limit(4)).filter((p) => !excludeIds.includes(p.id)).slice(0, 2);
  if (!plans.length) return [];
  const items = check(await sb.from('plan_items').select('*').in('plan_id', plans.map((p) => p.id)));
  return plans.map((p) => ({ ...p, items: items.filter((i) => i.plan_id === p.id).sort(byOrder) }));
}

/* ---------- 저장 ---------- */
// s = { student, scheduled, heldOn, absent, isNew, isLeaving, summary, checkItems,
//       prevPlan, prevItems:[{id,subject,subject_detail,title,final_rate,final_note}],
//       newPlan, newItems:[{id?,subject,subject_detail,title,detail,source,carried_from}], removedIds:[], subjects }
export async function saveConsult(s, me) {
  const sid = s.student.id;

  // 1) 지난 계획: 최종 이행률 기록, 마감 (결석이면 마감하지 않음 → 계획이 다음 상담까지 이어짐)
  for (const it of s.prevItems) {
    check(await sb.from('plan_items').update({ final_rate: it.final_rate ?? null, final_note: it.final_note || null, ...(it.academy ? { academy_progress: it.academy_progress?.trim() || null } : {}) }).eq('id', it.id));
  }
  if (s.prevPlan && !s.absent && s.prevPlan.status !== '마감') {
    check(await sb.from('plans').update({ status: '마감', closed_at: new Date().toISOString() }).eq('id', s.prevPlan.id));
  }

  // 2) 새 계획
  let newPlanId = s.newPlan?.id || null;
  const due = addDays(s.scheduled, 7);
  if (!s.absent || newPlanId) {
    if (newPlanId) {
      check(await sb.from('plans').update({ status: '확정', due_date: s.newPlan.due_date || due }).eq('id', newPlanId));
    } else if (s.newItems.length) {
      const p = check(await sb.from('plans').insert({
        student_id: sid, start_date: s.heldOn || s.scheduled, due_date: due,
        author_role: '선생님', status: '확정', created_by: me,
      }).select('id').single());
      newPlanId = p.id;
    }
    if (s.removedIds.length) check(await sb.from('plan_items').delete().in('id', s.removedIds));
    for (const [i, it] of s.newItems.entries()) {
      const row = {
        subject: it.subject, subject_detail: it.subject_detail || null, title: it.title.trim(),
        detail: it.detail?.trim() || null, sort_order: i, academy: !!it.academy,
      };
      if (it.id) check(await sb.from('plan_items').update(row).eq('id', it.id));
      else check(await sb.from('plan_items').insert({
        ...row, plan_id: newPlanId, student_id: sid, source: it.source || '계획',
        carried_from: it.carried_from || null, created_by: me,
      }));
    }
    // 학생 과목 목록에 없는 과목 추가
    const key = (x) => `${x.subject}|${x.subject_detail || ''}`;
    const have = new Set(s.subjects.map(key));
    const add = [];
    for (const it of s.newItems) if (!have.has(key(it))) { have.add(key(it)); add.push({ student_id: sid, subject: it.subject, subject_detail: it.subject_detail || null, sort_order: have.size }); }
    if (add.length) check(await sb.from('student_subjects').insert(add));
  }

  // 3) 상담 기록
  const kind = s.absent ? '결석' : (s.heldOn > s.scheduled ? '보강' : '정규');
  const coaching = check(await sb.from('coachings').upsert({
    student_id: sid, scheduled_on: s.scheduled, held_on: s.absent ? null : s.heldOn, kind,
    is_new: s.isNew, is_leaving: s.isLeaving, summary_raw: s.summary || null, check_items: s.checkItems,
    closed_plan_id: s.prevPlan?.id || null, new_plan_id: newPlanId, author: me,
  }, { onConflict: 'student_id,scheduled_on' }).select('id').single());

  // 4) 보고 (숫자·계획은 저장 시점으로 고정)
  // 학원 숙제 항목: 해간 횟수 · 학원 진도 · 피드백도 함께 (학부모 보고에 표시)
  const rates = s.prevItems.map((i) => ({
    subject: i.subject, detail: i.subject_detail || '', title: i.title, rate: i.final_rate ?? null,
    ...(i.academy ? { academy: { done: i.acStat?.done ?? null, total: i.acStat?.total ?? null, progress: i.academy_progress?.trim() || '', note: i.final_note?.trim() || '' } } : {}),
  }));
  const next_plan = s.newItems.map((i) => ({ subject: i.subject, detail: i.subject_detail || '', title: i.title.trim() }));
  check(await sb.from('reports').upsert({
    coaching_id: coaching.id, student_id: sid,
    period_start: s.prevPlan?.start_date || null, period_end: s.absent ? s.scheduled : s.heldOn,
    is_absent: s.absent, rates, next_plan, check_items: s.checkItems, author: me,
    ...(s.isNew ? { stats: { is_new: true, profile: s.profile || {} } } : {}),
  }, { onConflict: 'coaching_id' }));

  return coaching.id;
}

/* ---------- 배지 판정용 숫자 (기간 = 지난 상담 ~ 이번 상담) ---------- */
// { avg, prev_avg, study_seconds, days_needed, days_studied }
const avgOf = (rates) => { const rs = (rates || []).filter((x) => x.rate != null); return rs.length ? Math.round(rs.reduce((a, x) => a + x.rate, 0) / rs.length) : null; };
export async function computeReportStats(report) {
  const end = report.period_end || today();
  const start = report.period_start || addDays(end, -7);
  const [sessions, reports] = await Promise.all([
    sb.from('study_sessions').select('study_date,net_seconds').eq('student_id', report.student_id).gte('study_date', start).then(check),
    sb.from('reports').select('id,period_end,rates').eq('student_id', report.student_id).then(check),
  ]);
  const inRange = sessions.filter((x) => x.study_date < end && (x.net_seconds || 0) > 0);
  const studied = new Set(inRange.map((x) => x.study_date));
  let needed = 0, hit = 0;
  for (let d = start; d < end; d = addDays(d, 1)) {
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) continue;   // 일요일 제외
    needed++; if (studied.has(d)) hit++;
  }
  const prev = reports.filter((x) => x.id !== report.id && x.period_end && x.period_end < end)
    .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];
  return {
    avg: avgOf(report.rates), prev_avg: prev ? avgOf(prev.rates) : null,
    study_seconds: inRange.reduce((a, x) => a + x.net_seconds, 0), days_needed: needed, days_studied: hit,
  };
}

export async function saveReport(coachingId, patch) {
  return check(await sb.from('reports').update(patch).eq('coaching_id', coachingId).select('*').single());
}

/* ---------- GPT ---------- */
export function reportSubjects(report) {
  const src = report.rates?.length ? report.rates : report.next_plan || [];
  return [...new Set(src.map((r) => r.subject))];
}

export function buildPrompt({ student, scheduled, report, prevItems, summary, checkItems }) {
  if (report.stats?.is_new) return buildNewPrompt({ student, scheduled, report, summary });
  const subs = reportSubjects(report);
  const lines = [];
  lines.push('아래는 학원 학습 코칭 상담 기록입니다. 학부모에게 보낼 문장으로 정돈해 주세요.');
  lines.push('');
  lines.push('[규칙]');
  lines.push('- 아래 출력 형식 그대로만 답합니다. 머리말·맺음말·꾸밈 기호를 넣지 않습니다.');
  lines.push('- 과목별 피드백은 과목마다 2문장 이내, 총평은 3문장 이내로 씁니다.');
  lines.push('- 학부모께 드리는 정중한 존댓말(~습니다)로 씁니다. 이모지·과장 표현을 쓰지 않습니다.');
  lines.push('- 기록에 없는 내용을 지어내지 않습니다. 이행률 숫자는 문장에 넣지 않아도 됩니다.');
  lines.push('');
  lines.push('[출력 형식]');
  for (const s of subs) lines.push(`[${s}] 피드백`);
  lines.push('[총평] 총평');
  lines.push('');
  lines.push('[상담 기록]');
  lines.push(`학생: ${student.name} (${student.grade})`);
  lines.push(`상담일: ${short(scheduled)}${report.is_absent ? ' · 상담 결석' : ''}`);
  if (prevItems.length) {
    lines.push('지난 계획 이행도:');
    for (const i of prevItems) {
      const sub = i.subject + (i.subject_detail ? `(${i.subject_detail})` : '');
      if (i.academy) {
        const ra = (report.rates || []).find((x) => x.subject === i.subject && x.title === i.title)?.academy;
        const st = ra?.total ? `학원 숙제 ${ra.done}/${ra.total}회 해감` : '학원 숙제';
        lines.push(`- ${sub} | ${i.title} | ${st}${i.academy_progress ? ` | 학원 진도: ${i.academy_progress}` : ''}${i.final_note ? ` | 선생님 메모: ${i.final_note}` : ''}`);
      } else lines.push(`- ${sub} | ${i.title} | ${i.final_rate ?? '-'}%${i.final_note ? ` | ${i.final_note}` : ''}`);
    }
  } else lines.push('지난 계획 이행도: 없음 (신규생)');
  if (report.next_plan?.length) {
    lines.push('다음 계획:');
    for (const i of report.next_plan) lines.push(`- ${i.subject}${i.detail ? `(${i.detail})` : ''} | ${i.title}`);
  }
  lines.push(`선생님 총평 원문: ${summary || '(없음)'}`);
  if (checkItems.length) lines.push(`다음 점검사항: ${checkItems.join(' / ')}`);
  return lines.join('\n');
}

// 신규생 상담: 총평 하나만 (과목별 앞으로의 공부 방향 중심)
function buildNewPrompt({ student, scheduled, report, summary }) {
  const P = report.stats?.profile || {};
  const L = [];
  L.push('아래는 학원 신규생 첫 상담 기록입니다. 학부모에게 보낼 총평으로 정돈해 주세요.');
  L.push('');
  L.push('[규칙]');
  L.push('- 아래 출력 형식 그대로만 답합니다. 머리말·맺음말·꾸밈 기호를 넣지 않습니다.');
  L.push('- 선생님 메모에 적힌 과목별 앞으로의 공부 방향이 과목마다 분명히 드러나게 씁니다.');
  L.push('- 학생 목표와 자신 있는 과목·보완할 과목, 만들어 갈 공부 습관을 자연스럽게 연결합니다.');
  L.push('- 분량은 내용에 맞게 정하되 한 문단으로, 읽기 편하게 씁니다.');
  L.push('- 학부모께 드리는 정중한 존댓말(~습니다)로 씁니다. 이모지·과장 표현을 쓰지 않습니다.');
  L.push('- 기록에 없는 내용을 지어내지 않습니다. 인사말과 "감사합니다" 같은 맺음말은 넣지 않습니다.');
  L.push('');
  L.push('[출력 형식]');
  L.push('[총평] 총평');
  L.push('');
  L.push('[상담 기록]');
  L.push(`학생: ${student.name} (${student.grade})`);
  L.push(`상담일: ${short(scheduled)} · 신규생 첫 상담`);
  if (P.goal) L.push(`학생 목표: ${P.goal}`);
  if (P.strong_subjects?.length) L.push(`자신 있는 과목: ${P.strong_subjects.join(', ')}`);
  if (P.weak_subjects?.length) L.push(`보완할 과목: ${P.weak_subjects.join(', ')}`);
  if (P.habits?.length) L.push(`몰입관에서 만들 공부 습관: ${P.habits.join(' / ')}`);
  if (report.next_plan?.length) {
    L.push('다음 주 계획:');
    for (const i of report.next_plan) L.push(`- ${i.subject}${i.detail ? `(${i.detail})` : ''} | ${i.title}`);
  }
  L.push(`선생님 메모 (과목별 앞으로의 공부 방향): ${summary || '(없음)'}`);
  return L.join('\n');
}

// "[국어] …" 형식 → { feedback:[{subject,text}], summary }
export function parseGpt(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*•]\s*/, '').replace(/\*\*/g, '').trim();
    const m = line.match(/^\[\s*([^\]]+?)\s*\]\s*:?\s*(.*)$/);
    if (m) { cur = { subject: m[1], text: m[2] }; out.push(cur); }
    else if (cur && line) cur.text += (cur.text ? ' ' : '') + line;
  }
  const sum = out.filter((x) => x.subject === '총평');
  return {
    feedback: out.filter((x) => x.subject !== '총평' && x.text).map((x) => ({ subject: x.subject, text: x.text.trim() })),
    summary: sum.map((x) => x.text.trim()).join(' ') || null,
  };
}

export const APP_URL = 'https://u2m-iksan.github.io/molipgwan/';
export function noticeText(student, report) {
  const d = report.period_end ? short(report.period_end) : '';
  if (report.stats?.is_new) {
    return `[몰입관] ${student.name} 학생 신규 상담 결과가 등록되었습니다. 앞으로의 성장을 몰입관이 함께하겠습니다.\n다음 주부터는 매주 상담 후 주간 학습 보고서를 보내드립니다. 앱에서 확인해 주세요.\n${APP_URL}`;
  }
  return `[몰입관] ${student.name} 학생 ${d} 상담 결과가 등록되었습니다. 앱에서 확인해 주세요.\n${APP_URL}`;
}

/* ---------- 주간 계획 탭: 재원생 전체의 진행 중 계획 ---------- */
// { students, plans: Map(sid → plan), items: Map(planId → [item]), progress: Map(itemId → [{on_date,pct}]), sched: [학원 일정], coach: Map(sid → 코칭 일정) }
export async function loadAllPlans() {
  const [students, plans, sched] = await Promise.all([
    sb.from('students').select('id,name,grade,seat_no,status').eq('status', '재원').then(check),
    sb.from('plans').select('id,student_id,start_date,due_date,author_role,status').neq('status', '마감').then(check),
    sb.from('schedules').select('*').in('category', ['학원', '코칭']).then(check),
  ]);
  const t = today();
  const live = sched.filter((r) => r.valid_from <= addDays(t, 7) && (!r.valid_to || r.valid_to >= t));
  const ids = plans.map((p) => p.id);
  const items = ids.length ? check(await sb.from('plan_items').select('*').in('plan_id', ids)) : [];
  const prog = items.length ? check(await sb.from('plan_progress').select('item_id,on_date,pct').in('item_id', items.map((i) => i.id))) : [];
  prog.sort((a, b) => (a.on_date < b.on_date ? -1 : 1));
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };
  const planBy = new Map();
  for (const p of plans) { const cur = planBy.get(p.student_id); if (!cur || p.start_date > cur.start_date) planBy.set(p.student_id, p); }
  const itemsBy = group(items, 'plan_id');
  for (const a of itemsBy.values()) a.sort(byOrder);
  return {
    students, plans: planBy, items: itemsBy, progress: group(prog, 'item_id'),
    sched: live.filter((r) => r.category === '학원'),
    coach: new Map(live.filter((r) => r.category === '코칭').map((r) => [r.student_id, r])),
  };
}
