// 학부모 보고 카드 (선생님 미리보기 · 학부모 앱 공용)
import { esc } from '../ui.js';
import { short } from '../date.js';

const BADGE = { 우수: 'pill-blue', 최우수: 'pill-green', 주말등원: 'pill-orange' };
const sub = (x) => esc(x.subject) + (x.detail ? `<small>${esc(x.detail)}</small>` : '');

export function reportCard(r, student) {
  const period = r.period_start ? `${short(r.period_start)} ~ ${short(r.period_end)}` : (r.period_end ? short(r.period_end) : '');
  const rates = (r.rates || []).filter((x) => x.rate != null).slice().sort((a, b) => b.rate - a.rate);
  const fb = r.subject_feedback || [];

  return `<article class="rc">
    <header class="rc-head">
      <div class="rc-title"><b>${esc(student.name)}</b><span>${period}</span></div>
      ${BADGE[r.badge] ? `<span class="pill ${BADGE[r.badge]}">${esc(r.badge)}</span>` : ''}
    </header>

    ${r.is_absent ? `<section class="rc-sec rc-note">이번 상담에 결석하였습니다. 학생이 입력한 진행률과 자율 계획을 안내드립니다.</section>` : ''}

    ${rates.length ? `<section class="rc-sec"><h4>계획 이행도</h4>
      <ul class="rc-rates">${rates.map((x) => `
        <li class="${x.rate <= 49 ? 'low' : ''}">
          <span class="rc-sub">${sub(x)}</span>
          <span class="rc-bar"><i style="width:${Math.max(2, x.rate)}%"></i></span>
          <b>${x.rate}%</b>
          <p>${esc(x.title)}</p>
        </li>`).join('')}</ul></section>` : ''}

    ${fb.length ? `<section class="rc-sec"><h4>과목별 피드백</h4>
      <div class="rc-fb">${fb.map((x) => `<div class="rc-fb-item"><span class="rc-sub">${esc(x.subject)}</span><p>${esc(x.text)}</p></div>`).join('')}</div></section>` : ''}

    ${r.summary ? `<section class="rc-sec"><h4>총평</h4><p class="rc-sum">${esc(r.summary)}</p></section>` : ''}

    ${(r.next_plan || []).length ? `<section class="rc-sec"><h4>다음 계획</h4>
      <ul class="rc-plan">${r.next_plan.map((x) => `<li><span class="rc-sub">${sub(x)}</span><p>${esc(x.title)}</p></li>`).join('')}</ul></section>` : ''}

    ${(r.check_items || []).length ? `<section class="rc-sec"><h4>다음 점검사항</h4>
      <ul class="rc-check">${r.check_items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  </article>`;
}
