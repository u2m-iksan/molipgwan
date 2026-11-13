// 학생 앱 (태블릿 가로 우선): 위 = 등원 체크 · 이름 / 왼쪽 = 시간표 / 오른쪽 = 이번 계획 + 오늘 진행률 / 오른쪽 아래 = 스톱워치
import { mount, $, $$, esc, toast, sheet, BRAND, X } from '../ui.js';
import { DOW, today, mondayOf, short, isoDow } from '../date.js';
import { loadStudentSchedules } from '../data/schedules.js';
import { weekGrid, renderScheduleEditor } from '../teacher/schedule-editor.js';
import { segBar } from './progress-bar.js';
import { openStopwatch, clock } from './stopwatch.js';
import {
  loadOpenPlan, saveProgress, loadAttendance, attState, isSaturday, checkIn, addAttendance, autoCheckout,
  loadSessions, elapsedSec, needsCheck,
} from '../data/student.js';

const SW_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 3h5M12 3v3M18.5 6.5l1.5-1.5"/></svg>';
const REASONS = ['학원', '식사', '기타'];
const md = (d) => short(d).replace(/\(.\)/, '');

export async function renderStudentHome({ student, onLogout }) {
  const token = {};
  mount(`<div class="sa" id="sa">
    <header class="top"><div class="top-in">${BRAND}<div class="spacer"></div>
      <div class="sa-att" id="att"></div>
      <span class="chip">${esc(student.name)}</span>
      <button type="button" class="chip muted" id="lo">로그아웃</button></div></header>
    <main class="sa-main">
      <section class="card sa-tt" id="tt"><div class="empty">불러오는 중</div></section>
      <section class="card sa-plan" id="plan"><div class="empty">불러오는 중</div></section>
    </main>
    <button type="button" class="sa-fab" id="fab" aria-label="스톱워치">${SW_IC}<span id="fab-t"></span></button>
  </div>`);
  const root = $('#sa'); root._view = token;
  $('#lo').addEventListener('click', onLogout);

  const st = { plan: null, items: [], progress: new Map(), att: [], sess: null, open: null };

  /* ---------- 등원 ---------- */
  async function loadAtt() {
    try {
      st.att = await loadAttendance(student.id);
      if (await autoCheckout(student.id, st.att)) st.att = await loadAttendance(student.id);
    } catch { st.att = []; }
    drawAtt();
  }
  function drawAtt() {
    const el = $('#att'); if (!el) return;
    const s = attState(st.att);
    const last = st.att[st.att.length - 1];
    const tm = last ? new Date(last.at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    if (!s) { el.innerHTML = isSaturday() ? '<button type="button" class="att-btn need" id="att-in">등원 체크</button>' : ''; }
    else if (s === '하원') el.innerHTML = `<span class="att-state">${last.auto ? '자동 하원' : '하원'} ${tm}</span>`;
    else if (s === '외출') el.innerHTML = `<span class="att-state out">외출 중 · ${esc(last.reason || '')}</span>
      <button type="button" class="att-btn" data-k="복귀">복귀</button><button type="button" class="att-btn" data-k="하원">하원</button>`;
    else el.innerHTML = `<span class="att-state in">등원 ${tm}</span>
      <button type="button" class="att-btn" data-k="외출">외출</button><button type="button" class="att-btn" data-k="하원">하원</button>`;
  }
  $('#att').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'att-in') return pinModal();
    const k = b.dataset.k;
    if (k === '복귀') return record('복귀');
    reasonModal(k);
  });
  async function record(kind, reason = null) {
    try { await addAttendance(student.id, kind, reason); toast(`${kind} 처리되었습니다`); await loadAtt(); }
    catch (e) { toast('저장 실패: ' + e.message); }
  }
  function pinModal() {
    let code = '';
    const m = sheet(`<div class="modal modal-s pin" role="dialog" aria-label="등원 체크">
      <div class="drawer-head"><h3>등원 체크</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body"><p class="desc-s">전자칠판의 등원 코드 4자리를 입력하세요.</p>
        <div class="dots" id="pd">${'<i></i>'.repeat(4)}</div><p class="err" id="pe" role="alert"></p>
        <div class="keypad" id="pk">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
          <span></span><button type="button" data-n="0">0</button><button type="button" data-n="del" class="k-sub">지우기</button></div></div></div>`, 'center');
    const paint = () => $$('#pd i', m).forEach((d, i) => d.classList.toggle('on', i < code.length));
    $('#pk', m).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $('#pe', m).textContent = '';
      if (b.dataset.n === 'del') code = code.slice(0, -1);
      else if (code.length < 4) code += b.dataset.n;
      paint();
      if (code.length === 4) {
        try {
          const ok = await checkIn(student.id, code);
          if (ok) { m.close(); toast('등원 처리되었습니다'); loadAtt(); }
          else { $('#pe', m).textContent = '코드가 일치하지 않습니다.'; code = ''; paint(); }
        } catch (ex) { $('#pe', m).textContent = '확인 실패: ' + ex.message; code = ''; paint(); }
      }
    });
  }
  function reasonModal(kind) {
    const m = sheet(`<div class="modal modal-s" role="dialog" aria-label="${kind}">
      <div class="drawer-head"><h3>${kind}</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body"><p class="desc-s">사유를 선택하세요.</p>
        <div class="reason">${REASONS.map((r) => `<button type="button" data-r="${r}">${r}</button>`).join('')}</div></div></div>`, 'center');
    $('.reason', m).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      m.close(); record(kind, b.dataset.r);
    });
  }

  /* ---------- 시간표 (화면 높이에 맞춤) ---------- */
  async function loadTT() {
    const el = $('#tt');
    try {
      const rows = await loadStudentSchedules(student.id);
      const draw = () => {
        if (root._view !== token || !$('#tt')) return;
        const avail = el.clientHeight - 40 - 52;          // 요일 머리 · 제목 줄
        // 학교 있는 주중은 학교 시간을 줄이고 오후·저녁을 크게 (주말·학교 없는 주는 고르게)
        el.innerHTML = `<div class="sa-h"><h3>이번 주 시간표</h3><span>${md(mondayOf(today()))} 주</span><button type="button" class="link-s sa-edit" id="tt-edit">학원 일정</button></div>${weekGrid(rows, mondayOf(today()), today(), 40, { fitH: Math.max(330, avail), squeezeSchool: true })}`;
      };
      draw();
      new ResizeObserver(() => draw()).observe($('.sa-main'));
      // 학원 일정 변경 (바로 반영 + 선생님 알림)
      el.addEventListener('click', (e) => {
        if (e.target.id !== 'tt-edit') return;
        const panel = sheet(`<div class="modal modal-lg" role="dialog" aria-label="학원 일정">
          <div class="drawer-head"><h3>학원 일정</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
          <div class="pane" id="se"></div></div>`, 'center');
        renderScheduleEditor($('#se', panel), student, { student: true });
        const close = panel.close;
        panel.close = () => { close(); loadStudentSchedules(student.id).then((r) => { rows.splice(0, rows.length, ...r); draw(); }).catch(() => {}); };
      });
    } catch (e) { el.innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; }
  }

  /* ---------- 이번 계획 ---------- */
  async function loadPlan() {
    try { Object.assign(st, await loadOpenPlan(student.id)); }
    catch (e) { $('#plan').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    drawPlan();
  }
  const lastPct = (id) => { const h = st.progress.get(id) || []; return h.length ? h[h.length - 1].pct : 0; };
  const todayPct = (id) => (st.progress.get(id) || []).find((r) => r.on_date === today())?.pct;
  function drawPlan() {
    const el = $('#plan');
    if (!st.plan) {
      el.innerHTML = '<div class="sa-h"><h3>이번 계획</h3></div><div class="sa-empty"><b>진행 중인 계획이 없습니다.</b>상담에서 계획을 세웁니다.</div>';
      return;
    }
    const p = st.plan;
    el.innerHTML = `<div class="sa-h"><h3>이번 계획</h3><span>${md(p.start_date)} – ${p.due_date ? md(p.due_date) : ''}</span></div>
      <ul class="sa-items">${st.items.map((i) => {
        const open = st.open === i.id, tp = todayPct(i.id);
        return `<li class="sa-item${open ? ' open' : ''}" data-id="${esc(i.id)}">
          <button type="button" class="sa-item-h" data-tg="${esc(i.id)}">
            <span class="sa-sub">${esc(i.subject)}${i.subject_detail ? `<small>${esc(i.subject_detail)}</small>` : ''}</span>
            <span class="sa-title">${esc(i.title)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</span>
            <b class="sa-pct">${lastPct(i.id)}%</b>
          </button>
          ${segBar(st.progress.get(i.id) || [])}
          ${open ? `<div class="sa-pick"><p>오늘(${DOW[isoDow(today())]}) 어디까지 했나요?</p>
            <div class="sa-steps">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => `<button type="button" data-pct="${v}" class="${tp === v ? 'on' : ''}${v < lastPct(i.id) && tp == null ? ' past' : ''}">${v}</button>`).join('')}</div></div>` : ''}
        </li>`;
      }).join('') || '<div class="sa-empty">계획 항목이 없습니다.</div>'}</ul>`;
  }
  $('#plan').addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-tg]');
    if (tg) { st.open = st.open === tg.dataset.tg ? null : tg.dataset.tg; return drawPlan(); }
    const b = e.target.closest('[data-pct]'); if (!b) return;
    const item = st.items.find((i) => i.id === b.closest('.sa-item').dataset.id);
    const v = Number(b.dataset.pct);
    try {
      await saveProgress(item, v);
      const h = (st.progress.get(item.id) || []).filter((r) => r.on_date !== today());
      h.push({ item_id: item.id, on_date: today(), pct: v });
      st.progress.set(item.id, h);
      toast(`${item.subject} ${v}% 저장되었습니다`);
      drawPlan();
    } catch (ex) { toast('저장 실패: ' + ex.message); }
  });

  /* ---------- 스톱워치 버튼 ---------- */
  async function loadSess() { try { st.sess = (await loadSessions(student.id)).active; } catch { st.sess = null; } paintFab(); }
  function paintFab() {
    const f = $('#fab'); if (!f) return;
    f.classList.toggle('on', !!st.sess && !st.sess.paused_at);
    $('#fab-t').textContent = st.sess ? clock(elapsedSec(st.sess)) : '';
  }
  let swOpen = false;
  const openSW = () => { swOpen = true; openStopwatch(student, {
    planSubjects: [...new Set(st.items.map((i) => i.subject))], onChange: () => { swOpen = false; loadSess(); },
  }); };
  $('#fab').addEventListener('click', openSW);
  // 2시간 확인 시점이 되면 스톱워치를 자동으로 열어 확인 팝업 표시
  const t = setInterval(() => {
    if (root._view !== token || !document.body.contains(root)) return clearInterval(t);
    paintFab();
    if (!swOpen && st.sess && !st.sess.paused_at && needsCheck(st.sess)) openSW();
  }, 1000);

  await Promise.all([loadAtt(), loadTT(), loadPlan(), loadSess()]);
}
