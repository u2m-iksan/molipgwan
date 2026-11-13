// 학원 과목 숙제형 이행률
//  학원 과목 = 학원 일정의 과목 (일정에 과목을 지정하지 않았으면 이름으로 추정: "수학학원" → 수학, 수정 가능)
//  학원 숙제 항목(plan_items.academy) = 계획 기간 안의 학원 가는 날마다 숙제 해갔는지(✓/✗) 체크
//  이행률 = 해간 횟수 / 지금까지 학원 간 횟수 (체크는 plan_progress에 pct 100 / 0 으로 저장)
import { addDays, isoDow, today, DOW } from '../date.js';

const ALIAS = [
  ['한국사', ['한국사']],
  ['국어', ['국어', '언어', '문학', '독서', '화작', '언매']],
  ['수학', ['수학', '매쓰', 'math', '미적', '확통']],
  ['영어', ['영어', 'english', 'eng']],
  ['과학', ['과학', '물리', '화학', '생명', '생물', '지구']],
  ['사회', ['사회', '역사', '지리', '윤리', '경제', '정치']],
];
export function guessSubject(title) {
  const t = String(title || '').toLowerCase();
  for (const [s, keys] of ALIAS) if (keys.some((k) => t.includes(k))) return s;
  return null;
}
// 일정의 과목: subject 지정('' = 과목 없음) > 이름 추정
export const subjectOf = (r) => (r.subject != null ? (r.subject || null) : guessSubject(r.title));

export function academySubjects(rows) {
  return new Set(rows.filter((r) => r.category === '학원').map(subjectOf).filter(Boolean));
}

// 계획 기간 [start, end) 안에서 그 과목 학원 가는 날
export function academyDates(subject, start, end, rows) {
  const last = end || addDays(start, 7);
  const ac = rows.filter((r) => r.category === '학원' && subjectOf(r) === subject);
  const out = [];
  for (let d = start; d < last; d = addDays(d, 1)) {
    if (ac.some((r) => r.weekday === isoDow(d) && r.valid_from <= d && (!r.valid_to || r.valid_to >= d))) out.push(d);
  }
  return out;
}

// { dates, checks: Map(date → true/false), done, total(오늘까지), rate }
export function academyStat(item, plan, rows, hist, upto = today()) {
  const dates = academyDates(item.subject, plan.start_date, plan.due_date, rows);
  const checks = new Map((hist || []).map((h) => [h.on_date, h.pct >= 100]));
  // 학원 날이 아닌 날짜에 남은 체크도 함께 (일정이 바뀐 경우)
  for (const d of checks.keys()) if (!dates.includes(d)) dates.push(d);
  dates.sort();
  const past = dates.filter((d) => d <= upto);
  const done = past.filter((d) => checks.get(d) === true).length;
  return { dates, checks, done, total: past.length, rate: past.length ? Math.round((done / past.length) * 100) : null };
}

export const dayLabel = (d) => `${DOW[isoDow(d)]} ${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
