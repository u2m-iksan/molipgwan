// 선생님 · 코칭: 맨 위 이전/현재/다음 타임 → 아래 코칭 요일별 시간표(보기용)
// 코칭 타임 배정·변경은 학생 관리 탭(학생 클릭 → 일정)에서 함. 여기서 이름을 누르면 상담이 열림.
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { DOW, today, isoDow, toMin, toTime, hm } from '../date.js';
import { loadStudents } from '../data/students.js';
import { loadWeekCoachings, loadOpenPlans, scheduledOn } from '../data/coaching.js';
import { getCoachConfig, saveCoachConfig, slotTimes, loadCoachingSlots, loadAllFixedSchedules } from '../data/schedules.js';

export async function renderCoaching(body) {
  const st = { cfg: null, students: [], slots: new Map(), fixed: [], done: new Map(), open: new Map() };
  const token = {}; body._view = token;   // 다른 탭으로 바뀌면 타이머 중지용

  body.innerHTML = `
    <div class="t-head">
      <h2>코칭 <span class="count" id="cfgLabel"></span></h2>
      <div class="spacer"></div>
      <button type="button" class="btn btn-gray btn-sm" id="cfgBtn">설정</button>
    </div>
    <section class="now-row" id="now"></section>
    <div class="coach-wrap">
      <div class="card table-card coach-grid" id="grid"><div class="empty">불러오는 중</div></div>
      <aside class="card coach-side" id="side"></aside>
    </div>`;

  $('#cfgBtn').addEventListener('click', openSettings);

  async function reload() {
    try {
      const [cfg, students, slots, fixed, done, open] = await Promise.all([
        getCoachConfig(), loadStudents(), loadCoachingSlots(), loadAllFixedSchedules(), loadWeekCoachings(), loadOpenPlans()]);
      Object.assign(st, { cfg, students: students.filter((s) => s.status === '재원'), slots, fixed, done, open });
      draw();
    } catch (e) {
      $('#grid').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`;
    }
  }

  const who = (d, t) => st.students.filter((s) => {
    const sl = st.slots.get(s.id);
    return sl && sl.weekday === d && hm(sl.start_time) === t;
  });

  function conflict(sid, slot) {
    const a = toMin(slot.start_time), b = toMin(slot.end_time);
    return st.fixed.find((f) => f.student_id === sid && f.weekday === slot.weekday && toMin(f.start_time) < b && toMin(f.end_time) > a);
  }

  const chip = (s, slot, big = false) => {
    const c = slot && conflict(s.id, slot);
    const dn = st.done.get(s.id);
    const state = dn ? (dn.kind === '결석' ? ' absent' : ' done') : '';
    return `<button type="button" class="stu${big ? ' big' : ''}${c ? ' warn' : ''}${state}" data-sid="${esc(s.id)}"
      title="${c ? esc(`${c.title} ${hm(c.start_time)}~${hm(c.end_time)}와 겹침`) : ''}">
      ${dn ? `<span class="ok-ic">${dn.kind === '결석' ? '결' : '✓'}</span>` : ''}${s.seat_no ? `<i>${esc(s.seat_no)}</i>` : ''}${esc(s.name)}<small>${esc(s.grade)}</small></button>`;
  };

  /* ---------- 이전 · 현재 · 다음 타임 ---------- */
  function nowSlots() {
    const { cfg } = st;
    const days = [...cfg.days].sort();
    const times = slotTimes(cfg);
    const all = [];
    for (const d of days) for (const t of times) all.push({ d, t, s: (d - 1) * 1440 + toMin(t) });
    if (!all.length) return {};
    const clock = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
    const nowAbs = (isoDow(today()) - 1) * 1440 + toMin(clock);
    const cur = all.find((x) => x.s <= nowAbs && nowAbs < x.s + cfg.minutes);
    const prev = [...all].reverse().find((x) => x.s + cfg.minutes <= nowAbs) || all[all.length - 1];
    const next = all.find((x) => x.s > nowAbs) || all[0];
    return { prev, cur, next };
  }

  function drawNow() {
    const el = $('#now');
    if (!el) return;
    const { prev, cur, next } = nowSlots();
    const todayDow = isoDow(today());
    const label = (x) => `${x.d === todayDow ? '오늘' : DOW[x.d] + '요일'} ${x.t}~${toTime(toMin(x.t) + st.cfg.minutes)}`;
    const card = (title, x, cls) => {
      const list = x ? who(x.d, x.t) : [];
      return `<div class="now-card ${cls}">
        <div class="now-top"><span class="now-tag">${title}</span><span class="now-time">${x ? label(x) : '진행 중인 타임 없음'}</span></div>
        <div class="now-list">${x ? (list.map((s) => chip(s, st.slots.get(s.id), true)).join('') || '<span class="sub">배정 없음</span>') : ''}</div>
      </div>`;
    };
    el.innerHTML = card('이전', prev, 'prev') + card('현재', cur, 'cur') + card('다음', next, 'next');
    $$('.stu', el).forEach(wireChip);
  }

  function wireChip(b) {
    b.addEventListener('click', () => {
      const s = st.students.find((x) => x.id === b.dataset.sid);
      const sl = st.slots.get(s.id);
      if (!sl) { location.hash = `#/students?open=${s.id}`; return; }   // 미배정 → 일정에서 배정
      location.hash = `#/consult?sid=${s.id}&on=${scheduledOn(sl.weekday)}`;
    });
  }

  /* ---------- 시간표 ---------- */
  function draw() {
    const { cfg } = st;
    const days = [...cfg.days].sort();
    const times = slotTimes(cfg);
    $('#cfgLabel').textContent = `${days.map((d) => DOW[d]).join('·')} ${cfg.start}~${cfg.end} · ${cfg.minutes}분`;
    drawNow();

    const { cur } = nowSlots();
    const td = isoDow(today());
    $('#grid').innerHTML = `
      <table class="tt">
        <thead><tr><th class="tt-time"></th>${days.map((d) => `<th>${DOW[d]}요일${d === td ? ' <span class="today">오늘</span>' : ''}</th>`).join('')}</tr></thead>
        <tbody>${times.map((t) => `
          <tr><th class="tt-time">${t}<small>~${toTime(toMin(t) + cfg.minutes)}</small></th>
            ${days.map((d) => {
              const list = who(d, t);
              const isCur = cur && cur.d === d && cur.t === t;
              return `<td class="cell${list.length > 1 ? ' multi' : ''}${isCur ? ' cur' : ''}">${list.map((s) => chip(s, st.slots.get(s.id))).join('')}</td>`;
            }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    const inGrid = (sl) => sl && days.includes(sl.weekday) && times.includes(hm(sl.start_time));
    const none = st.students.filter((s) => !st.slots.get(s.id));
    const out = st.students.filter((s) => st.slots.get(s.id) && !inGrid(st.slots.get(s.id)));
    const td0 = today();
    const makeup = st.students.filter((s) => {
      const sl = st.slots.get(s.id);
      return sl && scheduledOn(sl.weekday) < td0 && !st.done.has(s.id);
    });
    const doneN = st.students.filter((s) => st.done.has(s.id)).length;
    $('#side').innerHTML = `
      <div class="side-sec"><h4>이번 주 상담</h4><p class="big">${doneN}<span> / ${st.students.length - none.length}명</span></p></div>
      ${makeup.length ? `<div class="side-sec"><h4 class="red">보강 대상 ${makeup.length}</h4>
        <p class="sub-s">토요일까지 상담하지 않으면 결석 처리합니다.</p>
        <div class="stu-list">${makeup.map((s) => { const sl = st.slots.get(s.id); const p = st.open.get(s.id);
          const self = p && p.author_role === '학생' && p.start_date >= scheduledOn(sl.weekday);
          return chip(s) + `<span class="was ${self ? 'ok' : ''}">${self ? '계획 작성함' : '계획 미작성'}</span>`; }).join('')}</div></div>` : ''}
      <div class="side-sec"><h4>배정 현황</h4><p class="big">${st.students.length - none.length}<span> / ${st.students.length}명</span></p></div>
      ${out.length ? `<div class="side-sec"><h4 class="red">재배정 필요 ${out.length}</h4>
        <p class="sub-s">현재 설정 밖의 시간에 배정되어 있습니다.</p>
        <div class="stu-list">${out.map((s) => { const sl = st.slots.get(s.id); return chip(s) + `<span class="was">${DOW[sl.weekday]} ${hm(sl.start_time)}</span>`; }).join('')}</div></div>` : ''}
      <div class="side-sec"><h4>미배정 ${none.length}</h4>
        <div class="stu-list">${none.map((s) => chip(s)).join('') || '<p class="sub-s">모든 학생이 배정되었습니다.</p>'}</div></div>
      <p class="sub-s">이름을 누르면 상담이 열립니다. 코칭 시간 변경은 학생 관리에서 합니다.</p>`;

    $$('#grid .stu, #side .stu').forEach(wireChip);
  }

  // 1분마다 이전/현재/다음 갱신 (탭을 떠나면 자동 중지)
  const timer = setInterval(() => {
    if (body._view !== token) return clearInterval(timer);
    if (st.cfg) draw();
  }, 60000);

  /* ---------- 설정 ---------- */
  function openSettings() {
    const c = { ...st.cfg, days: [...st.cfg.days] };
    const opts = [];
    for (let m = 14 * 60; m <= 24 * 60; m += 30) opts.push(toTime(m));
    const panel = sheet(`
      <form class="modal modal-s" id="cf" novalidate>
        <div class="drawer-head"><h3>코칭 설정</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
        <div class="drawer-body">
          <div class="field"><span class="lbl">코칭 요일</span>
            <div class="chips" id="c-days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" class="chip-t" data-v="${d}">${DOW[d]}</button>`).join('')}</div></div>
          <div class="row2">
            <div class="field"><label for="c-start">시작</label><div class="input"><select id="c-start">${opts.map((o) => `<option${o === c.start ? ' selected' : ''}>${o}</option>`).join('')}</select></div></div>
            <div class="field"><label for="c-end">종료</label><div class="input"><select id="c-end">${opts.map((o) => `<option${o === c.end ? ' selected' : ''}>${o}</option>`).join('')}</select></div></div>
          </div>
          <div class="field"><span class="lbl">한 타임</span>
            <div class="seg seg-wide" id="c-min">${[20, 30, 40, 60].map((m) => `<button type="button" data-v="${m}">${m}분</button>`).join('')}</div></div>
          <p class="hint">변경 후 설정 밖의 시간에 배정된 학생은 "재배정 필요"로 표시됩니다.</p>
          <p class="err" id="c-err" role="alert"></p>
        </div>
        <div class="drawer-foot"><div class="spacer"></div>
          <button type="button" class="btn btn-gray btn-sm" data-close>취소</button>
          <button type="submit" class="btn btn-primary btn-sm">저장</button></div>
      </form>`, 'center');

    const paint = () => {
      $$('#c-days button', panel).forEach((b) => b.classList.toggle('on', c.days.includes(Number(b.dataset.v))));
      $$('#c-min button', panel).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === c.minutes));
    };
    $('#c-days', panel).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = Number(b.dataset.v);
      c.days = c.days.includes(d) ? c.days.filter((x) => x !== d) : [...c.days, d].sort();
      paint();
    });
    $('#c-min', panel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { c.minutes = Number(b.dataset.v); paint(); } });
    paint();

    $('#cf', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      c.start = $('#c-start', panel).value; c.end = $('#c-end', panel).value;
      const err = $('#c-err', panel);
      if (!c.days.length) return (err.textContent = '요일을 하나 이상 선택하세요.');
      if (toMin(c.end) - toMin(c.start) < c.minutes) return (err.textContent = '시작·종료 시각을 확인하세요.');
      try { await saveCoachConfig(c); panel.close(); toast('설정이 저장되었습니다'); st.cfg = c; draw(); }
      catch (ex) { err.textContent = '저장 실패: ' + ex.message; }
    });
  }

  await reload();
}
