// 학부모 주간 보고서 (선생님 미리보기 · 학부모 앱 공용) — 사이드바형
// 왼쪽: 로고 · 학생 · 평균 이행도 · 이번 주 배지 / 오른쪽: 계획 이행도 · 과목별 피드백 · 총평
// 폭 794 고정, 높이는 내용만큼 → mountReport 가 들어갈 자리 폭에 맞춰 축소
import { esc } from '../ui.js';
import { short } from '../date.js';

/* ---------- 배지 (기존 스캘럽 모양 통일, 색·아이콘만 다름) ---------- */
const SEAL = 'M50 4 L61 12 L74 9 L79 22 L92 28 L89 41 L96 52 L87 62 L88 76 L74 78 L66 90 L54 84 L41 92 L33 80 L19 80 L17 66 L6 57 L13 45 L8 32 L21 28 L26 15 L39 17 Z';
const seal = (bg, fg, inner, sw = 7) => `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${SEAL}" fill="${bg}"/><g fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;

export const BADGES = {
  최우수: { color: '#B8861C', icon: seal('#F3DC97', '#B8861C', '<path d="M50 30 L56 44 L71 45 L59 55 L63 70 L50 62 L37 70 L41 55 L29 45 L44 44 Z"/>', 5), title: '이번 주 최우수 학생', sub: () => '선생님 선정' },
  우수: { color: '#3B8B3A', icon: seal('#C3EE9E', '#3B8B3A', '<path d="M34 51 L45 62 L67 39"/>'), title: '이번 주 우수 학생', sub: () => '계획 이행도 90% 이상' },
  성장: { color: '#1D5FC4', icon: seal('#BFDBFE', '#1D5FC4', '<path d="M32 64 L46 50 L55 58 L69 40"/><path d="M58 40 L69 40 L69 51"/>'), title: '성장', sub: (s) => (s?.prev_avg != null && s?.avg != null ? `평균 이행도 +${s.avg - s.prev_avg}%p` : '지난번보다 이행도 상승') },
  기록왕: { color: '#6B3FC1', icon: seal('#E4D4FB', '#6B3FC1', '<circle cx="50" cy="55" r="16"/><path d="M50 55 L50 46"/><path d="M45 33 L55 33"/><path d="M50 33 L50 39"/>'), title: '기록왕', sub: () => '순공시간 10시간 이상' },
  꾸준함: { color: '#C2510E', icon: seal('#FFD9C2', '#C2510E', '<path d="M50 30 C58 40 66 46 66 57 A16 16 0 0 1 34 57 C34 49 40 45 42 38 C46 44 48 46 50 47 C51 41 50 36 50 30 Z"/>', 5), title: '꾸준함', sub: (s) => (s?.days_needed ? `${s.days_needed}일 매일 스톱워치 기록` : '매일 스톱워치 기록') },
};
export const BADGE_ORDER = ['최우수', '우수', '성장', '기록왕', '꾸준함', '주말등원'];
export const WEEKEND = { title: '주말 등원 필수', sub: '주중에 못한 학습을 보충합니다.' };

// 자동 판정 (기간 = 지난 상담 ~ 이번 상담)
export const RULE = { goodRate: 90, growth: 10, studyHours: 10 };
export function autoBadges(rates, stats) {
  const rs = (rates || []).filter((x) => x.rate != null);
  const out = [];
  if (rs.length && rs.every((x) => x.rate >= RULE.goodRate)) out.push('우수');
  if (stats?.avg != null && stats?.prev_avg != null && stats.avg - stats.prev_avg >= RULE.growth) out.push('성장');
  if ((stats?.study_seconds || 0) >= RULE.studyHours * 3600) out.push('기록왕');
  if (stats?.days_needed && stats.days_studied >= stats.days_needed) out.push('꾸준함');
  if (rs.some((x) => x.rate < RULE.goodRate)) out.push('주말등원');
  return out;
}
// 예전 보고(배지 1개 칸)와 호환
export const badgesOf = (r) => (r.badges?.length ? r.badges : (r.badge && r.badge !== '없음' ? [r.badge] : []));

/* ---------- 도우미 ---------- */
const tone = (v) => (v == null ? 'none' : v >= 90 ? 'g' : v >= 50 ? 'a' : 'r');
const dot = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return `${y}. ${m}. ${dd}`; };
const md = (d) => short(d).replace(/\(.\)/, '');

function ring(avg) {
  const R = 54, C = 2 * Math.PI * R, v = avg ?? 0;
  return `<svg class="wr-ring" viewBox="0 0 128 128" aria-hidden="true">
    <circle cx="64" cy="64" r="${R}" class="trk"/>
    <circle cx="64" cy="64" r="${R}" class="val" stroke-dasharray="${(C * v) / 100} ${C}" transform="rotate(-90 64 64)"/>
  </svg>`;
}

/* ---------- 보고서 ---------- */
export function reportCard(r, student) {
  if (r.stats?.is_new) return newReportCard(r, student);
  const rates = (r.rates || []).filter((x) => x.rate != null);
  const avg = rates.length ? Math.round(rates.reduce((a, x) => a + x.rate, 0) / rates.length) : null;
  const done = rates.filter((x) => x.rate >= 90).length, low = rates.filter((x) => x.rate < 50).length;
  const fb = (r.subject_feedback || []).filter((x) => x.text);
  const list = badgesOf(r);
  const earned = BADGE_ORDER.filter((k) => k !== '주말등원' && list.includes(k) && BADGES[k]);
  const stats = { ...(r.stats || {}), avg };
  const period = r.period_start ? `${md(r.period_start)} – ${md(r.period_end)}` : (r.period_end ? md(r.period_end) : '');

  return `<article class="wr">
    <aside class="wr-side">
      <span class="wr-logo">U2M</span>
      <h3 class="wr-name">${esc(student.name)}<span>${student.grade ? `${esc(student.grade)} · ` : ''}${period}</span></h3>
      ${avg != null ? `<div class="wr-avg">${ring(avg)}<div class="wr-avg-tx"><small>평균 이행도</small><b>${avg}<i>%</i></b></div></div>` : ''}
      ${earned.length ? `<p class="wr-side-h">이번 주 배지</p>
        <ul class="wr-badges">${earned.map((k) => { const b = BADGES[k]; return `<li><span class="wr-b-ic">${b.icon}</span>
          <div><b style="color:${b.color}">${b.title}</b><small>${b.sub(stats)}</small></div></li>`; }).join('')}</ul>` : ''}
      ${list.includes('주말등원') ? `<div class="wr-weekend"><b>${WEEKEND.title}</b><small>${WEEKEND.sub}</small></div>` : ''}
    </aside>

    <main class="wr-main">
      <div class="wr-mh"><h2>주간 학습 보고서</h2><span>상담일 ${dot(r.period_end)}</span></div>
      ${r.is_absent ? '<p class="wr-absent">이번 상담에 결석하였습니다. 학생이 입력한 진행률을 기준으로 안내드립니다.</p>' : ''}

      ${rates.length ? `<section class="wr-sec">
        <h4>계획 이행도<small>${done ? `달성 ${done}` : ''}${done && low ? ' · ' : ''}${low ? `보완 ${low}` : ''}</small></h4>
        <ul class="wr-bars">${rates.map((x) => `<li class="${tone(x.rate)}">
          <span class="wr-s">${esc(x.subject)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</span>
          <div><p>${esc(x.title)}</p><span class="wr-bar"><i style="width:${Math.max(2, x.rate)}%"></i></span></div>
          <b>${x.rate}%</b></li>`).join('')}</ul>
      </section>` : ''}

      ${fb.length ? `<section class="wr-sec">
        <h4>과목별 피드백</h4>
        <ul class="wr-fb">${fb.map((x) => `<li><b>${esc(x.subject)}</b><span>${esc(x.text)}</span></li>`).join('')}</ul>
      </section>` : ''}

      ${r.summary ? `<section class="wr-sec">
        <h4>총평</h4>
        <p class="wr-sum">${esc(r.summary)}</p>
      </section>` : ''}
    </main>
  </article>`;
}

/* ---------- 신규생 상담 보고서 ---------- */
function newReportCard(r, student) {
  const P = r.stats.profile || {};
  const plan = r.next_plan || [];
  const fb = (r.subject_feedback || []).filter((x) => x.text);
  const habits = (P.habits || []).filter(Boolean);
  const tile = (cls, label, v, icon) => `<div class="wr-tile ${cls}"><span class="wr-tile-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>
    <small>${label}</small><b>${v ? esc(v) : '-'}</b></div>`;
  return `<article class="wr">
    <aside class="wr-side">
      <span class="wr-logo">U2M</span>
      <h3 class="wr-name">${esc(student.name)}<span>${student.grade ? `${esc(student.grade)} · ` : ''}신규 상담</span></h3>
      ${P.strong_subjects?.length || P.weak_subjects?.length ? `<div class="wr-sw">
        ${tile('st', '자신 있는 과목', P.strong_subjects?.[0], '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>')}
        ${tile('wk', '보완할 과목', P.weak_subjects?.[0], '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.8"/>')}
      </div>` : ''}
    </aside>
    <main class="wr-main">
      <div class="wr-mh"><h2>신규생 상담 보고서</h2><span>상담일 ${dot(r.period_end)}</span></div>
      ${P.goal ? `<section class="wr-sec"><h4>학생 목표</h4><p class="wr-goal">${esc(P.goal)}</p></section>` : ''}
      ${habits.length ? `<section class="wr-sec"><h4>몰입관에서 만들 공부 습관</h4>
        <ol class="wr-habits">${habits.map((h, i) => `<li><b>${i + 1}</b><span>${esc(h)}</span></li>`).join('')}</ol></section>` : ''}
      ${plan.length ? `<section class="wr-sec"><h4>다음 주 계획</h4>
        <ul class="wr-fb">${plan.map((x) => `<li><b>${esc(x.subject)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</b><span>${esc(x.title)}</span></li>`).join('')}</ul></section>` : ''}
      ${fb.length ? `<section class="wr-sec"><h4>과목별 상담 내용</h4>
        <ul class="wr-fb">${fb.map((x) => `<li><b>${esc(x.subject)}</b><span>${esc(x.text)}</span></li>`).join('')}</ul></section>` : ''}
      ${r.summary ? `<section class="wr-sec"><h4>총평</h4><p class="wr-sum">${esc(r.summary)}</p></section>` : ''}
    </main>
  </article>`;
}

/* ---------- 폭 794 고정 → 들어갈 자리 폭에 맞춰 축소 ---------- */
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
