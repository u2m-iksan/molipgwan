// 토요일 출결 판정 (기존 앱 방식)
//  등원 예정 = 학생 기준 시각(sat_arrive, 없으면 08:00). 그 시각에 일정이 걸쳐 있으면 끝 + 이동 시간 (연달아 있으면 이어서)
//   이동 시간: 학교 끝 + 60분, 학원·기타 끝 + 20분
//  일정 중이거나 일정 끝나고 이동 시간 안이면 '미등원'으로 안 띄움 → 출결 칸에 '외출 · 학원명'
//  알림: 미등원 N분 / 외출 미복귀 N분 초과 / 지각 등원 N분
import { toMin, toTime, hm } from '../date.js';

export const SAT_BASE = '08:00';
export const MOVE_MIN = 20;

export const SCHOOL_MOVE_MIN = 60;
const CATS = ['학원', '학교', '기타'];
const graceOf = (r) => (r.category === '학교' ? SCHOOL_MOVE_MIN : MOVE_MIN);
const blocksOf = (student, todaySched) => todaySched.filter((r) => r.student_id === student.id && CATS.includes(r.category))
  .map((r) => ({ r, s: toMin(r.start_time), e: toMin(r.end_time), g: graceOf(r) })).sort((a, b) => a.s - b.s);
export const blockName = (r) => (r.category === '학교' ? '학교' : r.title || r.category);

export function expectedArrival(student, todaySched) {
  let t = toMin(student.sat_arrive ? hm(student.sat_arrive) : SAT_BASE);
  for (const b of blocksOf(student, todaySched)) if (b.s <= t && b.e + b.g > t) t = Math.max(t, b.e + b.g);
  return t;
}
// 지금 들어 있는 일정(학원·학교·기타) — 끝난 뒤 이동 시간(학교 60분 · 학원 20분)까지 포함
//  → { r, name, end, moving } | null
export function nowBlock(student, todaySched, nowMin) {
  const hit = blocksOf(student, todaySched).filter((b) => b.s <= nowMin && nowMin < b.e + b.g).pop();
  return hit ? { r: hit.r, name: blockName(hit.r), end: hit.e, moving: nowMin >= hit.e } : null;
}

const mm = (n) => (n >= 60 ? `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}` : `${n}분`);
const firstAt = (rows, kind) => rows.find((r) => r.kind === kind);
const minOf = (iso) => { const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); return d.getHours() * 60 + d.getMinutes(); };

// rows: 그 학생의 오늘 출결 (시간순) → { kind: 'late'|'expect'|'lateIn'|null, text }
export function satAlert(student, rows, todaySched, nowMin) {
  const exp = expectedArrival(student, todaySched);
  const last = rows[rows.length - 1];
  if (!rows.length) {
    const nb = nowBlock(student, todaySched, nowMin);
    if (nb) return { kind: 'sched', text: nb.moving ? `${nb.name} 끝 · 이동 중` : `${nb.name} ~${toTime(nb.end)}`, exp };
    if (nowMin >= exp) return { kind: 'late', text: `미등원 ${mm(nowMin - exp)}`, exp };
    return { kind: 'expect', text: `${toTime(exp)} 등원 예정`, exp };
  }
  if (last.kind === '외출' && last.expect_back) {
    const back = toMin(hm(last.expect_back));
    if (nowMin > back) return { kind: 'late', text: `미복귀 ${mm(nowMin - back)} 초과`, exp };
    return { kind: 'expect', text: `${hm(last.expect_back)} 복귀 예정`, exp };
  }
  const inRow = firstAt(rows, '등원');
  if (inRow) { const late = minOf(inRow.at) - exp; if (late > 0) return { kind: 'lateIn', text: `지각 등원 ${mm(late)}`, exp }; }
  return { kind: null, text: '', exp };
}

// 토요일 외출 정보 (선생님·학부모 공용): 어디(학원명 · 식사 · 기타) + 복귀 예정 시각
//  att = 마지막 출결 기록. 기록이 없고 일정 중이면 일정 기준(끝 + 이동 시간), 외출 기록이면 학생이 고른 사유·복귀 예정
//  → { name, back: 'HH:MM' | '', moving } | null
export function outInfo(student, att, todaySched, nowMin) {
  const nb = nowBlock(student, todaySched, nowMin);
  const backOf = (b) => toTime(b.end + (b.r.category === '학교' ? SCHOOL_MOVE_MIN : MOVE_MIN));
  if (!att) return nb ? { name: nb.name, back: backOf(nb), moving: nb.moving } : null;
  if (att.kind !== '외출') return null;
  const name = att.reason === '학원' ? (nb && nb.r.category === '학원' ? nb.name : '학원') : att.reason || '외출';
  const back = att.expect_back ? hm(att.expect_back) : nb ? backOf(nb) : '';
  return { name, back, moving: false };
}

// 운영 시간 밖 = 하원 표시 (스톱워치 기록은 그대로, '몰입 중'만 안 띄움)
//  주중(월~금) 23:00 이후 ~ 다음 날 06:00 · 매일 00:00~06:00. 토요일은 20:00 자동 하원(출결 기록)으로 처리
export const CLOSE_WEEKDAY = 23 * 60, OPEN_MIN = 6 * 60;
export const isClosedNow = (isoDay, nowMin) => nowMin < OPEN_MIN || (isoDay >= 1 && isoDay <= 5 && nowMin >= CLOSE_WEEKDAY);
