// 날짜 도우미 (모두 한국 시간 기준, 'YYYY-MM-DD' 문자열)
export const DOW = ['', '월', '화', '수', '목', '금', '토', '일'];   // 1=월 … 7=일

export function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}
function parse(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
function str(dt) { return dt.toISOString().slice(0, 10); }

export function addDays(d, n) { const dt = parse(d); dt.setUTCDate(dt.getUTCDate() + n); return str(dt); }
export function isoDow(d) { const w = parse(d).getUTCDay(); return w === 0 ? 7 : w; }
export function mondayOf(d) { return addDays(d, 1 - isoDow(d)); }
export function addMonths(d, n) { const dt = parse(d); dt.setUTCMonth(dt.getUTCMonth() + n); return str(dt); }

// 11/13(목)
export function short(d) { const dt = parse(d); return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}(${DOW[isoDow(d)]})`; }

// 'HH:MM' ↔ 분
export const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
export const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hm = (t) => String(t || '').slice(0, 5);
