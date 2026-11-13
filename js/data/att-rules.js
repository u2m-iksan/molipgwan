// 토요일 출결 판정 (기존 앱 방식)
//  등원 예정 = 학생 기준 시각(sat_arrive, 없으면 08:00). 그 시각에 학원·기타 일정이 걸쳐 있으면 끝 + 이동 20분 (연달아 있으면 이어서)
//  알림: 미등원 지각 N분 / 외출 미복귀 N분 초과 / 지각 등원 N분
import { toMin, toTime, hm } from '../date.js';

export const SAT_BASE = '08:00';
export const MOVE_MIN = 20;

export function expectedArrival(student, todaySched) {
  let t = toMin(student.sat_arrive ? hm(student.sat_arrive) : SAT_BASE);
  const blocks = todaySched.filter((r) => r.student_id === student.id && ['학원', '기타'].includes(r.category))
    .map((r) => [toMin(r.start_time), toMin(r.end_time)]).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of blocks) if (s <= t && e > t) t = e + MOVE_MIN;
  return t;
}

const mm = (n) => (n >= 60 ? `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}` : `${n}분`);
const firstAt = (rows, kind) => rows.find((r) => r.kind === kind);
const minOf = (iso) => { const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); return d.getHours() * 60 + d.getMinutes(); };

// rows: 그 학생의 오늘 출결 (시간순) → { kind: 'late'|'expect'|'lateIn'|null, text }
export function satAlert(student, rows, todaySched, nowMin) {
  const exp = expectedArrival(student, todaySched);
  const last = rows[rows.length - 1];
  if (!rows.length) {
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
