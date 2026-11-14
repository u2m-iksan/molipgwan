// 학생 앱 (태블릿 가로 우선): 위 = 등원 체크 · 이름 / 왼쪽 = 시간표 / 오른쪽 = 이번주 계획 + 오늘 진행률 / 오른쪽 아래 = 스톱워치
// 폰: 오늘 공부시간(누르면 스톱워치) + [시간표 | 이번주 계획] 옆으로 넘기기, 세로 스크롤 없음
import { mount, $, $$, esc, toast, sheet, BRAND, X } from '../ui.js';
import { DOW, today, mondayOf, short, isoDow, toMin, toTime, hm, addDays } from '../date.js';
import { loadStudentSchedules, loadVacations, withTerm, termOk } from '../data/schedules.js';
import { weekGrid, renderScheduleEditor } from '../teacher/schedule-editor.js';
import { academyStat, dayLabel } from '../data/academy.js';
import { segBar } from './progress-bar.js';
import { openStopwatch, clock } from './stopwatch.js';
import { openSelfPlan } from './self-plan.js';
import {
  loadOpenPlan, saveProgress, loadAttendance, attState, isSaturday, checkIn, addAttendance, autoCheckout,
  loadSessions, elapsedSec, needsCheck, loadWeekDone, selfPlanNeed,
} from '../data/student.js';

const REASONS = ['학원', '식사', '기타'];
const SUM = `<div><span>평균 이행도</span><b class="sum-pct">-</b></div>
        <button type="button" class="sum-wk" data-wk><span>이번 주 순공<em>›</em></span><b class="sum-week">-</b></button>
        <div><span>다음 코칭</span><b class="sum-coach">-</b></div>`;
const md = (d) => short(d).replace(/\(.\)/, '');

