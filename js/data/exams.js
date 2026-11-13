// 성적 데이터 (선생님 입력)
//  내신: 원점수 + 등급(고등, 5등급제/9등급제) 또는 성취도 A~E(중등)
//  모의: 원점수 + 백분위
//  시험 총평 = exams.feedback, 과목 메모 = exam_scores.note
import { sb } from '../sb.js';
import { today } from '../date.js';

// 학사 순서 (3월 모의 → 1학기 중간 → 6월 모의 → 1학기 기말 → 9월 모의 → 2학기 중간 → 10월 모의 → 2학기 기말)
export const EXAM_TYPES = ['3월 모의', '1학기 중간', '6월 모의', '1학기 기말', '9월 모의', '2학기 중간', '10월 모의', '2학기 기말'];
export const NAESIN = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'];
export const MOCK = ['3월 모의', '6월 모의', '9월 모의', '10월 모의'];
export const isMock = (t) => MOCK.includes(t);
export const examOrder = (a, b) => (a.school_year - b.school_year) || (EXAM_TYPES.indexOf(a.exam_type) - EXAM_TYPES.indexOf(b.exam_type));

const check = (r) => { if (r.error) throw r.error; return r.data || []; };

// 학년도 (3월 시작): 1~2월은 전년도
export function schoolYear(d = today()) {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  return m <= 2 ? y - 1 : y;
}

// 지금 시기에 가장 최근 시험 (기본 선택값)
export function recentExam(d = today()) {
  const m = Number(d.slice(5, 7));
  if (m <= 2 || m === 12) return '2학기 기말';
  if (m <= 4) return '3월 모의';
  if (m === 5) return '1학기 중간';
  if (m <= 8) return '1학기 기말';
  return '2학기 중간';
}

// 평가 방식: 중등 → 성취도 / 고등 → 5등급(2025년 고1 입학부터) 또는 9등급 / 모의 → 백분위
export function scaleOf(grade, year, type) {
  if (isMock(type)) return { kind: 'pct', label: '백분위' };
  if (grade.startsWith('중')) return { kind: 'ach', label: '성취도' };
  const entry = year - (Number(grade.slice(1)) - 1);
  return { kind: 'grade', label: '등급', max: entry >= 2025 ? 5 : 9 };
}

// 한 시험의 전체 학생 성적
export async function loadExamRound(year, type) {
  const exams = check(await sb.from('exams').select('*').eq('school_year', year).eq('exam_type', type));
  const scores = exams.length ? check(await sb.from('exam_scores').select('*').in('exam_id', exams.map((e) => e.id))) : [];
  return exams.map((e) => ({ ...e, scores: scores.filter((s) => s.exam_id === e.id) }));
}

// 한 학생의 전체 성적
export async function loadStudentExams(sid) {
  const exams = check(await sb.from('exams').select('*').eq('student_id', sid));
  const scores = exams.length ? check(await sb.from('exam_scores').select('*').in('exam_id', exams.map((e) => e.id))) : [];
  return exams.map((e) => ({ ...e, scores: scores.filter((s) => s.exam_id === e.id) })).sort(examOrder);
}

export async function loadStudentSubjects(sid) {
  return check(await sb.from('student_subjects').select('subject,subject_detail,sort_order').eq('student_id', sid).order('sort_order'));
}

// 저장: 시험(학생·학년도·시험) 1건 + 과목 성적 전체 교체
export async function saveExam({ id, student_id, school_year, grade, exam_type, feedback, scores }) {
  let examId = id;
  const row = { student_id, school_year, grade, exam_type, feedback: feedback || null };
  if (examId) check(await sb.from('exams').update(row).eq('id', examId));
  else examId = check(await sb.from('exams').insert(row).select('id').single()).id;
  check(await sb.from('exam_scores').delete().eq('exam_id', examId));
  const rows = scores.map((s) => ({
    exam_id: examId, subject: s.subject, subject_detail: s.subject_detail || null,
    raw_score: s.raw_score ?? null, grade_level: s.grade_level ?? null, achievement: s.achievement || null,
    percentile: s.percentile ?? null, note: s.note || null,
  }));
  if (rows.length) check(await sb.from('exam_scores').insert(rows));
  return examId;
}

export async function deleteExam(id) {
  check(await sb.from('exams').delete().eq('id', id));
}
