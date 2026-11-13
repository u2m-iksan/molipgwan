// 전체 현황(상황판) 데이터 + 색 판정
//  "일" = 일요일 제외. 최근 2일 = 오늘을 빼고 거슬러 올라간 일요일 아닌 2일
//  빨강: 진행 중 계획 없음(또는 기간 지남) / 스톱워치 2일 미사용 / 진행률 2일 미입력
//  주황: 계획은 있으나 최근 2일 순공 합계 2시간 미만
//  초록: 그 외
import { sb } from '../sb.js';
import { today, addDays, isoDow } from '../date.js';
import { settleStale } from './student.js';
import { satAlert } from './att-rules.js';

const check = (r) => { if (r.error) throw r.error; return r.data || []; };
export const ORANGE_SEC = 2 * 3600;

export function lastDays(n = 2, from = today()) {
  const out = []; let d = from;
  while (out.length < n) { d = addDays(d, -1); if (isoDow(d) !== 7) out.push(d); }
  return out;   // 최근 날짜부터
}

export async function loadOverview() {
  const t = today(), win = lastDays(2), from = win[win.length - 1];
  const [students, plans, sessions, att] = await Promise.all([
    sb.from('students').select('id,name,grade,seat_no,status,sat_arrive').eq('status', '재원').then(check),
    sb.from('plans').select('id,student_id,start_date,due_date,status').neq('status', '마감').then(check),
    sb.from('study_sessions').select('id,student_id,subject,started_at,ended_at,paused_at,pause_seconds,net_seconds,checked_net,study_date').gte('study_date', from).then(check),
    sb.from('attendance').select('*').eq('on_date', t).order('at').then(check).catch(() => []),
  ]);
  const sched = isoDow(t) === 6 ? await sb.from('schedules').select('student_id,category,title,weekday,start_time,end_time,valid_from,valid_to')
    .eq('weekday', 6).then(check).then((r) => r.filter((x) => x.valid_from <= t && (!x.valid_to || x.valid_to >= t))).catch(() => []) : [];
  const sessions2 = await settleStale(sessions);   // 2시간 무응답 세션 정리
  sessions.splice(0, sessions.length, ...sessions2);
  const items = plans.length ? check(await sb.from('plan_items').select('id,plan_id').in('plan_id', plans.map((p) => p.id))) : [];
  const prog = items.length ? check(await sb.from('plan_progress').select('item_id,on_date').in('item_id', items.map((i) => i.id)).gte('on_date', from)) : [];
  return { students, plans, items, prog, sessions, att, win, t, sched };
}

const elapsed = (s, at) => {
  const end = s.paused_at ? new Date(s.paused_at).getTime() : at;
  return Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000) - (s.pause_seconds || 0));
};

// 학생별 상태: { color, reasons[], todaySec, active, att }
export function judge(d, at = Date.now()) {
  const planBy = new Map(d.plans.map((p) => [p.student_id, p]));
  const itemPlan = new Map(d.items.map((i) => [i.id, i.plan_id]));
  return d.students.map((s) => {
    const plan = planBy.get(s.id) || null;
    const ses = d.sessions.filter((x) => x.student_id === s.id);
    const winSes = ses.filter((x) => d.win.includes(x.study_date));
    const winSec = winSes.reduce((a, x) => a + (x.net_seconds || 0), 0);
    const todaySes = ses.filter((x) => x.study_date === d.t);
    const active = todaySes.find((x) => !x.ended_at) || null;
    const todaySec = todaySes.filter((x) => x.ended_at).reduce((a, x) => a + (x.net_seconds || 0), 0) + (active ? elapsed(active, at) : 0);
    const rows = d.att.filter((a) => a.student_id === s.id);
    const att = rows.length ? rows[rows.length - 1] : null;
    const n = new Date(new Date(at).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const alert = isoDow(d.t) === 6 ? satAlert(s, rows, d.sched, n.getHours() * 60 + n.getMinutes()) : null;

    const reasons = [];
    let color = 'green';
    if (!plan) reasons.push('계획 없음');
    else if (plan.due_date && plan.due_date < d.t) reasons.push('계획 기간 지남');
    if (!winSes.length && !active) reasons.push(`스톱워치 ${d.win.length}일 미사용`);
    if (plan) {
      // 진행률은 계획 시작 이후 날짜만 따짐
      const days = d.win.filter((x) => x >= plan.start_date);
      if (days.length) {
        const has = d.prog.some((p) => itemPlan.get(p.item_id) === plan.id && days.includes(p.on_date));
        if (!has) reasons.push(`진행률 ${days.length}일 미입력`);
      }
    }
    if (reasons.length) color = 'red';
    else if (plan && winSec < ORANGE_SEC) { color = 'orange'; reasons.push('최근 2일 순공 2시간 미만'); }
    return { ...s, color, reasons, winSec, todaySec, active, att, attRows: rows, alert, plan };
  });
}
