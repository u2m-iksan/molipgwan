// 선생님 · 코칭 시간표: 학생별 주 1회 코칭 타임 배정 (요일·시간대·길이는 설정으로 변경)
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { DOW, toMin, toTime, hm } from '../date.js';
import { loadStudents } from '../data/students.js';
import {
  getCoachConfig, saveCoachConfig, slotTimes, loadCoachingSlots, loadAllFixedSchedules, setCoachingSlot,
} from '../data/schedules.js';

export async function renderCoaching(body) {
  const st = { cfg: null, students: [], slots: new Map(), fixed: [], sel: null, busy: false };

  body.innerHTML = `
    <div class="t-head">
      <h2>코칭 시간표 <span class="count" id="cfgLabel"></span></h2>
      <div class="spacer"></div>
      <button type="button" class="btn btn-gray btn-sm" id="cfgBtn">설정</button>
    </div>
    <div class="coach-wrap">
      <div class="card table-card coach-grid" id="grid"><div class="empty">불러오는 중</div></div>
      <aside class="card coach-side" id="side"></aside>
    </div>
    <div class="selbar" id="selbar" hidden>
      <span id="selName"></span>
      <span class="sub">옮길 칸을 선택하세요</span>
      <div class="spacer"></div>
      <button type="button" class="btn btn-sm btn-danger-text" id="selClear">배정 해제</button>
      <button type="button" class="btn btn-gray btn-sm" id="selCancel">취소</button>
    </div>`;

  $('#cfgBtn').addEventListener('click', openSettings);
  $('#selCancel').addEventListener('click', () => select(null));
  $('#selClear').addEventListener('click', () => move(null));

  async function reload() {
    try {
      const [cfg, students, slots, fixed] = await Promise.all([getCoachConfig(), loadStudents(), loadCoachingSlots(), loadAllFixedSchedules()]);
      Object.assign(st, { cfg, students: students.filter((s) => s.status === '재원'), slots, fixed });
      draw();
    } catch (e) {
      $('#grid').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`;
    }
  }

  // 코칭 시간과 겹치는 학교·학원 일정
  function conflict(sid, slot) {
    const a = toMin(slot.start_time), b = toMin(slot.end_time);
    return st.fixed.find((f) => f.student_id === sid && f.weekday === slot.weekday && toMin(f.start_time) < b && toMin(f.end_time) > a);
  }

  const chip = (s, slot) => {
    const c = slot && conflict(s.id, slot);
    return `<button type="button" class="stu${st.sel === s.id ? ' sel' : ''}${c ? ' warn' : ''}" data-sid="${esc(s.id)}"
      title="${c ? esc(`${c.title} ${hm(c.start_time)}~${hm(c.end_time)}와 겹침`) : ''}">
      ${s.seat_no ? `<i>${esc(s.seat_no)}</i>` : ''}${esc(s.name)}<small>${esc(s.grade)}</small></button>`;
  };

  function draw() {
    const { cfg } = st;
    const days = [...cfg.days].sort();
    const times = slotTimes(cfg);
    $('#cfgLabel').textContent = `${days.map((d) => DOW[d]).join('·')} ${cfg.start}~${cfg.end} · ${cfg.minutes}분`;

    const at = (d, t) => st.students.filter((s) => {
      const sl = st.slots.get(s.id);
      return sl && sl.weekday === d && hm(sl.start_time) === t;
    });

    $('#grid').innerHTML = `
      <table class="tt" style="--cols:${days.length}">
        <thead><tr><th class="tt-time"></th>${days.map((d) => `<th>${DOW[d]}요일</th>`).join('')}</tr></thead>
        <tbody>${times.map((t) => `
          <tr><th class="tt-time">${t}<small>~${toTime(toMin(t) + cfg.minutes)}</small></th>
            ${days.map((d) => {
              const list = at(d, t);
              return `<td class="cell${list.length > 1 ? ' multi' : ''}" data-d="${d}" data-t="${t}">${list.map((s) => chip(s, st.slots.get(s.id))).join('')}</td>`;
            }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    const inGrid = (sl) => sl && days.includes(sl.weekday) && times.includes(hm(sl.start_time));
    const none = st.students.filter((s) => !st.slots.get(s.id));
    const out = st.students.filter((s) => st.slots.get(s.id) && !inGrid(st.slots.get(s.id)));
    const assigned = st.students.length - none.length;
    $('#side').innerHTML = `
      <div class="side-sec"><h4>배정 현황</h4><p class="big">${assigned}<span> / ${st.students.length}명</span></p>
        <p class="legend"><span class="dot-o"></span>학교·학원 일정과 겹침</p></div>
      ${out.length ? `<div class="side-sec"><h4 class="red">재배정 필요 ${out.length}</h4>
        <p class="sub-s">현재 설정 밖의 시간에 배정되어 있습니다.</p>
        <div class="stu-list">${out.map((s) => { const sl = st.slots.get(s.id); return chip(s) + `<span class="was">${DOW[sl.weekday]} ${hm(sl.start_time)}</span>`; }).join('')}</div></div>` : ''}
      <div class="side-sec"><h4>미배정 ${none.length}</h4>
        <div class="stu-list" id="noneList">${none.map((s) => chip(s)).join('') || '<p class="sub-s">모든 학생이 배정되었습니다.</p>'}</div></div>`;

    $$('.stu', body).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); select(st.sel === b.dataset.sid ? null : b.dataset.sid); }));
    $$('.cell', body).forEach((td) => td.addEventListener('click', () => {
      if (st.sel) move({ weekday: Number(td.dataset.d), start: td.dataset.t });
    }));
    body.classList.toggle('picking', !!st.sel);
  }

  function select(id) {
    st.sel = id;
    const s = st.students.find((x) => x.id === id);
    $('#selbar').hidden = !s;
    if (s) {
      $('#selName').innerHTML = `<b>${esc(s.name)}</b>`;
      $('#selClear').hidden = !st.slots.get(id);
    }
    draw();
  }

  async function move(slot) {
    if (st.busy || !st.sel) return;
    const sid = st.sel, s = st.students.find((x) => x.id === sid);
    const cur = st.slots.get(sid);
    if (slot && cur && cur.weekday === slot.weekday && hm(cur.start_time) === slot.start) return select(null);
    st.busy = true;
    try {
      await setCoachingSlot(sid, slot, st.cfg);
      toast(slot ? `${s.name} · ${DOW[slot.weekday]} ${slot.start}` : `${s.name} 배정 해제`);
      st.sel = null; $('#selbar').hidden = true;
      st.slots = await loadCoachingSlots();
      draw();
    } catch (e) { toast('저장 실패: ' + e.message); }
    st.busy = false;
  }

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
