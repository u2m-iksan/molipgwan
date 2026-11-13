// 학부모 화면
//  메인: 자녀별 지금 상태(몰입 중 · 과목 / 아님) + 이번 주 시간표 + [리포트 확인하기]
//  리포트: 받은 주간 보고를 문자처럼 작게 → 누르면 크게 (← 로 메인)
import { mount, $, $$, esc, BRAND } from '../ui.js';
import { sb } from '../sb.js';
import { short, today, mondayOf, DOW, hm } from '../date.js';
import { mountReport, BADGES, BADGE_ORDER, badgesOf } from './report-card.js';
import { openReportViewer } from './report-viewer.js';
import { weekGrid } from '../teacher/schedule-editor.js';
import { loadStudentSchedules, loadVacations, withTerm } from '../data/schedules.js';

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const md = (d) => short(d).replace(/\(.\)/, '');

export async function renderParentHome({ students, onLogout }) {
  const st = { cur: 0, view: 'home', reports: null, sched: new Map(), live: new Map() };
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
  }
  async function loadSched(s) {
    if (st.sched.has(s.id)) return st.sched.get(s.id);
    const rows = withTerm(await loadStudentSchedules(s.id), s.school, await loadVacations());
    st.sched.set(s.id, rows); return rows;
  }
  async function loadReports() {
    if (st.reports) return st.reports;
    const { data, error } = await sb.from('reports').select('*').in('student_id', students.map((s) => s.id));
    if (error) throw error;
    st.reports = (data || []).filter((r) => r.published_at).sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
    return st.reports;
  }

  /* ---------- 메인 ---------- */
  const statusHtml = (s) => {
    const a = st.live.get(s.id);
    const on = a && !a.paused_at;
    return `<button type="button" class="pa-kid${on ? ' on' : ''}${students[st.cur] === s ? ' cur' : ''}" data-k="${students.indexOf(s)}">
      <div class="pa-kid-h"><b>${esc(s.name)}</b><span>${esc(s.grade || '')}</span></div>
      <div class="pa-st"><i></i>${on ? `${esc(a.subject)} 몰입 중` : a ? '잠시 휴식 중' : '몰입 중 아님'}</div>
    </button>`;
  };
  async function drawHome() {
    st.view = 'home';
    root.innerHTML = `
      <section class="pa-kids2">${students.map(statusHtml).join('')}</section>
      <section class="card pa-tt"><div class="pa-tt-h"><h3>${students.length > 1 ? `${esc(kid().name)} ` : ''}이번 주 시간표</h3><span>${md(mondayOf(today()))} 주</span></div>
        <div class="pa-coach" id="pa-coach" hidden></div>
        <div id="pa-grid"><div class="pa-empty">불러오는 중</div></div></section>
      <button type="button" class="pa-rep" id="pa-rep"><div><b>리포트 확인하기</b><span id="pa-rep-s">주간 학습 보고서</span></div><em>›</em></button>`;
    $('#pa-rep').addEventListener('click', drawReports);
    $$('.pa-kid', root).forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.k); drawHome(); }));
    loadReports().then((r) => {
      const mine = r.filter((x) => x.student_id === kid().id);
      const s = $('#pa-rep-s'); if (s && mine.length) s.textContent = `최근 ${md(mine[0].period_end || mine[0].published_at.slice(0, 10))} · 총 ${mine.length}건`;
    }).catch(() => {});
    try {
      const rows = await loadSched(kid());
      const g = $('#pa-grid'); if (!g || root._view !== token || st.view !== 'home') return;
      // 고정 상담 시간 (코칭 배정)
      const t = today();
      const c = rows.filter((r) => r.category === '코칭' && r.valid_from <= t && (!r.valid_to || r.valid_to >= t)).sort((x, y) => (x.valid_from < y.valid_from ? 1 : -1))[0];
      const cb = $('#pa-coach');
      if (cb && c) { cb.hidden = false; cb.innerHTML = `<span>정기 상담</span><b>매주 ${DOW[c.weekday]}요일 ${hm(c.start_time)}</b>`; }
      // 한 화면에 들어오게: 화면 높이에 맞춤
      const h = Math.round(Math.min(480, Math.max(300, innerHeight - g.getBoundingClientRect().top - 200 + scrollY)));
      g.innerHTML = weekGrid(rows, mondayOf(today()), today(), 40, { fitH: h, squeezeSchool: true });
    } catch (e) { const g = $('#pa-grid'); if (g) g.innerHTML = `<div class="pa-empty">불러오기 실패: ${esc(e.message)}</div>`; }
  }

  /* ---------- 리포트 (문자처럼) ---------- */
  async function drawReports() {
    st.view = 'rep';
    root.innerHTML = `<div class="pa-back"><button type="button" class="icon-btn" id="pa-b" aria-label="뒤로">${BACK}</button><h1 class="pa-h">학습 보고</h1></div>
      ${students.length > 1 ? `<div class="seg seg-wide pa-kids" id="kids">${students.map((s, i) => `<button type="button" data-i="${i}" class="${i === st.cur ? 'on' : ''}">${esc(s.name)}</button>`).join('')}</div>` : ''}
      <div id="msgs" class="pa-msgs"><div class="pa-empty">불러오는 중</div></div>`;
    $('#pa-b').addEventListener('click', drawHome);
    window.scrollTo(0, 0);
    $('#kids')?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      st.cur = Number(b.dataset.i);
      $$('#kids button').forEach((x) => x.classList.toggle('on', x === b));
      drawMsgs();
    });
    try { await loadReports(); } catch (e) { $('#msgs').innerHTML = `<div class="pa-empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    drawMsgs();
  }
  function drawMsgs() {
    const cur = kid();
    const list = st.reports.filter((r) => r.student_id === cur.id);
    const box = $('#msgs'); if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="pa-empty">도착한 보고가 없습니다.</div>'; return; }
    box.innerHTML = list.map((r, i) => {
      const got = BADGE_ORDER.filter((k) => BADGES[k] && badgesOf(r).includes(k));
      const when = r.period_end ? short(r.period_end) : '';
      return `<div class="msg">
        <div class="msg-av">U2M</div>
        <div class="msg-main">
          <div class="msg-from">몰입관<span>${when}</span></div>
          <button type="button" class="msg-bubble" data-i="${i}">
            <p class="msg-text">${esc(cur.name)} 학생 ${r.stats?.is_new ? '신규생 상담 보고서' : '주간 보고서'}${got.length ? `<span class="msg-badges">${got.map((k) => `<i title="${esc(BADGES[k].title)}">${BADGES[k].icon}</i>`).join('')}<em>배지 ${got.length}개 획득</em></span>` : ''}</p>
            <div class="msg-thumb"><div class="msg-thumb-in"></div>
              <span class="msg-zoom" aria-label="크게 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M8 10.5h5M10.5 8v5"/></svg></span></div>
          </button>
        </div>
      </div>`;
    }).join('');
    $$('.msg-bubble', box).forEach((btn) => {
      const r = list[Number(btn.dataset.i)];
      mountReport($('.msg-thumb-in', btn), r, cur);
      btn.addEventListener('click', () => openReportViewer(r, cur, `${short(r.period_end)} 주간 보고`));
    });
  }

  await loadLive();
  drawHome();
  // 상태는 1분마다 새로 (메인에 있을 때만 다시 그림)
  const t = setInterval(async () => {
    if (root._view !== token || !document.body.contains(root)) return clearInterval(t);
    await loadLive();
    if (st.view === 'home') $$('.pa-kid', root).forEach((b) => { b.outerHTML = statusHtml(students[Number(b.dataset.k)]); }), $$('.pa-kid', root).forEach((b) => b.addEventListener('click', () => { st.cur = Number(b.dataset.k); drawHome(); }));
  }, 60000);
}