export async function renderStudentHome({ student, onLogout }) {
  const token = {};
  mount(`<div class="sa" id="sa">
    <header class="top"><div class="top-in">${BRAND}<div class="spacer"></div>
      <div class="sa-att" id="att"></div>
      <span class="chip">${esc(student.name)}</span>
      <button type="button" class="chip muted lo-btn" id="lo" aria-label="로그아웃"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg><span>로그아웃</span></button></div></header>
    <div class="sa-mtop">
      <button type="button" class="sa-today" id="today"><span class="sa-today-l"><i></i>오늘 공부시간</span><b id="today-t">0분</b><em>›</em></button>
      <div class="sa-sum" id="sum">
${SUM}
      </div>
      <div class="sa-pg" id="pg"><button type="button" data-p="0" class="on">시간표</button><button type="button" data-p="1">이번주 계획</button></div>
    </div>
    <main class="sa-main" id="sam">
      <section class="card sa-tt" id="tt"><div class="empty">불러오는 중</div></section>
      <div class="sa-col">
        <button type="button" class="sa-today sa-today-w" id="today2"><span class="sa-today-l"><i></i>오늘 공부시간</span><b id="today2-t">0분</b><em>›</em></button>
        <div class="sa-sum sa-sum-w">${SUM}</div>
        <section class="card sa-plan" id="plan"><div class="empty">불러오는 중</div></section>
      </div>
    </main>
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
    else if (s === '하원') el.innerHTML = `<span class="att-state">${last.auto ? '자동 하원' : '하원'} ${tm}</span>
      <button type="button" class="att-btn" id="att-in">다시 등원</button>`;
    else if (s === '외출') el.innerHTML = `<span class="att-state out" title="${esc(`외출 · ${last.reason || ''}${last.expect_back ? ` · ${hm(last.expect_back)} 복귀 예정` : ''}`)}">외출<span class="att-x"> 중 · ${esc(last.reason || '')}</span>${last.expect_back ? ` · ${hm(last.expect_back)}<span class="att-x"> 복귀</span>` : ''}</span>
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
  async function record(kind, reason = null, expectBack = null) {
    try { await addAttendance(student.id, kind, reason, false, expectBack); toast(`${kind} 처리되었습니다`); await loadAtt(); }
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
    $('.reason', m).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (kind !== '외출') { m.close(); return record(kind, b.dataset.r); }
      // 외출: 복귀 예정 시각 (학원이면 지금 걸린/곧 시작하는 학원 끝 + 20분, 그 외 1시간 후)
      const reason = b.dataset.r;
      const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const now = n.getHours() * 60 + n.getMinutes();
      let back = now + 60;
      if (reason === '학원') {
        try {
          const rows = withTerm(await loadStudentSchedules(student.id), student.school, await loadVacations());
          const blk = rows.filter((r) => r.category === '학원' && r.weekday === isoDow(today()) && r.valid_from <= today() && (!r.valid_to || r.valid_to >= today()) && termOk(r, rows.termAt(today())))
            .find((r) => toMin(r.end_time) > now && toMin(r.start_time) <= now + 60);
          back = blk ? toMin(blk.end_time) + 20 : now + 120;
        } catch { back = now + 120; }
      }
      back = Math.min(Math.ceil(back / 10) * 10, 23 * 60 + 50);
      $('.drawer-body', m).innerHTML = `<p class="desc-s">${esc(reason)} · 복귀 예정 시각을 확인하세요.</p>
        <div class="back-row"><div class="input"><input type="time" id="bk" value="${toTime(back)}" step="600"></div>
          <div class="chips">${[30, 60, 120].map((x) => `<button type="button" class="chip-t" data-add="${x}">${x < 60 ? x + '분' : x / 60 + '시간'} 후</button>`).join('')}</div></div>
        <button type="button" class="btn btn-primary btn-block" id="bk-go">외출</button>`;
      $$('[data-add]', m).forEach((c) => c.addEventListener('click', () => { $('#bk', m).value = toTime(Math.min(now + Number(c.dataset.add), 23 * 60 + 59)); }));
      $('#bk-go', m).addEventListener('click', () => { m.close(); record('외출', reason, $('#bk', m).value || null); });
    });
  }

  /* ---------- 시간표 (화면 높이에 맞춤) ---------- */
  async function loadTT() {
    const el = $('#tt');
    try {
      const rows = withTerm(await loadStudentSchedules(student.id), student.school, await loadVacations());
      st.sched = rows; paintSum(); drawPlan();
      let lastKey = '';
      const draw = () => {
        if (root._view !== token || !$('#tt')) return;
        const key = `${el.clientWidth}x${el.clientHeight}`;
        if (key === lastKey && el.querySelector('.wk-grid')) return;   // 크기 그대로면 다시 그리지 않음
        lastKey = key;
        // 학교 있는 주중은 학교 시간을 줄이고 오후·저녁을 크게 (주말·학교 없는 주는 고르게)
        const paint = (h) => { el.innerHTML = `<div class="sa-h"><h3>이번 주 시간표</h3><span>${md(mondayOf(today()))} 주${rows.termAt?.(today()) === '방학' ? ' · 방학' : ''}</span><button type="button" class="link-s sa-edit" id="tt-edit">학원 일정</button></div>${weekGrid(rows, mondayOf(today()), today(), 40, { fitH: h, squeezeSchool: true, nowLine: true })}`; };
        const min = innerWidth <= 820 ? 200 : 330;
        let h = Math.max(min, el.clientHeight - 100);
        paint(h);
        // 카드 안에 다 들어오게: 넘친 만큼 줄여서 다시 그리기 (23시까지 안 잘리게)
        const g = el.querySelector('.wk-grid');
        const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
        const over = g.getBoundingClientRect().bottom - (el.getBoundingClientRect().bottom - pb);
        if (Math.abs(over) > 1) { h = Math.max(min, h - over); paint(h); }
      };
      draw();
      new ResizeObserver(() => draw()).observe($('.sa-main'));
      addEventListener('resize', draw);
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
  /* ---------- 폰: 이번주 한눈 요약 (평균 이행도 · 이번 주 순공 · 다음 코칭) ---------- */
  function paintSum() {
    const set = (k, v) => $$('.sum-' + k).forEach((e) => { e.textContent = v; });
    set('pct', st.items.length ? `${Math.round(st.items.reduce((a, i) => a + lastPct(i.id), 0) / st.items.length)}%` : '-');
    const wk = (st.weekDone || 0) + (st.sess ? elapsedSec(st.sess) : 0) + (st.doneSec || 0) - (st.todayDoneInWeek || 0);
    const m = Math.floor(wk / 60);
    set('week', `${Math.floor(m / 60)}시간 ${m % 60}분`);
    set('coach', nextCoach());
  }
  function nextCoach() {
    const rows = (st.sched || []).filter((r) => r.category === '코칭');
    if (!rows.length) return '-';
    const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const now = n.getHours() * 60 + n.getMinutes();
    for (let k = 0; k < 14; k++) {
      const d = addDays(today(), k);
      const r = rows.find((x) => x.weekday === isoDow(d) && x.valid_from <= d && (!x.valid_to || x.valid_to >= d));
      if (!r || (k === 0 && toMin(r.end_time) <= now)) continue;
      return k === 0 ? `오늘 ${hm(r.start_time)}` : `D-${k}`;
    }
    return '-';
  }
  const ac = (i) => academyStat(i, st.plan, st.sched || [], st.progress.get(i.id));
  const lastPct = (id) => {
    const it = st.items.find((x) => x.id === id);
    if (it?.academy && st.plan) return ac(it).rate ?? 0;
    const h = st.progress.get(id) || []; return h.length ? h[h.length - 1].pct : 0;
  };
  const todayPct = (id) => (st.progress.get(id) || []).find((r) => r.on_date === today())?.pct;
  function drawPlan() {
    const el = $('#plan');
    // 보강 대상(상담일 지남 · 새 계획 없음) · 계획 없음 → 직접 계획 세우기
    const need = st.sched ? selfPlanNeed(st.plan, st.sched) : null;
    const spBtn = need ? `<div class="sa-self ${need.reason}"><div><b>${need.reason === 'makeup' ? '이번 주 상담을 하지 못했습니다' : '진행 중인 계획이 없습니다'}</b>
      <span>${need.reason === 'makeup' ? `다음 상담(${md(need.due)})까지의 계획을 직접 세우세요. 토요일 보강 때 함께 점검합니다.` : `다음 상담(${md(need.due)})까지의 계획을 직접 세우세요.`}</span></div>
      <button type="button" class="btn btn-primary btn-sm" id="sp-open">계획 세우기</button></div>` : '';
    if (!st.plan) {
      el.innerHTML = `<div class="sa-h"><h3>이번주 계획</h3></div>${spBtn || '<div class="sa-empty"><b>진행 중인 계획이 없습니다.</b>상담에서 계획을 세웁니다.</div>'}`;
      $('#sp-open')?.addEventListener('click', () => openSelfPlan(student, { plan: null, items: [], sched: st.sched, need, onSaved: loadPlan }));
      paintSum();
      return;
    }
    const p = st.plan;
    el.innerHTML = `<div class="sa-h"><h3>이번주 계획</h3><span>${md(p.start_date)} – ${p.due_date ? md(p.due_date) : ''}</span></div>${spBtn}
      <ul class="sa-items">${st.items.map((i) => {
        if (i.academy) {
          // 학원 숙제: 학원 가는 날마다 해갔는지 체크
          const a = ac(i);
          return `<li class="sa-item ac" data-id="${esc(i.id)}">
            <div class="sa-item-h">
              <span class="sa-sub">${esc(i.subject)}${i.subject_detail ? `<small>${esc(i.subject_detail)}</small>` : ''}</span>
              <span class="sa-title">${esc(i.title)}${i.title.trim() === '학원 숙제' ? '' : '<em class="pl-ac">학원 숙제</em>'}</span>
              <b class="sa-pct">${a.total ? `${a.done}/${a.total}회` : '-'}</b>
            </div>
            <div class="sa-ac">${a.dates.length ? a.dates.map((d) => {
              const v = a.checks.get(d), fut = d > today();
              return `<button type="button" class="sa-ac-d ${v === true ? 'ok' : v === false ? 'no' : ''}" data-ac-d="${d}"${fut ? ' disabled' : ''}>
                <span>${dayLabel(d)}</span><b>${v === true ? '해감' : v === false ? '안 해감' : fut ? '예정' : '체크'}</b></button>`;
            }).join('') : '<span class="sa-ac-none">이번 기간에 학원 일정이 없습니다.</span>'}</div>
          </li>`;
        }
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
    $('#sp-open')?.addEventListener('click', () => openSelfPlan(student, { plan: st.plan, items: st.items, sched: st.sched, need, onSaved: loadPlan }));
    paintSum();
  }
  $('#plan').addEventListener('click', async (e) => {
    const acb = e.target.closest('[data-ac-d]');
    if (acb) {
      // 체크 안 함 → 해감 → 안 해감 → 해감 …
      const item = st.items.find((i) => i.id === acb.closest('.sa-item').dataset.id), d = acb.dataset.acD;
      const cur = (st.progress.get(item.id) || []).find((r) => r.on_date === d);
      const v = cur && cur.pct >= 100 ? 0 : 100;
      try {
        await saveProgress(item, v, d);
        const h = (st.progress.get(item.id) || []).filter((r) => r.on_date !== d);
        h.push({ item_id: item.id, on_date: d, pct: v }); h.sort((x, y) => (x.on_date < y.on_date ? -1 : 1));
        st.progress.set(item.id, h);
        drawPlan();
      } catch (ex) { toast('저장 실패: ' + ex.message); }
      return;
    }
    const tg = e.target.closest('[data-tg]');
    if (tg) {
      st.open = st.open === tg.dataset.tg ? null : tg.dataset.tg; drawPlan();
      // 펼친 칸만 부드럽게 열림
      const pick = st.open && document.querySelector(`.sa-item[data-id="${CSS.escape(st.open)}"] .sa-pick`);
      if (pick) { pick.classList.add('sa-open-in'); pick.addEventListener('animationend', () => pick.classList.remove('sa-open-in'), { once: true }); }
      return;
    }
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
  async function loadSess() {
    try { const r = await loadSessions(student.id); st.sess = r.active; st.doneSec = r.doneSec; st.bySub = r.bySub; } catch { st.sess = null; }
    try { const w = await loadWeekDone(student.id); Object.assign(st, { weekDone: w.weekDone, todayDoneInWeek: w.todayDone, weekBySub: w.weekBySub, todayBySub: w.todayBySub }); } catch { /* 요약만 비움 */ }
    paintFab(); paintSum();
  }
  function paintFab() {
    // "오늘 공부시간" (오늘 누적 = 끝난 세션 + 지금 세션) — 폰은 위쪽, 태블릿·PC는 이번주 계획 위
    const sec = (st.doneSec || 0) + (st.sess ? elapsedSec(st.sess) : 0);
    const on = !!st.sess && !st.sess.paused_at;
    const txt = on ? clock(sec) : `${Math.floor(sec / 3600)}시간 ${Math.floor(sec / 60) % 60}분`;
    for (const id of ['today', 'today2']) {
      const b = $('#' + id); if (!b) continue;
      $('#' + id + '-t').textContent = txt; b.classList.toggle('on', on);
    }
    paintSum();
  }
  // 이번 주 과목별 순공 (끝난 세션 + 지금 세션)
  function weekModal() {
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    const wk = new Map(st.weekBySub || []), td = new Map(st.bySub || []);
    for (const [k, v] of st.todayBySub || []) add(wk, k, -v);
    for (const [k, v] of td) add(wk, k, v);
    if (st.sess) { const e = elapsedSec(st.sess); add(wk, st.sess.subject, e); add(td, st.sess.subject, e); }
    const rows = [...wk.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((a, [, v]) => a + v, 0), max = rows[0]?.[1] || 1;
    const hm_ = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
    const mon = mondayOf(today());
    sheet(`<div class="modal modal-s" role="dialog" aria-label="이번 주 순공">
      <div class="drawer-head"><h3>이번 주 순공</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body">
        <div class="wk-total"><span>${md(mon)} – ${md(addDays(mon, 6))}</span><b>${hm_(total)}</b></div>
        ${rows.length ? `<ul class="wk-subs">${rows.map(([k, v]) => `<li>
          <span class="wk-s">${esc(k)}</span>
          <div class="wk-bar"><i style="width:${Math.max(3, Math.round((v / max) * 100))}%"></i></div>
          <span class="wk-v"><b>${hm_(v)}</b>${td.get(k) ? `<small>오늘 ${hm_(td.get(k))}</small>` : ''}</span></li>`).join('')}</ul>`
          : '<p class="sa-empty">이번 주 기록이 없습니다.</p>'}
      </div></div>`, 'center');
  }
  root.addEventListener('click', (e) => { if (e.target.closest('[data-wk]')) weekModal(); });
  let swOpen = false;
  const openSW = () => { swOpen = true; openStopwatch(student, {
    planSubjects: [...new Set(st.items.map((i) => i.subject))], onChange: () => { swOpen = false; loadSess(); },
  }); };
  $('#today2').addEventListener('click', openSW);
  $('#today').addEventListener('click', openSW);
  // 폰: 시간표 | 이번주 계획 옆으로 넘기기
  const sam = $('#sam'), pg = $('#pg');
  pg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) sam.scrollTo({ left: Number(b.dataset.p) * sam.clientWidth, behavior: 'smooth' }); });
  // 폰: 흰 선택 표시가 손가락으로 넘기는 만큼 실시간으로 따라 움직임
  const ind = document.createElement('i'); ind.className = 'sa-pg-ind'; pg.prepend(ind);
  const follow = () => {
    const max = Math.max(1, sam.scrollWidth - sam.clientWidth), k = Math.min(1, Math.max(0, sam.scrollLeft / max));
    const b0 = pg.querySelector('[data-p="0"]'), b1 = pg.querySelector('[data-p="1"]');
    if (!b0?.offsetWidth) return;
    ind.style.width = `${b0.offsetWidth}px`;
    ind.style.transform = `translateX(${b0.offsetLeft + (b1.offsetLeft - b0.offsetLeft) * k}px)`;
  };
  sam.addEventListener('scroll', () => {
    const i = Math.round(sam.scrollLeft / Math.max(1, sam.clientWidth));
    $$('button', pg).forEach((b) => b.classList.toggle('on', Number(b.dataset.p) === i));
    follow();
  }, { passive: true });
  addEventListener('resize', follow); requestAnimationFrame(follow);
  // 2시간 확인 시점이 되면 스톱워치를 자동으로 열어 확인 팝업 표시
  const t = setInterval(() => {
    if (root._view !== token || !document.body.contains(root)) return clearInterval(t);
    paintFab();
    if (!swOpen && st.sess && !st.sess.paused_at && needsCheck(st.sess)) openSW();
  }, 1000);

  await Promise.all([loadAtt(), loadTT(), loadPlan(), loadSess()]);
}
