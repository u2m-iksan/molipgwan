// 학부모 보고 카드 (선생님 미리보기 · 학부모 앱 공용) — 기존 WEEKLY REPORT 양식 기반
import { esc, BRAND } from '../ui.js';

// 기존 코칭 어플 배지 (스캘럽 체크 / 사이렌)
function seal(bg, fg) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 L61 12 L74 9 L79 22 L92 28 L89 41 L96 52 L87 62 L88 76 L74 78 L66 90 L54 84 L41 92 L33 80 L19 80 L17 66 L6 57 L13 45 L8 32 L21 28 L26 15 L39 17 Z" fill="${bg}"/><path d="M34 51 L45 62 L67 39" fill="none" stroke="${fg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export const BADGE_INFO = {
  우수: { cls: 'green', icon: seal('#C3EE9E', '#3B8B3A'), title: '이번 주 우수 학생입니다.', sub: '주간 계획 90% 이상 달성!' },
  최우수: { cls: 'gold', icon: seal('#F3DC97', '#C99A2E'), title: '이번 주 최우수 학생입니다.', sub: '주간 계획 90% 이상 달성 및 우수 선정!' },
  주말등원: { cls: 'siren', icon: '<span class="rc-siren">🚨</span>', title: '주말 등원 필수!', sub: '주중에 못한 학습을 보충합니다.' },
};

// 이행도로 배지 자동 판정 (기존 어플 규칙): 하나라도 90 미만 → 주말등원, 전부 90 이상 → 우수, 없음 → 없음
export function autoBadge(rates) {
  const rs = (rates || []).filter((x) => x.rate != null);
  if (!rs.length) return '없음';
  return rs.some((x) => x.rate < 90) ? '주말등원' : '우수';
}

const dot = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return `${y}. ${m}. ${dd}`; };
const subj = (x) => esc(x.subject) + (x.detail ? ` ${esc(x.detail)}` : '');

function rateBadge(rate) {
  if (rate == null) return '<span class="rc-b none"></span>';
  if (rate <= 49) return '<span class="rc-b r">✕</span>';
  return `<span class="rc-b ${rate >= 90 ? 'g' : 'a'}">${rate}</span>`;
}

export function reportCard(r, student) {
  const b = BADGE_INFO[r.badge];
  const rates = r.rates || [];
  const checks = r.check_items || [];
  const plan = r.next_plan || [];
  const fb = (r.subject_feedback || []).filter((x) => x.text);
  const top = rates.length || checks.length;

  return `<article class="rc">
    <header class="rc-head">
      <div class="rc-label-row"><span class="rc-label">WEEKLY REPORT</span>${BRAND}</div>
      <div class="rc-name-row">
        <div class="rc-who"><h3>${esc(student.name)} 학생</h3><p>${dot(r.period_end)}</p></div>
        ${b ? `<div class="rc-badge ${b.cls}"><span class="rc-badge-ic">${b.icon}</span>
          <div><b>${b.title}</b><small>${b.sub}</small></div></div>` : ''}
      </div>
    </header>

    <div class="rc-body">
      ${r.is_absent ? '<p class="rc-note">이번 상담에 결석하였습니다. 학생이 입력한 진행률을 안내드립니다.</p>' : ''}

      ${top ? `<div class="rc-top${rates.length && checks.length ? '' : ' single'}">
        ${rates.length ? `<section><h4 class="rc-tag">이번 주 이행도</h4>
          <ul class="rc-comp">${rates.map((x) => `<li>${rateBadge(x.rate)}
            <span class="${x.rate != null && x.rate < 90 ? 'miss' : ''}">${subj(x)} : ${esc(x.title)}</span></li>`).join('')}</ul></section>` : ''}
        ${checks.length ? `<section><h4 class="rc-tag">다음 주 점검사항</h4>
          <ul class="rc-check">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>` : ''}
      </div>` : ''}

      ${fb.length || r.summary ? `<section><h4 class="rc-tag">이번 주 상담 내용</h4>
        <div class="rc-msg">
          ${fb.map((x) => `<p><b>${esc(x.subject)}</b>${esc(x.text)}</p>`).join('')}
          ${r.summary ? `<p class="rc-sum">${esc(r.summary)}</p>` : ''}
        </div></section>` : ''}

      ${plan.length ? `<section><h4 class="rc-tag">다음 주 계획</h4>
        <ul class="rc-plan">${plan.map((x) => `<li><b>${subj(x)}</b><span>${esc(x.title)}</span></li>`).join('')}</ul></section>` : ''}
    </div>

    <footer class="rc-foot"><span>유투엠 몰입관 학원</span><span>이번 주 학습 코칭 안내</span></footer>
  </article>`;
}

/* ---------- A4 비율 고정 레이아웃 → 들어갈 자리 폭에 맞춰 축소 ---------- */
export const A4_W = 794;   // A4 (96dpi) 폭. 높이는 최소 1123, 내용이 많으면 늘어남
export function mountReport(el, r, student, { scale } = {}) {
  el._ro?.disconnect();
  el.classList.add('rc-fit');
  el.innerHTML = `<div class="rc-scale">${reportCard(r, student)}</div>`;
  const inner = el.firstElementChild;
  const fit = () => {
    const s = scale || el.clientWidth / A4_W;
    inner.style.transform = `scale(${s})`;
    el.style.height = `${Math.ceil(inner.offsetHeight * s)}px`;
    if (scale) el.style.width = `${Math.ceil(A4_W * s)}px`;
  };
  fit();
  if (!scale) { el._ro = new ResizeObserver(fit); el._ro.observe(el); }
}
