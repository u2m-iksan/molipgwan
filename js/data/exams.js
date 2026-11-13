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
// 기본 시험은 1·2학기 중간·기말 4개. 그 밖의 시험은 선생님이 이름을 지어 추가 (이름에 '모의'가 있으면 모의고사형)
export const BASIC = NAESIN;
export const isMock = (t) => MOCK.includes(t) || /모의/.test(t || '');
// 학년도 안의 순서: 기본/알려진 시험은 정해진 시기, 직접 추가한 시험은 시험일(없으면 입력일) 기준 (3월 = 1 … 2월 = 12)
const KNOWN_AT = { '3월 모의': 1.0, '1학기 중간': 2.3, '6월 모의': 4.0, '1학기 기말': 4.8, '9월 모의': 7.0, '2학기 중간': 8.0, '10월 모의': 8.5, '2학기 기말': 10.0 };
const at = (e) => {
  if (KNOWN_AT[e.exam_type] != null) return KNOWN_AT[e.exam_type];
  const d = e.taken_on || (e.created_at || '').slice(0, 10);
  if (!d) return 11.5;
  const m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  return ((m + 9) % 12) + 1 + day / 31 - 1;   // 3월 → 1.x, 2월 → 12.x
};
export const examOrder = (a, b) => (a.school_year - b.school_year) || (at(a) - at(b)) || String(a.exam_type).localeCompare(String(b.exam_type), 'ko');

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
  if (m <= 5) return '1학기 중간';
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

// 전체 학생 성적 (성적 탭 학생 카드용) → Map(student_id → 시험[])
export async function loadAllExams() {
  const [exams, scores] = await Promise.all([
    sb.from('exams').select('*').then(check),
    sb.from('exam_scores').select('*').then(check),
  ]);
  const byExam = new Map();
  scores.forEach((s) => { if (!byExam.has(s.exam_id)) byExam.set(s.exam_id, []); byExam.get(s.exam_id).push(s); });
  const out = new Map();
  exams.forEach((e) => {
    if (!out.has(e.student_id)) out.set(e.student_id, []);
    out.get(e.student_id).push({ ...e, scores: byExam.get(e.id) || [] });
  });
  out.forEach((l) => l.sort(examOrder));
  return out;
}

export async function loadStudentSubjects(sid) {
  return check(await sb.from('student_subjects').select('subject,subject_detail,sort_order').eq('student_id', sid).order('sort_order'));
}

