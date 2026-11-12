// 일정 · 코칭 시간 · 설정
import { sb } from '../sb.js';
import { today, addDays, mondayOf, toMin, toTime, hm } from '../date.js';

function check(res) { if (res.error) throw res.error; return res.data; }

/* ---------- 코칭 설정 ---------- */
export const COACH_DEFAULT = { days: [1, 4], start: '19:00', end: '23:00', minutes: 30 };

export async function getCoachConfig() {
  const row = check(await sb.from('app_settings').select('value').eq('key', 'coaching').maybeSingle());
  return { ...COACH_DEFAULT, ...(row?.value || {}) };
}
export async function saveCoachConfig(cfg) {
  check(await sb.from('app_settings').upsert({ key: 'coaching', value: cfg, updated_at: new Date().toISOString() }));
}
// 설정으로 만들어지는 시작 시각 목록: ['19:00','19:30',…]
export function slotTimes(cfg) {
  const out = [];
  for (let m = toMin(cfg.start); m + cfg.minutes <= toMin(cfg.end); m += cfg.minutes) out.push(toTime(m));
  return out;
}

/* ---------- 기간 ---------- */
// 오늘 기준으로 아직 유효한 일정만
const activeFilter = (q) => q.or(`valid_to.is.null,valid_to.gte.${today()}`);

export function periodLabel(row) {
  if (!row.valid_to) return row.valid_from > today() ? `${row.valid_from.slice(5).replace('-', '/')}부터` : '계속';
  const from = row.valid_from.slice(5).replace('-', '/'), to = row.valid_to.slice(5).replace('-', '/');
  if (row.valid_from === mondayOf(row.valid_from) && row.valid_to === addDays(row.valid_from, 6)) {
    return row.valid_from === mondayOf(today()) ? '이번 주만' : `${from} 주만`;
  }
  return `${from}~${to}`;
}

/* ---------- 학생 일정 ---------- */
export async function loadStudentSchedules(studentId) {
  return check(await activeFilter(sb.from('schedules').select('*').eq('student_id', studentId))
    .order('weekday').order('start_time'));
}

// 같은 내용·같은 기간의 요일별 행을 하나로 묶어서 보여주기
export function groupSchedules(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = [r.category, r.title, hm(r.start_time), hm(r.end_time), r.valid_from, r.valid_to].join('|');
    if (!map.has(k)) map.set(k, { ...r, ids: [], weekdays: [] });
    const g = map.get(k); g.ids.push(r.id); g.weekdays.push(r.weekday);
  }
  return [...map.values()].sort((a, b) => a.weekdays[0] - b.weekdays[0] || hm(a.start_time).localeCompare(hm(b.start_time)));
}

// period: 'always' | 'week' | 'range'
export async function addSchedule({ student_id, category, title, weekdays, start, end, period, from, to }) {
  let valid_from = today(), valid_to = null;
  if (period === 'week') { valid_from = mondayOf(today()); valid_to = addDays(valid_from, 6); }
  if (period === 'range') { valid_from = from; valid_to = to; }
  const rows = weekdays.map((weekday) => ({
    student_id, category, title: title.trim(), weekday, start_time: start, end_time: end, valid_from, valid_to,
  }));
  check(await sb.from('schedules').insert(rows));
}

// 일정 끝내기: 오늘 이전에 시작한 건 어제까지로 닫아서 기록 보존, 아직 시작 안 한 건 삭제
export async function endSchedule(group) {
  const t = today();
  if (group.valid_from >= t) check(await sb.from('schedules').delete().in('id', group.ids));
  else check(await sb.from('schedules').update({ valid_to: addDays(t, -1) }).in('id', group.ids));
}

/* ---------- 코칭 시간 ---------- */
// 모든 학생의 현재 코칭 배정: Map(studentId → {id, weekday, start_time, end_time, valid_from})
export async function loadCoachingSlots() {
  const rows = check(await activeFilter(sb.from('schedules').select('*').eq('category', '코칭')).lte('valid_from', today()));
  const map = new Map();
  for (const r of rows) {
    const prev = map.get(r.student_id);
    if (!prev || r.valid_from > prev.valid_from) map.set(r.student_id, r);
  }
  return map;
}

// 학생들의 학교·학원 일정 (코칭 시간과 겹침 확인용)
export async function loadAllFixedSchedules() {
  return check(await activeFilter(sb.from('schedules').select('student_id,weekday,start_time,end_time,title,category,valid_from'))
    .neq('category', '코칭').lte('valid_from', today()));
}

// 코칭 타임 배정·변경·해제 (적용일부터). slot = {weekday, start} 또는 null(해제)
export async function setCoachingSlot(studentId, slot, cfg) {
  const t = today();
  const current = check(await activeFilter(sb.from('schedules').select('id,valid_from')
    .eq('student_id', studentId).eq('category', '코칭')));
  const future = current.filter((r) => r.valid_from >= t).map((r) => r.id);
  const past = current.filter((r) => r.valid_from < t).map((r) => r.id);
  if (future.length) check(await sb.from('schedules').delete().in('id', future));
  if (past.length) check(await sb.from('schedules').update({ valid_to: addDays(t, -1) }).in('id', past));
  if (slot) {
    check(await sb.from('schedules').insert({
      student_id: studentId, category: '코칭', title: '대면 코칭', weekday: slot.weekday,
      start_time: slot.start, end_time: toTime(toMin(slot.start) + cfg.minutes), valid_from: t, valid_to: null,
    }));
  }
}
