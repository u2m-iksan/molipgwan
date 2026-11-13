// 보고 카드 크게 보기 (학부모 앱 · 선생님 미리보기 공용)
// 처음엔 화면 폭에 맞춤 → [확대]로 원래 크기(A4 폭)로 보고 스크롤. 손가락 확대도 가능.
import { $, esc, sheet, X } from '../ui.js';
import { mountReport, A4_W } from './report-card.js';

export function openReportViewer(r, student, title = '') {
  const v = sheet(`
    <div class="rv" role="dialog" aria-label="보고서">
      <div class="rv-bar">
        <b>${esc(title || `${student.name} 학생 보고서`)}</b>
        <div class="spacer"></div>
        <button type="button" class="rv-zoom" id="rv-zoom">확대</button>
        <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button>
      </div>
      <div class="rv-scroll"><div class="rv-card" id="rv-card"></div></div>
    </div>`, 'center');
  v.classList.add('overlay-rv');
  const box = $('#rv-card', v), scroll = $('.rv-scroll', v), btn = $('#rv-zoom', v);
  let big = false;
  const draw = () => {
    const fitScale = Math.min(1, (scroll.clientWidth - 32) / A4_W);
    mountReport(box, r, student, { scale: big ? 1 : fitScale });
    btn.textContent = big ? '맞춤' : '확대';
    btn.hidden = fitScale >= 1;
  };
  btn.addEventListener('click', () => { big = !big; draw(); scroll.scrollTo(0, 0); });
  requestAnimationFrame(draw);
  return v;
}
