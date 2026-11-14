// 학부모 화면
//  메인: 자녀별 지금 상태(몰입 중 · 과목 / 아님) + 이번 주 시간표 + [리포트 확인하기]
//  [리포트 확인하기] → 학습 문의 채팅방(보고서도 말풍선으로, 선생님과 실제 대화 · 읽음 · 1개월 보관)
import { mount, $, $$, esc, BRAND } from '../ui.js';
import { sb } from '../sb.js';
import { short, today, mondayOf, DOW, hm, isoDow } from '../date.js';
import { mountThread } from './chat-thread.js';
import { segBar } from './progress-bar.js';
import { academyStat } from '../data/academy.js';
import { loadOpenPlan } from '../data/student.js';
import { loadParentUnread, purgeOld, getKakao } from '../data/chat.js';
import { openHistory } from './history.js';
import { weekGrid } from '../teacher/schedule-editor.js';
import { loadStudentSchedules, loadVacations, withTerm } from '../data/schedules.js';
import { nowBlock, outInfo } from '../data/att-rules.js';

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const md = (d) => short(d).replace(/\(.\)/, '');

export async function renderParentHome({ students, onLogout }) {
  const st = { cur: 0, view: 'home', sched: new Map(), live: new Map(), unread: new Map(), kakao: '' };
  mount(`<div class="pa">
    <header class="top"><div class="top-in">${BRAND}<div class="spacer"></div>
      <button type="button" class="chip muted" id="lo">로그아웃</button></div></header>
    <main class="pa-page" id="pa"></main></div>`);
  $('#lo').addEventListener('click', onLogout);
  const root = $('#pa'); const token = {}; root._view = token;
  const kid = () => students[st.cur];

  /* ---------- 데이터 ---------- */
  // 오늘 진행 중인 스톱워치 → 몰입 중(과목) / 일시정지 / 아님
  async function loadLive() {
    try {
      const { data, error } = await sb.from('study_sessions').select('student_id,subject,ended_at,paused_at')
        .in('student_id', students.map((s) => s.id)).eq('study_date', today()).is('ended_at', null);
      if (error) throw error;
      st.live = new Map((data || []).map((r) => [r.student_id, r]));
    } catch { st.live = new Map(); }
    // 토요일은 등원(복귀) 상태 = 몰입 중
    st.att = new Map();
    if (isoDow(today()) === 6) {
      try {
        const { data } = await sb.from('attendance').select('student_id,kind,at,reason,expect_back').in('student_id', students.map((s) => s.id)).eq('on_date', today()).order('at');
        (data || []).forEach((r) => st.att.set(r.student_id, r));
      } catch { /* 없음 */ }
    }
    await Promise.all(students.map((k) => loadSched(k).catch(() => [])));   // 지금 학원·학교 일정인지 (주중도)
  }
  async function loadSched(s) {
    if (st.sched.has(s.id)) return st.sched.get(s.id);
    const rows = withTerm(await loadStudentSchedules(s.id), s.school, await loadVacations());
    st.sched.set(s.id, rows); return rows;
  }
  async function loadUnread() {
    try { st.unread = await loadParentUnread(students.map((s) => s.id)); } catch { st.unread = new Map(); }
  }
  const paintUnread = () => {
    const n = st.unread.get(kid().id) || 0, b = $('#pa-rep-n');
    if (b) { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
    $$('.pa-kid', root).forEach((k) => { const v = st.unread.get(students[Number(k.dataset.k)].id) || 0; k.classList.toggle('dot', v > 0); });
  };

  /* ---------- 메인 ---------- */
  const statusHtml = (s) => {
    const a = st.live.get(s.id);
    const sat = isoDow(today()) === 6, at = st.att?.get(s.id);
    // 지금 일정 중(끝 + 이동 시간 포함)이면 '외출 · 학원명' — 선생님 현황판과 같은 기준
    //  학생 입력 우선: 토요일은 출결 기록, 주중은 스톱워치를 켜 두었으면 그걸 따름
    const t0 = today(), n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })), nowMin = n.getHours() * 60 + n.getMinutes();
    const todayRows = (st.sched.get(s.id) || []).filter((r) => r.weekday === isoDow(t0) && r.valid_from <= t0 && (!r.valid_to || r.valid_to >= t0));
    const nb = nowBlock(s, todayRows, nowMin);
    const autoOut = !!nb && (sat ? !at && !(a && !a.paused_at) : !a);
    const satOn = sat && !autoOut && !!at && (at.kind === '등원' || at.kind === '복귀');
    const on = sat ? satOn : a && !a.paused_at;
    // 외출(주황): 어디(학원명 · 학교 · 식사 · 기타) + 복귀 예정
    const out = !on && (autoOut || (sat && at?.kind === '외출')) ? outInfo(s, autoOut ? null : at, todayRows, nowMin) : null;
    return `<button type="button" class="pa-kid${on ? ' on' : ''}${out ? ' out' : ''}${students[st.cur] === s ? ' cur' : ''}" data-k="${students.indexOf(s)}">
      <div class="pa-kid-h"><b>${esc(s.name)}</b><span>${esc(s.grade || '')}</span></div>
      <div class="pa-st"><i></i>${on ? (a && !a.paused_at ? `${esc(a.subject)} 몰입 중` : '몰입 중') : out ? `외출 · ${esc(out.name)}` : sat ? (at?.kind === '하원' ? '하원' : '몰입 중 아님') : a ? '잠시 휴식 중' : '몰입 중 아님'}</div>
      ${out ? `<div class="pa-back">${out.moving ? '이동 중 · ' : ''}${out.back ? `${out.back} 복귀 예정` : '복귀 시간 미정'}</div>` : ''}
    </button>`;
  };
  async function drawHome() {
    st.view = 'home';
    root.innerHTML = `
      <section class="pa-kids2">${students.map(statusHtml).join('')}</section>
      <button type="button" class="pa-rep" id="pa-rep"><div><b>리포트 확인하기</b><span>주간 보고서 · 학습 문의 채팅</span></div><i class="pa-n" id="pa-rep-n" hidden></i><em>›</em></button>
      <section class="card pa-plan" id="pa-plan"><div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 계획</h3><span id="pa-plan-p"></span></div><div class="pa-empty">불러오는 중</div></section>
      <button type="button" class="pa-histbar" id="pa-hist"><span>지난 계획 기록</span><small>최근 8주 이행도</small><em aria-hidden="true">›</em></button>
      <section class="card pa-tt"><div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 시간표</h3><span>${md(mondayOf(today()))} 주</span></div>
        <div class="pa-coach" id="pa-coach" hidden></div>
        <div id="pa-grid"><div class="pa-empty">불러오는 중</div></div></section>`;
    $('#pa-rep').addEventListener('click', drawChat);
    $('#pa-hist').addEventListener('click', () => openHistory(kid()));
    paintUnread(); drawPlan();
    $$('.pa-kid', root).forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.k); drawHome(); }));
    try {
      const rows = await loadSched(kid());
      const g = $('#pa-grid'); if (!g || root._view !== token || st.view !== 'home') return;
      // 고정 상담 시간 (코칭 배정)
      const t = today();
      const c = rows.filter((r) => r.category === '코칭' && r.valid_from <= t && (!r.valid_to || r.valid_to >= t)).sort((x, y) => (x.valid_from < y.valid_from ? 1 : -1))[0];
      const cb = $('#pa-coach');
      if (cb && c) { cb.hidden = false; cb.innerHTML = `<span>정기 상담</span><b>매주 ${DOW[c.weekday]}요일 ${hm(c.start_time)}</b>`; }
      // 한 화면에 들어오게: 화면 높이에 맞춤
      const h = Math.round(Math.min(460, Math.max(320, innerHeight * 0.5)));
      g.innerHTML = weekGrid(rows, mondayOf(today()), today(), 40, { fitH: h, squeezeSchool: true, nowLine: true });
    } catch (e) { const g = $('#pa-grid'); if (g) g.innerHTML = `<div class="pa-empty">불러오기 실패: ${esc(e.message)}</div>`; }
  }

  /* ---------- 이번 주 계획 이행도 ---------- */
  async function drawPlan() {
    const box = $('#pa-plan'); if (!box) return;
    const k = kid();
    try {
      const [{ plan, items, progress }, rows] = await Promise.all([loadOpenPlan(k.id), loadSched(k)]);
      if (!$('#pa-plan') || kid() !== k) return;
      if (!plan || !items.length) { box.innerHTML = `<div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 계획</h3></div><p class="pa-none">진행 중인 계획이 없습니다.</p>`; return; }
      const its = items.map((i) => {
        const h = progress.get(i.id) || [];
        if (i.academy) { const a = academyStat(i, plan, rows, h); return { i, h, a, pct: a.rate }; }
        return { i, h, pct: h.length ? h[h.length - 1].pct : 0 };
      });
      const vals = its.map((x) => x.pct).filter((v) => v != null);
      const avg = vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
      box.innerHTML = `<div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 계획</h3><span>${md(plan.start_date)} – ${plan.due_date ? md(plan.due_date) : ''}${avg != null ? ` · 평균 <b class="cu">${avg}%</b>` : ''}</span></div>
        <ul class="pa-its">${its.map((x) => `<li>
          <span class="pa-sub">${esc(x.i.subject)}${x.i.subject_detail ? `<small>${esc(x.i.subject_detail)}</small>` : ''}</span>
          <div class="pa-it-t"><p>${esc(x.i.title)}${x.i.academy && x.i.title.trim() !== '학원 숙제' ? '<em>학원 숙제</em>' : ''}</p>${x.i.academy ? '' : segBar(x.h, { legend: false })}</div>
          <b>${x.i.academy ? (x.a.total ? `${x.a.done}/${x.a.total}회` : '-') : `${x.pct}%`}</b></li>`).join('')}</ul>`;
    } catch (e) { box.innerHTML = `<div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 계획</h3></div><p class="pa-none">불러오기 실패: ${esc(e.message)}</p>`; }
  }

  /* ---------- 리포트 · 학습 문의 채팅 ---------- */
  function drawChat() {
    st.view = 'chat';
    document.body.classList.add('pa-chat-on');
    root.innerHTML = `<div class="pa-back"><button type="button" class="icon-btn" id="pa-b" aria-label="뒤로">${BACK}</button><h1 class="pa-h">${esc(kid().name)} 학습 문의</h1></div>
      ${students.length > 1 ? `<div class="seg seg-wide pa-kids" id="kids">${students.map((s, i) => `<button type="button" data-i="${i}" class="${i === st.cur ? 'on' : ''}">${esc(s.name)}<i class="pa-n sm"${st.unread.get(s.id) ? '' : ' hidden'}>${st.unread.get(s.id) || ''}</i></button>`).join('')}</div>` : ''}
      <div class="pa-thread" id="pa-thread"></div>`;
    $('#pa-b').addEventListener('click', () => { document.body.classList.remove('pa-chat-on'); loadUnread().then(drawHome); });
    window.scrollTo(0, 0);
    $('#kids')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.cur = Number(b.dataset.i); drawChat(); });
    mountThread($('#pa-thread'), { student: kid(), me: 'parent', kakao: st.kakao, onActivity: () => loadUnread().then(() => {
      $$('#kids button').forEach((b) => { const v = st.unread.get(students[Number(b.dataset.i)].id) || 0; const n = b.querySelector('.pa-n'); if (n) { n.hidden = !v; n.textContent = v; } });
    }) });
  }

  purgeOld();
  getKakao().then((u) => { st.kakao = u; }).catch(() => {});
  await Promise.all([loadLive(), loadUnread()]);
  const firstNew = students.findIndex((x) => st.unread.get(x.id));
  if (firstNew > 0) st.cur = firstNew;
  drawHome();
  // 상태는 1분마다 새로 (메인에 있을 때만 다시 그림)
  const t = setInterval(async () => {
    if (root._view !== token || !document.body.contains(root)) return clearInterval(t);
    await Promise.all([loadLive(), loadUnread()]);
    if (st.view === 'home') {
      $$('.pa-kid', root).forEach((b) => { b.outerHTML = statusHtml(students[Number(b.dataset.k)]); });
      $$('.pa-kid', root).forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.k); drawHome(); }));
      paintUnread();
    }
  }, 60000);
}
