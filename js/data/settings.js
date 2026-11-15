// 설정: 선생님 관리 · 학년 올리기
import { sb, sbSide, teacherEmail } from '../sb.js';

const check = (r) => { if (r.error) throw r.error; return r.data; };
export const teacherId = (email) => String(email || '').replace(/^t-/, '').replace(/@.*/, '');

export async function loadTeachers() {
  return check(await sb.from('teachers').select('*').order('created_at'));
}
// 새 선생님: 로그인 계정 가입(별도 연결) → 선생님 명단 추가
export async function addTeacher({ id, name, password }) {
  const email = teacherEmail(id);
  const side = sbSide();
  const { error } = await side.auth.signUp({ email, password });
  if (error) throw new Error(/registered|exists/i.test(error.message) ? '이미 있는 아이디입니다.' : error.message);
  await side.auth.signOut().catch(() => {});
  check(await sb.from('teachers').insert({ email, name: name.trim() }));
}
// 선생님 삭제: 명단 + 로그인 계정 (SQL 16 함수)
export async function removeTeacher(email) {
  const { error } = await sb.rpc('admin_delete_teacher', { target: email });
  if (error) throw error;
}
// 이름 · 아이디 · 비밀번호 변경 (바꾸지 않을 값은 null)
export async function updateTeacher(oldEmail, { id, name, password }) {
  const { error } = await sb.rpc('admin_update_teacher', {
    old_email: oldEmail, new_email: id ? teacherEmail(id) : null, new_name: name || null, new_password: password || null,
  });
  if (error) throw new Error(error.message);
}
export async function changeMyPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

// 학년 올리기: 중1→중2 … 중3→고1, 고1→고2, 고2→고3 (고3은 그대로)
export const NEXT_GRADE = { 중1: '중2', 중2: '중3', 중3: '고1', 고1: '고2', 고2: '고3' };
// SQL 20: 한 번에 (전부 되거나 전부 안 됨) · 고3 졸업(퇴원) 선택 · 실행 기록
export async function promoteGrades(students, graduate) {
  const { data, error } = await sb.rpc('promote_grades', { graduate });
  if (!error) return data;
  if (error.code !== 'PGRST202' && !/promote_grades/.test(error.message || '')) throw error;
  await promoteAll(students);   // 함수 없으면 예전 방식
  if (graduate) { const ids = students.filter((s) => s.grade === '고3').map((s) => s.id); if (ids.length) check(await sb.from('students').update({ status: '퇴원' }).in('id', ids)); }
  check(await sb.from('app_settings').upsert({ key: 'promoted', value: { year: Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' })), at: new Date().toISOString() } }));
  return null;
}
export async function lastPromoted() {
  const r = check(await sb.from('app_settings').select('value').eq('key', 'promoted').maybeSingle());
  return r?.value || null;
}
export async function promoteAll(students) {
  const groups = {};
  for (const s of students) if (NEXT_GRADE[s.grade]) (groups[s.grade] ||= []).push(s.id);
  // 높은 학년부터 (중간 값 충돌 없음 — 학년별 id 목록으로 업데이트)
  for (const g of ['고2', '고1', '중3', '중2', '중1']) {
    if (groups[g]?.length) check(await sb.from('students').update({ grade: NEXT_GRADE[g] }).in('id', groups[g]));
  }
}

/* ---------- 학교별 학사일정 (직접 입력) ---------- */
export const EVENT_KINDS = ['방학', '시험', '휴업', '기타'];
export async function loadSchoolEvents() {
  return check(await sb.from('school_events').select('*').order('start_date'));
}
export async function addSchoolEvents(rows) {
  return check(await sb.from('school_events').insert(rows));
}
export async function deleteSchoolEvent(id) {
  return check(await sb.from('school_events').delete().eq('id', id));
}
