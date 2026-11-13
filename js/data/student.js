// 학생 앱 데이터: 이번 계획 · 진행률 · 등원 기록 · 스톱워치
import { sb } from '../sb.js';
import { mondayOf, today, isoDow } from '../date.js';

function check(res) { if (res.error) throw res.error; return res.data; }
const nowIso = () => new Date().toISOString();
const kstHour = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }));

/* ---------- 이번 계획 ---------- */
// { plan, items, progress: Map(itemId → [{on_date,pct}]) }
export async function loadOpenPlan(studentId) {
  const plan = check(await sb.from('plans').select('*').eq('student_id', studentId).neq('status', '마감').limit(1))[0] || null;
  if (!plan) return { plan: null, items: [], progress: new Map() };
  const items = check(await sb.from('plan_items').select('*').eq('plan_id', plan.id)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const rows = items.length ? check(await sb.from('plan_progress').select('item_id,on_date,pct').in('item_id', items.map((i) => i.id))) : [];
  rows.sort((a, b) => (a.on_date < b.on_date ? -1 : 1));
  const progress = new Map();
  for (const r of rows) { if (!progress.has(r.item_id)) progress.set(r.item_id, []); progress.get(r.item_id).push(r); }
  return { plan, items, progress };
}

// 오늘 진행률 (하루 1개, 다시 고르면 덮어씀)
export async function saveProgress(item, pct) {
  check(await sb.from('plan_progress').upsert({
    item_id: item.id, student_id: item.student_id, on_date: today(), pct, updated_at: nowIso(),
  }, { onConflict: 'item_id,on_date' }));
}

/* ---------- 등원 ---------- */
// 오늘 기록 (시간순) → 현재 상태: null(미등원) | 등원 | 외출 | 복귀 | 하원
export async function loadAttendance(studentId) {
  const rows = check(await sb.from('attendance').select('*').eq('student_id', studentId).eq('on_date', today()));
  rows.sort((a, b) => (a.at < b.at ? -1 : 1));
  return rows;
}
export const attState = (rows) => (rows.length ? rows[rows.length - 1].kind : null);
export const isSaturday = () => isoDow(today()) === 6;
export const AUTO_OUT_HOUR = 20;   // 토요일 20:00 자동 하원

export async function checkIn(studentId, code) {
  return check(await sb.rpc('check_in', { sid: studentId, code }));
}
export async function addAttendance(studentId, kind, reason = null, auto = false, expectBack = null) {
  const row = { student_id: studentId, on_date: today(), kind, reason, auto, at: nowIso() };
  if (expectBack) row.expect_back = expectBack;
  check(await sb.from('attendance').insert(row));
}
// 토요일 20시 이후 아직 하원 안 했으면 자동 하원
export async function autoCheckout(studentId, rows) {
  const st = attState(rows);
  if (isSaturday() && kstHour() >= AUTO_OUT_HOUR && st && st !== '하원') {
    await addAttendance(studentId, '하원', null, true);
    return true;
  }
  return false;
}

/* ---------- 스톱워치 (study_sessions) ---------- */
export async function loadSessions(studentId) {
  const rows = await settleStale(check(await sb.from('study_sessions').select('*').eq('student_id', studentId).eq('study_date', today())));
  const active = rows.find((r) => !r.ended_at) || null;
  const doneSec = rows.filter((r) => r.ended_at).reduce((a, r) => a + (r.net_seconds || 0), 0);
  return { active, doneSec };
}
export function elapsedSec(s, at = Date.now()) {
  if (!s) return 0;
  const end = s.paused_at ? new Date(s.paused_at).getTime() : at;
  return Math.max(0, Math.floor((end - new Date(s.started_at).getTime()) / 1000) - (s.pause_seconds || 0));
}
export async function startSession(studentId, subject) {
  return check(await sb.from('study_sessions').insert({
    student_id: studentId, subject, started_at: nowIso(), study_date: today(), pause_seconds: 0,
  }).select('*').single());
}
export async function pauseSession(s) {
  return check(await sb.from('study_sessions').update({ paused_at: nowIso() }).eq('id', s.id).select('*').single());
}
export async function resumeSession(s) {
  const add = Math.floor((Date.now() - new Date(s.paused_at).getTime()) / 1000);
  return check(await sb.from('study_sessions').update({ paused_at: null, pause_seconds: (s.pause_seconds || 0) + add }).eq('id', s.id).select('*').single());
}
export async function stopSession(s) {
  const net = elapsedSec(s);
  return check(await sb.from('study_sessions').update({ ended_at: nowIso(), paused_at: null, net_seconds: net }).eq('id', s.id).select('*').single());
}

/* ---------- 2시간 확인: 타이머를 안 끄고 가는 경우 ----------
   마지막 확인(checked_net)부터 순공 2시간이 되면 "계속 공부 중인가요?" → 10분 안에 응답 없으면
   마지막 확인 + 2시간까지만 기록하고 자동 종료 (auto_ended). 앱이 닫혀 있어도 다음에 누가 불러올 때 정리 */
export const CHECK_SEC = 2 * 3600, GRACE_SEC = 10 * 60;
export const sinceCheck = (s, at = Date.now()) => (s ? elapsedSec(s, at) - (s.checked_net || 0) : 0);
export const needsCheck = (s, at) => !!s && !s.ended_at && sinceCheck(s, at) >= CHECK_SEC;
export const isStale = (s, at) => !!s && !s.ended_at && sinceCheck(s, at) >= CHECK_SEC + GRACE_SEC;
export async function confirmSession(s) {
  return check(await sb.from('study_sessions').update({ checked_net: elapsedSec(s) }).eq('id', s.id).select('*').single());
}
export async function autoEnd(s) {
  const net = (s.checked_net || 0) + CHECK_SEC;
  // 종료 시각 = 시작 + 기록 순공 + 그때까지의 휴식 (일시정지 중이었다면 그 휴식은 제외)
  const end = new Date(new Date(s.started_at).getTime() + (net + (s.pause_seconds || 0)) * 1000).toISOString();
  return check(await sb.from('study_sessions').update({ ended_at: end, paused_at: null, net_seconds: net, auto_ended: true }).eq('id', s.id).select('*').single());
}
// 목록 안의 오래 방치된 세션을 정리해서 돌려줌 (실패하면 그대로)
export async function settleStale(rows, at = Date.now()) {
  return Promise.all(rows.map(async (r) => {
    if (!isStale(r, at)) return r;
    try { return await autoEnd(r); } catch { return { ...r, ended_at: new Date(at).toISOString(), net_seconds: (r.checked_net || 0) + CHECK_SEC, auto_ended: true }; }
  }));
}

/* ---------- 선생님 출결 수정 (토요일) ---------- */
export async function teacherAttendance(studentId, { kind, reason, time, back }) {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(`${today()}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`).toISOString();
  const row = { student_id: studentId, on_date: today(), kind, reason: reason || null, at };
  if (kind === '외출' && back) row.expect_back = back;
  check(await sb.from('attendance').insert(row));
}
export async function deleteAttendance(id) {
  check(await sb.from('attendance').delete().eq('id', id));
}

// 이번 주(월~오늘) 끝난 세션 순공 합계 (오늘 끝난 것 따로)
export async function loadWeekDone(studentId) {
  const t = today(), mon = mondayOf(t);
  const rows = check(await sb.from('study_sessions').select('net_seconds,study_date,ended_at').eq('student_id', studentId).gte('study_date', mon).not('ended_at', 'is', null));
  const sum = (a) => a.reduce((x, r) => x + (r.net_seconds || 0), 0);
  return { weekDone: sum(rows), todayDone: sum(rows.filter((r) => r.study_date === t)) };
}
