// 일정 · 코칭 시간 · 설정
import { sb } from '../sb.js';
import { today, addDays, mondayOf, toMin, toTime, hm, isoDow } from '../date.js';

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
  const [rows, ovs] = await Promise.all([
    // 지난 4주도 볼 수 있게 (끝난 일정 · 휴강 · 보강까지)
    sb.from('schedules').select('*').eq('student_id', studentId).or(`valid_to.is.null,valid_to.gte.${addDays(mondayOf(today()), -28)}`).order('weekday').order('start_time').then(check),
    loadOverrides([studentId], addDays(mondayOf(today()), -28)),
  ]);
  return applyOverrides(rows, ovs);
}

/* ---------- 휴강 · 보강 (SQL 29 · schedule_overrides) ---------- */
// 휴강 = action '취소' (schedule_id · 날짜) / 보강 = action '추가' (그날 하루 학원)
export async function loadOverrides(studentIds, from) {
  if (!studentIds.length) return [];
  let q = sb.from('schedule_overrides').select('*').in('student_id', studentIds).in('action', ['취소', '추가']);
  if (from) q = q.gte('on_date', from);
  const r = await q;
  return r.error ? [] : r.data || [];   // SQL 29 전이어도 시간표는 그대로
}
// 일정 목록에 휴강 표시(rows.offAt) + 보강을 그날 하루짜리 일정으로 끼워 넣기 (makeup: true)
export function applyOverrides(rows, ovs) {
  const offs = new Map();
  for (const o of ovs || []) {
    if (o.action === '취소' && o.schedule_id) offs.set(`${o.schedule_id}|${o.on_date}`, o.id);
    if (o.action === '추가' && o.start_time && o.end_time) rows.push({
      id: 'ov:' + o.id, ov_id: o.id, student_id: o.student_id, category: o.category || '학원', title: o.title || '보강',
      subject: o.subject ?? null, subject_detail: o.subject_detail ?? null, weekday: isoDow(o.on_date),
      start_time: o.start_time, end_time: o.end_time, valid_from: o.on_date, valid_to: o.on_date, term: null, makeup: true,
    });
  }
  // 각 일정에 휴강 날짜 붙이기 (목록을 걸러도 따라감)
  for (const r of rows) {
    if (r.makeup) continue;
    const ds = (ovs || []).filter((o) => o.action === '취소' && o.schedule_id === r.id).map((o) => o.on_date);
    r._off = ds.length ? new Set(ds) : null;
  }
  rows.offs = offs;
  rows.offAt = (id, d) => offs.has(`${id}|${d}`);
  return rows;
}
// 휴강: 같은 요일로 date 부터 until 까지 (그 일정이 유효한 날만)
export async function addOffs(row, date, until) {
  const out = [];
  for (let d = date; d <= until; d = addDays(d, 7)) {
    if (row.valid_from <= d && (!row.valid_to || row.valid_to >= d)) out.push({ student_id: row.student_id, schedule_id: row.id, on_date: d, action: '취소', category: row.category, title: row.title });
  }
  if (!out.length) return 0;
  // 이미 휴강인 날은 빼고 넣기 (upsert 는 부분 고유 인덱스와 안 맞아서 안 씀)
  const have = check(await sb.from('schedule_overrides').select('on_date').eq('schedule_id', row.id).eq('action', '취소').in('on_date', out.map((o) => o.on_date)));
  const fresh = out.filter((o) => !have.some((h) => h.on_date === o.on_date));
  if (fresh.length) check(await sb.from('schedule_overrides').insert(fresh));
  return out.length;
}
export async function removeOverride(id) { check(await sb.from('schedule_overrides').delete().eq('id', id)); }
export async function addMakeup({ student_id, date, title, subject = null, subject_detail = null, start, end }) {
  const row = { student_id, on_date: date, action: '추가', category: '학원', title, start_time: start, end_time: end };
  let r = await sb.from('schedule_overrides').insert({ ...row, subject, subject_detail });
  // SQL 29 전(과목 칸 없음)이어도 보강은 저장
  if (r.error && /subject/.test(r.error.message || '')) r = await sb.from('schedule_overrides').insert(row);
  check(r);
}
// 그날 하루만 있는 기타 일정 (병원 · 학교 행사 등)
export async function addOneDay({ student_id, date, title, start, end }) {
  check(await sb.from('schedule_overrides').insert({ student_id, on_date: date, action: '추가', category: '기타', title, start_time: start, end_time: end }));
}
// 하루치 일정에 휴강 · 보강 반영 (전체 현황 · 출결용): rows 는 그날 요일 일정
export async function todayWithOverrides(rows, date) {
  const ids = [...new Set(rows.map((r) => r.student_id))];
  const r = await sb.from('schedule_overrides').select('*').eq('on_date', date).in('action', ['취소', '추가']);
  if (r.error) return rows;
  const offs = new Set(r.data.filter((o) => o.action === '취소').map((o) => o.schedule_id));
  const adds = r.data.filter((o) => o.action === '추가' && o.start_time && o.end_time).map((o) => ({
    id: 'ov:' + o.id, student_id: o.student_id, category: o.category || '학원', title: o.title || '보강', weekday: isoDow(date),
    start_time: o.start_time, end_time: o.end_time, valid_from: date, valid_to: date, term: null, makeup: true,
  }));
  void ids;
  return [...rows.filter((x) => !offs.has(x.id)), ...adds];
}

