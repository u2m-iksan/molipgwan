// 주간 계획: 재원생 전체의 이번 계획(상담일 ~ 다음 상담일)과 진행률을 한 화면에
//  카드 = 학생 1명 · 항목별 진행률(학원 숙제는 n/m회) · 평균 · 계획 없음/기간 지남은 맨 앞
import { $, $$, esc } from '../ui.js';
import { today, short, DOW, hm } from '../date.js';
import { loadAllPlans } from '../data/coaching.js';
import { academyStat } from '../data/academy.js';
import { withTerm } from '../data/schedules.js';
import { segBar } from '../views/progress-bar.js';

const md = (d) => short(d).replace(/\(.\)/, '');
const level = (g) => (String(g || '').startsWith('중') ? '중등' : '고등');

export async function renderPlans(body) {
  const st = { f: '전체', lv: '전체', q: '', data: null, open: new Set() };
  body.innerHTML = `
    <div class="t-head"><h2>이행도 관리 <span class="count" id="pl-cnt"></span></h2></div>
    <div class="t-tools">
      <div class="seg" id="pl-f"></div>
      <div class="seg" id="pl-l">${['전체', '중등', '고등'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>
      <div class="search"><input id="pl-q" type="search" placeholder="이름 · 자리 검색" aria-label="검색"></div>
    </div>
    <div id="pl-list" class="pl-list"><div class="card empty">불러오는 중</div></div>`;

  try { st.data = await loadAllPlans(); }
  catch (e) { $('#pl-list').innerHTML = `<div class="card empty">불러오기 실패: ${esc(e.message)}</div>`; return; }

  const t = today();
  // 학생별 요약
  const rows = st.data.students.map((s) => {
    const plan = st.data.plans.get(s.id) || null;
    const items = plan ? st.data.items.get(plan.id) || [] : [];
    // 그 학생 학원 일정만 (학기 / 방학 반영)
    const mySched = withTerm(st.data.sched.filter((r) => r.student_id === s.id), s.school, st.data.vac);
    const its = items.map((i) => {
      const h = st.data.progress.get(i.id) || [];
      if (i.academy) {
        const a = academyStat(i, plan, mySched, h);
        return { ...i, h, a, pct: a.rate };
      }
      return { ...i, h, pct: h.length ? h[h.length - 1].pct : 0 };
    });
    const vals = its.map((i) => i.pct).filter((v) => v != null);
    const avg = vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
    const state = !plan ? 'none' : plan.due_date && plan.due_date < t ? 'over' : 'ok';
    return { s, plan, its, avg, state, coach: st.data.coach.get(s.id) };
  });
  const order = { none: 0, over: 1, ok: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || (Number(a.s.seat_no) || 999) - (Number(b.s.seat_no) || 999));

  const FILTERS = [['전체', () => true], ['계획 없음', (r) => r.state !== 'ok'], ['50% 미만', (r) => r.state === 'ok' && r.avg != null && r.avg < 50], ['학생 작성', (r) => r.plan?.author_role === '학생']];
  const seg = $('#pl-f');
  const paintSeg = () => {
    seg.innerHTML = FILTERS.map(([k, fn]) => `<button type="button" data-v="${k}" class="${st.f === k ? 'on' : ''}">${k} <span>${rows.filter(fn).length}</span></button>`).join('');
    $$('#pl-l button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.lv));
  };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.v; draw(); } });
  $('#pl-l').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.lv = b.dataset.v; draw(); } });
  $('#pl-q').addEventListener('input', (e) => { st.q = e.target.value.trim(); draw(); });

  const tone = (v) => (v == null ? '' : v >= 80 ? 'g' : v >= 50 ? '' : 'r');
  const itemHtml = (i) => `<li class="pl-it">
      <span class="pl-sub">${esc(i.subject)}${i.subject_detail ? `<small>${esc(i.subject_detail)}</small>` : ''}</span>
      <div class="pl-tt"><p>${esc(i.title)}${i.academy && i.title.trim() !== '학원 숙제' ? '<em class="pl-ac">학원 숙제</em>' : ''}</p>
        ${i.academy ? `<div class="pl-acd">${i.a.dates.map((d) => { const v = i.a.checks.get(d); return `<span class="${v === true ? 'ok' : v === false ? 'no' : d > t ? 'fut' : ''}">${DOW[new Date(d + 'T00:00:00Z').getUTCDay() || 7]}</span>`; }).join('') || '<span class="none">학원 일정 없음</span>'}</div>` : segBar(i.h, { legend: false })}</div>
      <b class="pl-pct ${tone(i.pct)}">${i.academy ? (i.a.total ? `${i.a.done}/${i.a.total}` : '-') : `${i.pct}%`}</b></li>`;

  function card(r) {
    const { s, plan } = r;
    const head = `<div class="pl-h">
        ${s.seat_no ? `<span class="pl-seat">${esc(s.seat_no)}</span>` : ''}<b class="pl-name">${esc(s.name)}</b><span class="pl-g">${esc(s.grade || '')}</span>
        ${plan ? `<span class="pl-per">${md(plan.start_date)} – ${plan.due_date ? md(plan.due_date) : ''}</span>${plan.author_role === '학생' ? '<span class="pill pill-gray">학생 작성</span>' : ''}` : ''}
        <span class="spacer"></span>
        ${r.coach ? `<span class="pl-coach">코칭 ${DOW[r.coach.weekday]} ${hm(r.coach.start_time)}</span>` : ''}
        ${r.state === 'none' ? '<span class="pill pill-red">계획 없음</span>' : r.state === 'over' ? '<span class="pill pill-orange">기간 지남</span>' : ''}
        ${r.avg != null && r.state !== 'none' ? `<b class="pl-avg cu ${tone(r.avg)}">${r.avg}<i>%</i></b>` : ''}
      </div>`;
    if (!plan) return `<section class="card pl-card none">${head}</section>`;
    return `<section class="card pl-card ${r.state}">${head}
      ${r.its.length ? `<ul class="pl-its">${r.its.map(itemHtml).join('')}</ul>` : '<p class="pl-empty">항목이 없습니다.</p>'}</section>`;
  }

  function draw() {
    paintSeg();
    const fn = FILTERS.find(([k]) => k === st.f)[1];
    const q = st.q.toLowerCase();
    const list = rows.filter(fn).filter((r) => st.lv === '전체' || level(r.s.grade) === st.lv)
      .filter((r) => !q || r.s.name.toLowerCase().includes(q) || String(r.s.seat_no || '') === q);
    $('#pl-cnt').textContent = `${list.length}명`;
    $('#pl-list').innerHTML = list.length ? list.map(card).join('') : '<div class="card empty">조건에 맞는 학생이 없습니다.</div>';
  }
  draw();
}
