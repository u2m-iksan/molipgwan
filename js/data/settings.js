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
export async function removeTeacher(email) {
  check(await sb.from('teachers').delete().eq('email', email));
}
export async function changeMyPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

// 학년 올리기: 중1→중2 … 중3→고1, 고1→고2, 고2→고3 (고3은 그대로)
export const NEXT_GRADE = { 중1: '중2', 중2: '중3', 중3: '고1', 고1: '고2', 고2: '고3' };
export async function promoteAll(students) {
  const groups = {};
  for (const s of students) if (NEXT_GRADE[s.grade]) (groups[s.grade] ||= []).push(s.id);
  // 높은 학년부터 (중간 값 충돌 없음 — 학년별 id 목록으로 업데이트)
  for (const g of ['고2', '고1', '중3', '중2', '중1']) {
    if (groups[g]?.length) check(await sb.from('students').update({ grade: NEXT_GRADE[g] }).in('id', groups[g]));
  }
}