// 같은 내용·같은 기간의 요일별 행을 하나로 묶어서 보여주기
export function groupSchedules(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = [r.category, r.title, r.subject ?? '', r.subject_detail ?? '', r.term ?? '', hm(r.start_time), hm(r.end_time), r.valid_from, r.valid_to].join('|');
    if (!map.has(k)) map.set(k, { ...r, ids: [], weekdays: [] });
    const g = map.get(k); g.ids.push(r.id); g.weekdays.push(r.weekday);
  }
  return [...map.values()].sort((a, b) => a.weekdays[0] - b.weekdays[0] || hm(a.start_time).localeCompare(hm(b.start_time)));
}

// period: 'always' | 'week' | 'range'
export async function addSchedule({ student_id, category, title, weekdays, start, end, period, from, to, subject = null, subject_detail = null, term = null }) {
  let valid_from = today(), valid_to = null;
  if (period === 'week') { valid_from = mondayOf(today()); valid_to = addDays(valid_from, 6); }
  if (period === 'range') { valid_from = from; valid_to = to; }
  const rows = weekdays.map((weekday) => ({
    student_id, category, title: title.trim(), weekday, start_time: start, end_time: end, valid_from, valid_to,
    ...(subject != null ? { subject } : {}), ...(subject_detail ? { subject_detail } : {}), ...(term ? { term } : {}),
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

/* ---------- 학원 일정 변경 알림 (학생이 바꾸면 바로 반영 + 선생님 확인 목록) ---------- */
export async function logScheduleRequest(student_id, action, summary) {
  check(await sb.from('schedule_requests').insert({ student_id, action, summary }));
  import('../push.js').then((m) => m.kickPush()).catch(() => {});   // 선생님 폰 알림 바로 (SQL 31)
}
export async function loadOpenRequests() {
  return check(await sb.from('schedule_requests').select('*').is('checked_at', null).order('created_at'));
}
export async function checkRequests(ids, by) {
  check(await sb.from('schedule_requests').update({ checked_at: new Date().toISOString(), checked_by: by }).in('id', ids));
}

/* ---------- 교시 시간표 (전자칠판) — 기존 앱과 같은 표, 설정 탭에서 수정 ---------- */
export const DEFAULT_PERIODS = [
  ['1교시', '08:00', '08:50'], ['2교시', '09:00', '09:50'], ['3교시', '10:00', '11:00'], ['4교시', '11:10', '12:00'],
  ['점심시간', '12:00', '13:00'], ['5교시', '13:00', '14:00'], ['6교시', '14:10', '15:20'], ['7교시', '15:30', '16:40'],
  ['8교시', '16:50', '18:00'], ['저녁시간', '18:00', '19:00'], ['9교시', '19:00', '19:50'], ['10교시', '20:00', '21:00'],
  ['11교시', '21:10', '22:00'], ['12교시', '22:10', '23:00'],
].map(([label, start, end]) => ({ label, start, end }));
export async function getPeriods() {
  const r = check(await sb.from('app_settings').select('value').eq('key', 'periods').maybeSingle());
  return Array.isArray(r?.value) && r.value.length ? r.value : DEFAULT_PERIODS;
}
export async function savePeriods(list) {
  check(await sb.from('app_settings').upsert({ key: 'periods', value: list }));
}

/* ---------- 학기 / 방학 ---------- */
// 일정 적용 시기(term): null = 항상 / '학기' / '방학'. 학생 학교의 방학 일정(설정 탭 학사일정)으로 그날이 방학인지 판단
let evCache = null;
export function loadVacations(force = false) {
  // 방학 + '방학 중 등교일'(겨울·봄방학을 하나로 이었을 때 사이 등교일 — 시간표에 '학교'만 작게)
  if (!evCache || force) evCache = sb.from('school_events').select('school,kind,title,start_date,end_date')
    .in('kind', ['방학', '기타']).then(check).then((r) => r.filter((e) => e.kind === '방학' || e.title === SCHOOL_DAY)).catch(() => []);
  return evCache;
}
export const SCHOOL_DAY = '방학 중 등교일';
export const isVacation = (school, date, evs) => !!school && (evs || []).some((e) => e.kind === '방학' && e.school === school && e.start_date <= date && e.end_date >= date);
// 방학으로 묶였지만 실제로는 학교 가는 날 (주중만)
export const isSchoolDay = (school, date, evs) => !!school && isoDow(date) <= 5
  && (evs || []).some((e) => e.title === SCHOOL_DAY && e.school === school && e.start_date <= date && e.end_date >= date);
// 그날의 시기 판정 함수: date → '방학' | '학기'
export const termFn = (school, evs) => (date) => (isVacation(school, date, evs) ? '방학' : '학기');
export const termOk = (r, term) => !r.term || r.term === term;
// 일정 목록에 시기 판정 붙이기 (시간표 · 학원 숙제 날짜 계산에서 사용)
export function withTerm(rows, school, evs) { rows.termAt = termFn(school, evs); rows.schoolAt = (d) => isSchoolDay(school, d, evs); return rows; }
