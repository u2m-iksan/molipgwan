// 요일별로 색이 다른 누적 진행률 막대 (학생 계획 카드 · 선생님 상담 화면 공용)
// history: [{ on_date, pct }] (날짜순, 누적 %)
import { DOW, isoDow } from '../date.js';

export const DAY_COLOR = { 1: '#3182F6', 2: '#15AABF', 3: '#12A150', 4: '#F59F00', 5: '#F76707', 6: '#AE3EC9', 7: '#868E96' };

export function segments(history) {
  const out = []; let prev = 0;
  for (const h of history || []) {
    const v = Math.max(0, Math.min(100, h.pct));
    if (v > prev) out.push({ date: h.on_date, from: prev, to: v, dow: isoDow(h.on_date) });
    prev = Math.max(prev, v);
  }
  return out;
}

export function segBar(history, { legend = true } = {}) {
  const segs = segments(history);
  const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return `<div class="sb">
    <div class="sb-track">${segs.map((s) => `<i style="left:${s.from}%;width:${s.to - s.from}%;background:${DAY_COLOR[s.dow]}" title="${md(s.date)}(${DOW[s.dow]}) ${s.to}%"></i>`).join('')}</div>
    ${legend && segs.length ? `<div class="sb-lg">${segs.map((s) => `<span><i style="background:${DAY_COLOR[s.dow]}"></i>${DOW[s.dow]} ${s.to}</span>`).join('')}</div>` : ''}
  </div>`;
}
