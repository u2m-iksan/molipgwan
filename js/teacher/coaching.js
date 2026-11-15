// 선생님 · 코칭: 맨 위 이전/현재/다음 타임 → 아래 코칭 요일별 시간표(보기용)
// 이름을 누르면 상담이 열림 · [시간 변경]을 켜면 학생을 끌어다(또는 눌러서) 다른 칸으로 옮겨 코칭 시간을 바꿈 (오늘부터 적용)
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { DOW, today, isoDow, toMin, toTime, hm, mondayOf, addDays, short } from '../date.js';
import { loadStudents } from '../data/students.js';
import { loadWeekCoachings, loadOpenPlans, scheduledOn } from '../data/coaching.js';
import { getCoachConfig, saveCoachConfig, slotTimes, loadCoachingSlots, loadAllFixedSchedules, setCoachingSlot } from '../data/schedules.js';

const SEEN = new Set();
export async function renderCoaching(body) {
  const thisMon = mondayOf(today());
  const WEEKS = 4;   // 이번 주 포함 4주까지 넘겨 보기
  const st = { cfg: null, students: [], slots: new Map(), fixed: [], done: new Map(), open: new Map(), mon: thisMon, edit: false, sel: null, busy: false };
  const isNow = () => st.mon === thisMon;
  const md = (d) => short(d).replace(/\(.\)/, '');
  const weekName = (mon) => `${Number(mon.slice(5, 7))}월 ${Math.ceil(Number(mon.slice(8, 10)) / 7)}주`;
  const onDay = (weekday) => scheduledOn(weekday, st.mon);
  const token = {}; body._view = token;   // 다른 탭으로 바뀌면 타이머 중지용

  body.innerHTML = `
    <div class="t-head">
      <div class="wk-nav co-wk"><button type="button" class="icon-btn sm" id="co-prev" aria-label="이전 주"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <h2 id="co-title"></h2>
        <button type="button" class="icon-btn sm" id="co-next" aria-label="다음 주"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <span class="count" id="cfgLabel"></span>
      <div class="spacer"></div>
      <button type="button" class="btn btn-gray btn-sm" id="co-today" hidden>이번 주로</button>
      <button type="button" class="btn btn-gray btn-sm" id="co-edit">시간 변경</button>
      <button type="button" class="btn btn-gray btn-sm" id="cfgBtn">설정</button>
    </div>
    <div class="co-editbar" id="co-editbar" hidden><span>학생을 끌어서 옮기거나, 누른 다음 옮길 칸을 누르세요 · <b>오늘부터</b> 적용 · 미배정 칸에 놓으면 해제</span>
      <button type="button" class="btn btn-primary btn-sm" id="co-done">완료</button></div>
    <section class="now-row" id="now"></section>
    <div class="coach-wrap">
      <div class="card table-card coach-grid" id="grid"><div class="empty">불러오는 중</div></div>
      <aside class="card coach-side" id="side"></aside>
    </div>`;

  $('#cfgBtn').addEventListener('click', openSettings);
  const setEdit = (on) => {
    st.edit = on; st.sel = null;
    if (on && !isNow()) { st.mon = thisMon; reload(); }
    $('#co-edit').classList.toggle('btn-primary', on); $('#co-edit').classList.toggle('btn-gray', !on);
    $('#co-editbar').hidden = !on;
    $('.coach-wrap').classList.toggle('picking', on);
    if (st.cfg) draw();
  };
  $('#co-edit').addEventListener('click', () => setEdit(!st.edit));
  $('#co-done').addEventListener('click', () => setEdit(false));
  const go = (mon) => { st.mon = mon; reload(); };
  $('#co-prev').addEventListener('click', () => { if (st.mon > addDays(thisMon, -7 * (WEEKS - 1))) go(addDays(st.mon, -7)); });
  $('#co-next').addEventListener('click', () => { if (st.mon < thisMon) go(addDays(st.mon, 7)); });
  $('#co-today').addEventListener('click', () => go(thisMon));
  function paintWeek() {
    $('#co-title').textContent = `${weekName(st.mon)} 코칭`;
    $('#co-prev').disabled = st.mon <= addDays(thisMon, -7 * (WEEKS - 1));
    $('#co-next').disabled = st.mon >= thisMon;
    $('#co-today').hidden = isNow();
    $('#now').hidden = !isNow();
  }

  async function reload() {
    try {
      const [cfg, students, slots, fixed, done, open] = await Promise.all([
        getCoachConfig(), loadStudents(), loadCoachingSlots(), loadAllFixedSchedules(), loadWeekCoachings(st.mon), loadOpenPlans()]);
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
    // 결석 · 2단계까지 완료(초록 ●) · 1단계만(주황 ▲)
    const state = dn ? (dn.kind === '결석' ? ' absent' : dn.reported ? ' done' : ' half') : '';
    // 체크는 처음 생길 때만 톡 튀게 (1분마다 다시 그려도 그대로)
    const ck = dn ? `${s.id}:${st.mon}:${state}` : '';
    const old = ck && SEEN.has(ck); if (ck) SEEN.add(ck);
    return `<button type="button" class="stu${big ? ' big' : ''}${c ? ' warn' : ''}${state}${old ? ' ck-old' : ''}" data-sid="${esc(s.id)}"
      title="${esc(`${s.name} ${s.grade}`)}${c ? esc(` · ${c.title} ${hm(c.start_time)}~${hm(c.end_time)}와 겹침`) : ''}">
      ${dn ? `<span class="ok-ic" aria-label="${dn.kind === '결석' ? '결석' : dn.reported ? '상담 완료' : '1단계만 저장'}">${dn.kind === '결석' ? '결' : dn.reported ? '✓' : '!'}</span>` : ''}${s.seat_no ? `<i>${esc(s.seat_no)}</i>` : ''}<span class="nm">${esc(s.name)}</span><small>${esc(s.grade)}</small></button>`;
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
      if (st.edit) { st.sel = st.sel === b.dataset.sid ? null : b.dataset.sid; $$('.coach-wrap .stu').forEach((x) => x.classList.toggle('sel', x.dataset.sid === st.sel)); return; }
      const s = st.students.find((x) => x.id === b.dataset.sid);
      const sl = st.slots.get(s.id);
      if (!sl) { location.hash = `#/students?open=${s.id}`; return; }   // 미배정 → 일정에서 배정
      location.hash = `#/consult?sid=${s.id}&on=${onDay(sl.weekday)}`;
    });
  }

  /* ---------- 시간표 ---------- */
  function draw() {
    const { cfg } = st;
    const days = [...cfg.days].sort();
    const times = slotTimes(cfg);
    $('#cfgLabel').textContent = `${md(st.mon)} – ${md(addDays(st.mon, 6))} · ${days.map((d) => DOW[d]).join('·')} ${cfg.start}~${cfg.end}`;
    paintWeek();
    if (isNow()) drawNow();

    const { cur } = nowSlots();
    const td = isoDow(today());
    $('#grid').innerHTML = `
      <table class="tt">
        <thead><tr><th class="tt-time"></th>${days.map((d) => `<th>${DOW[d]}요일 <small class="tt-date">${md(onDay(d)).replace(/^\d+\//, '')}일</small>${isNow() && d === td ? ' <span class="today">오늘</span>' : ''}</th>`).join('')}</tr></thead>
        <tbody>${times.map((t) => `
          <tr><th class="tt-time">${t}<small>~${toTime(toMin(t) + cfg.minutes)}</small></th>
            ${days.map((d) => {
              const list = who(d, t);
              const isCur = isNow() && cur && cur.d === d && cur.t === t;
              return `<td class="cell${list.length > 1 ? ' multi' : ''}${isCur ? ' cur' : ''}" data-d="${d}" data-t="${t}">${list.map((s) => chip(s, st.slots.get(s.id))).join('')}</td>`;
            }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    const inGrid = (sl) => sl && days.includes(sl.weekday) && times.includes(hm(sl.start_time));
    const none = st.students.filter((s) => !st.slots.get(s.id));
    const out = st.students.filter((s) => st.slots.get(s.id) && !inGrid(st.slots.get(s.id)));
    const td0 = today();
    const makeup = st.students.filter((s) => {
      const sl = st.slots.get(s.id);
      return sl && onDay(sl.weekday) < td0 && !st.done.has(s.id);
    });
    const doneN = st.students.filter((s) => st.done.has(s.id) && (st.done.get(s.id).reported || st.done.get(s.id).kind === '결석')).length;
    const halfN = st.students.filter((s) => st.done.has(s.id) && !st.done.get(s.id).reported && st.done.get(s.id).kind !== '결석').length;
    $('#side').innerHTML = `
      <div class="side-sec"><h4>${isNow() ? '이번 주' : weekName(st.mon)} 상담</h4><p class="big">${doneN}<span> / ${st.students.length - none.length}명</span></p>
        <p class="co-legend"><span class="lg done">✓</span>완료 ${doneN}<span class="lg half">!</span>보고 작성 전 ${halfN}</p></div>
      ${makeup.length ? `<div class="side-sec"><h4 class="red">${isNow() ? '보강 대상' : '상담 안 함'} ${makeup.length}</h4>
        <p class="sub-s">${isNow() ? '토요일까지 상담하지 않으면 결석 처리합니다.' : '이름을 누르면 그 주 상담을 열 수 있습니다.'}</p>
        <div class="stu-list">${makeup.map((s) => { const sl = st.slots.get(s.id); const p = st.open.get(s.id);
          const self = p && p.author_role === '학생' && p.start_date >= onDay(sl.weekday);
          return chip(s) + `<span class="was ${self ? 'ok' : ''}">${self ? '계획 작성함' : '계획 미작성'}</span>`; }).join('')}</div></div>` : ''}
      <div class="side-sec"><h4>배정 현황</h4><p class="big">${st.students.length - none.length}<span> / ${st.students.length}명</span></p></div>
      ${out.length ? `<div class="side-sec"><h4 class="red">재배정 필요 ${out.length}</h4>
        <p class="sub-s">현재 설정 밖의 시간에 배정되어 있습니다.</p>
        <div class="stu-list">${out.map((s) => { const sl = st.slots.get(s.id); return chip(s) + `<span class="was">${DOW[sl.weekday]} ${hm(sl.start_time)}</span>`; }).join('')}</div></div>` : ''}
      <div class="side-sec co-none" id="co-none"><h4>미배정 ${none.length}</h4>
        <div class="stu-list">${none.map((s) => chip(s)).join('') || '<p class="sub-s">모든 학생이 배정되었습니다.</p>'}</div></div>
      <p class="sub-s">이름을 누르면 상담이 열립니다. 코칭 시간은 위 [시간 변경]으로 바꿉니다.</p>`;

    $$('#grid .stu, #side .stu').forEach(wireChip);
    if (st.edit) wireEdit();
  }

  /* ---------- 시간 변경 (편집 모드) ---------- */
  async function moveTo(sid, slot) {
    if (st.busy) return;
    const s = st.students.find((x) => x.id === sid); if (!s) return;
    const cur = st.slots.get(sid);
    if (slot && cur && cur.weekday === slot.weekday && hm(cur.start_time) === slot.start) { st.sel = null; draw(); return; }
    if (!slot && !cur) { st.sel = null; draw(); return; }
    st.busy = true;
    try {
      await setCoachingSlot(sid, slot, st.cfg);
      st.slots = await loadCoachingSlots();
      const c = slot && conflict(sid, { weekday: slot.weekday, start_time: slot.start, end_time: toTime(toMin(slot.start) + st.cfg.minutes) });
      toast(slot ? `${s.name} → ${DOW[slot.weekday]} ${slot.start}${c ? ` · ${c.title}와 겹쳐요` : ''}` : `${s.name} 코칭 배정 해제`, c ? 'bad' : undefined);
    } catch (e) { toast('저장 실패: ' + e.message, 'bad'); }
    st.busy = false; st.sel = null; draw();
  }
  function wireEdit() {
    $$('#grid .stu, #side .stu').forEach((b) => {
      b.draggable = true;
      if (b.dataset.sid === st.sel) b.classList.add('sel');
      b.addEventListener('dragstart', (e) => { st.sel = b.dataset.sid; e.dataTransfer.setData('text/plain', b.dataset.sid); e.dataTransfer.effectAllowed = 'move'; b.classList.add('drag'); });
      b.addEventListener('dragend', () => b.classList.remove('drag'));
    });
    const drop = (el, slotOf) => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const sid = e.dataTransfer.getData('text/plain') || st.sel; if (sid) moveTo(sid, slotOf()); });
      el.addEventListener('click', (e) => { if (e.target.closest('.stu') || !st.sel) return; moveTo(st.sel, slotOf()); });
    };
    $$('#grid td.cell').forEach((td) => drop(td, () => ({ weekday: Number(td.dataset.d), start: td.dataset.t })));
    const none = $('#co-none'); if (none) drop(none, () => null);
  }

  // 1분마다 이전/현재/다음 갱신 (탭을 떠나면 자동 중지)
  const timer = setInterval(() => {
    if (body._view !== token) return clearInterval(timer);
    if (st.cfg && isNow()) draw();
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
