// 학생 앱 데이터: 이번 계획 · 진행률 · 등원 기록 · 스톱워치
import { sb } from '../sb.js';
import { today, isoDow } from '../date.js';

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
export async function addAttendance(studentId, kind, reason = null, auto = false) {
  check(await sb.from('attendance').insert({ student_id: studentId, on_date: today(), kind, reason, auto, at: nowIso() }));
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
  const rows = check(await sb.from('study_sessions').select('*').eq('student_id', studentId).eq('study_date', today()));
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

// 학기 / 방학 구분 — 추후 설정(방학 기간)으로 판단. 지금은 항상 학기 중
export function isVacation(_date) { return false; }
