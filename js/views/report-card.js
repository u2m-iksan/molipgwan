// 학부모 주간 보고서 (선생님 미리보기 · 학부모 앱 공용)
// A4 비율 고정(794 × 최소 1123) → mountReport 가 들어갈 자리 폭에 맞춰 축소
import { esc } from '../ui.js';
import { short } from '../date.js';

/* ---------- 배지 (기존 코칭 어플: 스캘럽 체크 / 사이렌) ---------- */
function seal(bg, fg) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 L61 12 L74 9 L79 22 L92 28 L89 41 L96 52 L87 62 L88 76 L74 78 L66 90 L54 84 L41 92 L33 80 L19 80 L17 66 L6 57 L13 45 L8 32 L21 28 L26 15 L39 17 Z" fill="${bg}"/><path d="M34 51 L45 62 L67 39" fill="none" stroke="${fg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export const BADGE_INFO = {
  우수: { cls: 'green', icon: seal('#C3EE9E', '#3B8B3A'), title: '이번 주 우수 학생입니다.', sub: '주간 계획 90% 이상 달성' },
  최우수: { cls: 'gold', icon: seal('#F3DC97', '#C99A2E'), title: '이번 주 최우수 학생입니다.', sub: '주간 계획 90% 이상 달성 및 우수 선정' },
  주말등원: { cls: 'siren', icon: '<span class="wr-siren">🚨</span>', title: '주말 등원 필수', sub: '주중에 못한 학습을 보충합니다.' },
};

// 이행도로 배지 자동 판정 (기존 어플 규칙): 하나라도 90 미만 → 주말등원, 전부 90 이상 → 우수
export function autoBadge(rates) {
  const rs = (rates || []).filter((x) => x.rate != null);
  if (!rs.length) return '없음';
  return rs.some((x) => x.rate < 90) ? '주말등원' : '우수';
}

/* ---------- 도우미 ---------- */
const tone = (v) => (v == null ? 'none' : v >= 90 ? 'g' : v >= 50 ? 'a' : 'r');
const sub = (x) => `${esc(x.subject)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}`;

function ring(avg) {
  const R = 52, C = 2 * Math.PI * R, v = avg ?? 0;
  return `<svg class="wr-ring ${tone(avg)}" viewBox="0 0 128 128" aria-hidden="true">
    <circle cx="64" cy="64" r="${R}" class="trk"/>
    <circle cx="64" cy="64" r="${R}" class="val" stroke-dasharray="${(C * v) / 100} ${C}" transform="rotate(-90 64 64)"/>
  </svg>`;
}

/* ---------- 보고서 ---------- */
export function reportCard(r, student) {
  const b = BADGE_INFO[r.badge];
  const rates = (r.rates || []).filter((x) => x.rate != null);
  const avg = rates.length ? Math.round(rates.reduce((a, x) => a + x.rate, 0) / rates.length) : null;
  const cnt = { g: 0, a: 0, r: 0 };
  rates.forEach((x) => cnt[tone(x.rate)]++);
  const fb = (r.subject_feedback || []).filter((x) => x.text);
  const plan = r.next_plan || [];
  const period = r.period_start ? `${short(r.period_start)} – ${short(r.period_end)}` : (r.period_end ? short(r.period_end) : '');

  return `<article class="wr">
    <div class="wr-band"><b>U2M</b></div>
    <header class="wr-head">
      <div class="wr-id">
        <div>
          <h3>${esc(student.name)} <span>학생</span></h3>
          <p>${student.grade ? `${esc(student.grade)} · ` : ''}${period}</p>
        </div>
        ${b ? `<div class="wr-badge ${b.cls}"><span class="wr-badge-ic">${b.icon}</span><div><b>${b.title}</b><small>${b.sub}</small></div></div>` : ''}
      </div>
    </header>

    ${r.is_absent ? '<p class="wr-absent">이번 상담에 결석하였습니다. 학생이 입력한 진행률을 기준으로 안내드립니다.</p>' : ''}

    ${rates.length ? `<section class="wr-rate">
      <div class="wr-avg">
        ${ring(avg)}
        <div class="wr-avg-tx"><small>평균 이행도</small><b>${avg}<i>%</i></b></div>
      </div>
      <div class="wr-bars">
        <div class="wr-sec-h"><h4>계획 이행도</h4>
          <span class="wr-legend">${cnt.g ? `<i class="g"></i>달성 ${cnt.g}` : ''}${cnt.a ? `<i class="a"></i>부분 ${cnt.a}` : ''}${cnt.r ? `<i class="r"></i>미달 ${cnt.r}` : ''}</span></div>
        <ul>${rates.map((x) => `<li class="${tone(x.rate)}">
          <b class="wr-r-name">${esc(x.subject)}</b>
          <p class="wr-r-title">${esc(x.title)}</p>
          <strong class="wr-r-pct">${x.rate}<i>%</i></strong>
          <small class="wr-r-det">${esc(x.detail || '')}</small>
          <span class="wr-bar"><i style="width:${Math.max(3, x.rate)}%"></i></span>
        </li>`).join('')}</ul>
      </div>
    </section>` : ''}

    ${fb.length ? `<section class="wr-sec">
      <div class="wr-sec-h"><h4>과목별 피드백</h4></div>
      <dl class="wr-fb">${fb.map((x) => `<div><dt>${esc(x.subject)}</dt><dd>${esc(x.text)}</dd></div>`).join('')}</dl>
    </section>` : ''}

    ${plan.length ? `<section class="wr-sec">
      <div class="wr-sec-h"><h4>다음 계획</h4></div>
      <ul class="wr-plan">${plan.map((x) => `<li><span class="wr-sub">${sub(x)}</span><p>${esc(x.title)}</p></li>`).join('')}</ul>
    </section>` : ''}
    ${r.summary ? `<section class="wr-sec">
      <div class="wr-sec-h"><h4>총평</h4></div>
      <p class="wr-sum">${esc(r.summary)}</p>
    </section>` : ''}

  </article>`;
}

/* ---------- A4 비율 고정 → 들어갈 자리 폭에 맞춰 축소 ---------- */
export const A4_W = 794;
export function mountReport(el, r, student, { scale } = {}) {
  el._ro?.disconnect();
  el.classList.add('wr-fit');
  el.innerHTML = `<div class="wr-scale">${reportCard(r, student)}</div>`;
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
