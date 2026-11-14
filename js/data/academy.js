// 학원 과목 숙제형 이행률
//  학원 과목 = 학원 일정 등록 때 고른 과목 (과학·사회는 세부 과목까지)
//  학원 숙제 항목(plan_items.academy) = 계획 기간 안의 학원 가는 날마다 숙제 해갔는지 O / △ / X 체크
//  이행률 = (O 1회 + △ 0.5회) / 지금까지 학원 간 횟수 (체크는 plan_progress에 pct 100 / 50 / 0 으로 저장)
import { addDays, isoDow, today, DOW } from '../date.js';

// 과학·사회 세부 과목(선택): 지정하면 세부 과목까지 맞아야 연결 (예: 과학 화학 학원 ↔ 과학 화학Ⅰ 계획만)
export const ACADEMY_DETAILS = {
  과학: ['통합과학', '물리학', '화학', '생명과학', '지구과학'],
  사회: ['통합사회', '한국지리', '세계지리', '생활과윤리', '윤리와사상', '사회문화', '정치와법', '경제', '세계사', '동아시아사'],
};
const norm = (x) => String(x || '').replace(/\s/g, '').replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/생물/g, '생명과학').replace(/물리(?!학)/g, '물리학').replace(/[·&]/g, '').toLowerCase();
const detailMatch = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

// 일정의 과목: 학원 일정 등록 때 고른 과목 (안 골랐으면 연결 안 함)
export const subjectOf = (r) => r.subject || null;
export const subjectLabel = (r) => (r.subject ? `${r.subject}${r.subject_detail ? ' ' + r.subject_detail : ''}` : '');

// 계획 항목 ↔ 학원 일정 연결
export function matches(item, r) {
  if (r.category !== '학원' || !r.subject || r.subject !== item.subject) return false;
  if (r.subject_detail) return detailMatch(r.subject_detail, item.subject_detail);   // 세부 과목 없이 등록한 학원 = 그 과목 전체
  return true;
}
export const hasAcademy = (item, rows) => (rows || []).some((r) => matches(item, r));

// 계획 기간 [start, end) 안에서 그 과목 학원 가는 날
export function academyDates(item, start, end, rows) {
  const last = end || addDays(start, 7);
  const ac = rows.filter((r) => matches(item, r));
  const out = [];
  for (let d = start; d < last; d = addDays(d, 1)) {
    if (ac.some((r) => r.weekday === isoDow(d) && r.valid_from <= d && (!r.valid_to || r.valid_to >= d) && (!r.term || !rows.termAt || r.term === rows.termAt(d)))) out.push(d);
  }
  return out;
}

// 체크 값: 'o'(해감 100) · 'h'(반만 50) · 'x'(안 해감 0)
export const acOf = (pct) => (pct >= 100 ? 'o' : pct >= 50 ? 'h' : 'x');
export const AC_MARK = { o: 'O', h: '△', x: 'X' };
export const AC_CLS = { o: 'ok', h: 'half', x: 'no' };
export const AC_PCT = { o: 100, h: 50, x: 0 };
// { dates, checks: Map(date → 'o'|'h'|'x'), done(△는 0.5), total(오늘까지), rate }
export function academyStat(item, plan, rows, hist, upto = today()) {
  const dates = academyDates(item, plan.start_date, plan.due_date, rows);
  const checks = new Map((hist || []).map((h) => [h.on_date, acOf(h.pct)]));
  // 학원 날이 아닌 날짜에 남은 체크도 함께 (일정이 바뀐 경우)
  for (const d of checks.keys()) if (!dates.includes(d)) dates.push(d);
  dates.sort();
  const past = dates.filter((d) => d <= upto);
  const done = past.reduce((a, d) => a + ({ o: 1, h: 0.5 }[checks.get(d)] || 0), 0);
  return { dates, checks, done, total: past.length, rate: past.length ? Math.round((done / past.length) * 100) : null };
}

export const dayLabel = (d) => `${DOW[isoDow(d)]} ${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