// 저장: 시험(학생·학년도·시험) 1건 + 과목 성적 전체 교체
export async function saveExam({ id, student_id, school_year, grade, exam_type, feedback, scores, taken_on }) {
  let examId = id;
  const row = { student_id, school_year, grade, exam_type, feedback: feedback || null };
  if (taken_on !== undefined) row.taken_on = taken_on || null;
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

/* ---------- 최근 시험 요약: 변화(직전 같은 종류 시험 대비) · 잘 본 과목 · 보완할 과목 ---------- */
const ACH = ['A', 'B', 'C', 'D', 'E'];
export const scoreName = (s) => `${s.subject}${s.subject_detail ? ` ${s.subject_detail}` : ''}`;

// 비교용 점수(클수록 좋음) + 표시 글자
function metric(s, type) {
  if (isMock(type)) {
    if (s.percentile != null) return { v: Number(s.percentile), tie: Number(s.raw_score ?? 0), text: `백분위 ${s.percentile}`, unit: 'p' };
  } else if (s.grade_level != null) return { v: -Number(s.grade_level), tie: Number(s.raw_score ?? 0), text: `${s.grade_level}등급`, unit: '등급' };
  else if (s.achievement) return { v: -ACH.indexOf(s.achievement), tie: Number(s.raw_score ?? 0), text: `성취도 ${s.achievement}`, unit: 'ach' };
  if (s.raw_score != null) return { v: Number(s.raw_score), tie: 0, text: `${s.raw_score}점`, unit: '점' };
  return null;
}

export function summarize(exams) {
  const list = [...exams].filter((e) => e.scores?.length).sort(examOrder);
  const latest = list[list.length - 1];
  if (!latest) return null;
  const prev = [...list].reverse().find((e) => e !== latest && isMock(e.exam_type) === isMock(latest.exam_type)) || null;
  const cur = latest.scores.map((s) => ({ s, m: metric(s, latest.exam_type) })).filter((x) => x.m);

  // 변화: 같은 과목끼리 비교
  const changes = [];
  if (prev) {
    for (const { s, m } of cur) {
      const p = prev.scores.find((q) => scoreName(q) === scoreName(s));
      const pm = p && metric(p, prev.exam_type);
      if (!pm || pm.unit !== m.unit) continue;
      const raw = s.raw_score != null && p.raw_score != null ? s.raw_score - p.raw_score : null;
      // 등급(백분위)이 같으면 원점수로 비교해서 보여줌
      const same = m.v === pm.v && raw != null && pm.unit !== '점';
      changes.push({ name: scoreName(s), from: same ? `${p.raw_score}점` : pm.text, to: same ? `${s.raw_score}점` : m.text, d: m.v - pm.v, raw });
    }
  }
  const sum = changes.reduce((a, c) => a + Math.sign(c.d || c.raw || 0), 0);
  const dir = !changes.length ? null : sum > 0 ? 'up' : sum < 0 ? 'down' : 'same';

  // 잘 본 / 보완할 과목 (과목 2개 이상일 때)
  const sorted = [...cur].sort((a, b) => (b.m.v - a.m.v) || (b.m.tie - a.m.tie));
  const pick = (x) => ({ name: scoreName(x.s), text: x.m.text, raw: x.s.raw_score });
  const best = sorted.length >= 2 ? sorted.filter((x) => x.m.v === sorted[0].m.v).slice(0, 2).map(pick) : [];
  const last = sorted[sorted.length - 1];
  const weak = sorted.length >= 2 && last.m.v !== sorted[0].m.v ? sorted.filter((x) => x.m.v === last.m.v).slice(-2).map(pick) : [];
  return { latest, prev, dir, changes, best, weak };
}

// 과목 하나의 직전 같은 종류 시험 대비 변화 (자세히 보기용) → { from, to, k: up|down|same } | null
export function prevOf(exams, exam) {
  const list = [...exams].filter((e) => e.scores?.length).sort(examOrder);
  const i = list.findIndex((e) => e.id === exam.id);
  return list.slice(0, Math.max(0, i)).reverse().find((e) => isMock(e.exam_type) === isMock(exam.exam_type)) || null;
}
export function subjectChange(s, type, prev) {
  if (!prev) return null;
  const p = prev.scores.find((q) => scoreName(q) === scoreName(s));
  const m = metric(s, type), pm = p && metric(p, prev.exam_type);
  if (!m || !pm || m.unit !== pm.unit) return null;
  const raw = s.raw_score != null && p.raw_score != null ? s.raw_score - p.raw_score : null;
  const d = m.v - pm.v;
  const k = d > 0 || (d === 0 && raw > 0) ? 'up' : d < 0 || (d === 0 && raw < 0) ? 'down' : 'same';
  const same = d === 0 && raw != null && pm.unit !== '점';
  return { from: same ? `${p.raw_score}점` : pm.text, to: same ? `${s.raw_score}점` : m.text, k };
}

// 그 학년도에 쓰인 시험 이름 (기본 4개 + 누군가 추가한 시험) — 순서대로
export function examNames(allMap, year) {
  const seen = new Map();
  BASIC.forEach((t) => seen.set(t, { school_year: year, exam_type: t }));
  for (const list of allMap.values()) for (const e of list) if (e.school_year === year && !seen.has(e.exam_type)) seen.set(e.exam_type, e);
  return [...seen.values()].sort(examOrder).map((e) => e.exam_type);
}
