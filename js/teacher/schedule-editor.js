// 학생 일정 편집 (선생님 학생 관리에서 사용, 학생 화면에서도 재사용 예정)
//   맨 위: 월~일 주간 시간표(08~23시)  →  아래: 코칭 타임 · 일정 목록 | 일정 추가
//   반복 일정: 학교 / 학원 / 기타 × 요일 × 시간 × 기간(계속 · 이번 주만 · 기간 지정)
import { $, $$, esc, toast } from '../ui.js';
import { DOW, today, addMonths, addDays, mondayOf, isoDow, short, hm, toMin } from '../date.js';
import {
  loadStudentSchedules, groupSchedules, addSchedule, endSchedule, periodLabel,
  getCoachConfig, slotTimes, loadCoachingSlots, setCoachingSlot, logScheduleRequest,
} from '../data/schedules.js';

const CATS = ['학교', '학원', '기타'];
const CAT_PILL = { 학교: 'pill-gray', 학원: 'pill-blue', 기타: 'pill-orange', 코칭: 'pill-green' };
const DAY_START = 8 * 60, DAY_END = 23 * 60, HOUR_PX = 40;

// student: 학생 화면용 — 학원 일정만 추가·변경·삭제, 바꿀 때마다 선생님 확인 목록(schedule_requests)에 기록
export async function renderScheduleEditor(root, stu, { canCoach = false, week = null, student = false, editIdx = null } = {}) {
  const keepScroll = $('.drawer-body', root)?.scrollTop || 0;   // 다시 그릴 때 스크롤 위치 유지
  if (!root.firstElementChild) root.innerHTML = '<div class="drawer-body"><div class="empty">불러오는 중</div></div>';
  let rows, cfg = null, allSlots = new Map();
  try {
    [rows, cfg, allSlots] = await Promise.all([
      loadStudentSchedules(stu.id),
      canCoach ? getCoachConfig() : null,
      canCoach ? loadCoachingSlots() : new Map(),
    ]);
  } catch (e) { root.innerHTML = `<div class="drawer-body"><p class="err">불러오기 실패: ${esc(e.message)}</p></div>`; return; }

  const t = today();
  const thisMon = mondayOf(t);
  const mon = week && week >= thisMon ? week : thisMon;
  const coach = rows.filter((r) => r.category === '코칭' && r.valid_from <= t).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const groups = groupSchedules(rows.filter((r) => r.category !== '코칭'));
  const f = { category: '학원', weekdays: [], period: 'always' };
  const again = (opts = {}) => renderScheduleEditor(root, stu, { canCoach, student, week: mon, ...opts });
  const editing = student && editIdx != null ? groups[editIdx] : null;
  if (editing) { f.weekdays = [...editing.weekdays]; f.period = editing.valid_to ? 'range' : 'always'; }
  const mine = (g) => !student || g.category === '학원';
  const summary = (title, days, start, end) => `${title} ${days.map((d) => DOW[d]).join('·')} ${hm(start)}~${hm(end)}`;
  const log = (action, text) => (student ? logScheduleRequest(stu.id, action, text).catch(() => {}) : null);

  root.innerHTML = `
    <div class="drawer-body">
      <section class="wk">
        <div class="wk-head">
          <h4>주간 시간표</h4>
          <div class="spacer"></div>
          <button type="button" class="icon-btn sm" id="wkPrev" aria-label="이전 주"${mon <= thisMon ? ' disabled' : ''}>${CHEV_L}</button>
          <span class="wk-label">${mon === thisMon ? '이번 주' : mon === addDays(thisMon, 7) ? '다음 주' : ''} ${short(mon)} ~ ${short(addDays(mon, 6))}</span>
          <button type="button" class="icon-btn sm" id="wkNext" aria-label="다음 주">${CHEV_R}</button>
          <div class="wk-legend">${['학교', '학원', '기타', '코칭'].map((c) => `<span class="lg lg-${c}">${c}</span>`).join('')}</div>
        </div>
        <div class="wk-scroll">${weekGrid(rows, mon, t)}</div>
      </section>

      <div class="sched-cols">
        <div>
          <div class="sched-sec">
            <h4>코칭</h4>
            <div class="sched-row">
              <span class="pill ${CAT_PILL['코칭']}">코칭</span>
              <div class="sched-main">${coach ? `<b>${DOW[coach.weekday]}요일 ${hm(coach.start_time)}~${hm(coach.end_time)}</b>` : '<span class="sub">미배정</span>'}
                <span class="sub" id="c-warn"></span></div>
            </div>
            ${canCoach ? `<div class="coach-pick">
              <div class="seg" id="c-day">${[...cfg.days].sort().map((d) => `<button type="button" data-v="${d}">${DOW[d]}</button>`).join('')}</div>
              <div class="input"><select id="c-time" aria-label="코칭 시간"></select></div>
              <button type="button" class="btn btn-primary btn-sm" id="c-save">${coach ? '변경' : '배정'}</button>
              ${coach ? '<button type="button" class="btn btn-sm btn-danger-text" id="c-clear">해제</button>' : ''}
            </div>` : ''}
          </div>

          <div class="sched-sec">
            <h4>학교 · 학원 일정</h4>${student ? '<p class="sub-s">학원 일정은 바꾸면 바로 반영되고 선생님께 알림이 갑니다.</p>' : ''}
            ${groups.length ? groups.map((g, i) => `
              <div class="sched-row">
                <span class="pill ${CAT_PILL[g.category]}">${esc(g.category)}</span>
                <div class="sched-main"><b>${esc(g.title)}</b>
                  <span class="sub">${g.weekdays.map((d) => DOW[d]).join('·')} ${hm(g.start_time)}~${hm(g.end_time)}</span></div>
                <span class="period${g.valid_to ? ' temp' : ''}">${esc(periodLabel(g))}</span>
                ${mine(g) ? `${student ? `<button type="button" class="icon-btn sm${editIdx === i ? ' on' : ''}" data-edit="${i}" aria-label="일정 변경">${PEN}</button>` : ''}
                <button type="button" class="icon-btn sm" data-del="${i}" aria-label="일정 삭제">${TRASH}</button>` : ''}
              </div>`).join('') : '<p class="sub-s">등록된 일정이 없습니다.</p>'}
          </div>
        </div>

        <div class="sched-add">
          <h4>${editing ? '학원 일정 변경' : student ? '학원 일정 추가' : '일정 추가'}</h4>
          ${student ? '' : `<div class="field"><span class="lbl">구분</span><div class="seg seg-wide" id="a-cat">${CATS.map((c) => `<button type="button" data-v="${c}">${c}</button>`).join('')}</div></div>`}
          <div class="field"><label for="a-title">이름</label><div class="input"><input id="a-title" placeholder="예: 수학학원" autocomplete="off" value="${esc(editing?.title || '')}"></div></div>
          <div class="field"><span class="lbl">요일 <span class="opt">복수 선택</span></span>
            <div class="chips days" id="a-days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" class="chip-t" data-v="${d}">${DOW[d]}</button>`).join('')}</div></div>
          <div class="row2">
            <div class="field"><label for="a-start">시작</label><div class="input"><input id="a-start" type="time" step="300" value="${editing ? hm(editing.start_time) : ''}"></div></div>
            <div class="field"><label for="a-end">종료</label><div class="input"><input id="a-end" type="time" step="300" value="${editing ? hm(editing.end_time) : ''}"></div></div>
          </div>
          <div class="field"><span class="lbl">기간</span>
            <div class="seg seg-wide" id="a-period"><button type="button" data-v="always">계속</button><button type="button" data-v="week">이번 주만</button><button type="button" data-v="range">기간 지정</button></div></div>
          <div class="row2" id="a-range" hidden>
            <div class="field"><label for="a-from">시작일</label><div class="input"><input id="a-from" type="date" value="${t}"></div></div>
            <div class="field"><label for="a-to">종료일</label><div class="input"><input id="a-to" type="date" value="${addDays(addMonths(t, 1), -1)}"></div></div>
          </div>
          <p class="err" id="a-err" role="alert"></p>
          <div class="sched-btns">${editing ? '<button type="button" class="btn btn-gray btn-sm" id="a-cancel">취소</button>' : ''}
          <button type="button" class="btn btn-primary btn-sm" id="a-go">${editing ? '변경' : '추가'}</button></div>
        </div>
      </div>
    </div>`;

  $('.drawer-body', root).scrollTop = keepScroll;
  $('#wkPrev', root).addEventListener('click', () => again({ week: addDays(mon, -7) }));
  $('#wkNext', root).addEventListener('click', () => again({ week: addDays(mon, 7) }));

  /* ---------- 코칭 타임 배정 ---------- */
  if (canCoach) {
    const pick = { day: coach?.weekday ?? [...cfg.days].sort()[0], time: coach ? hm(coach.start_time) : null };
    const count = (d, tm) => [...allSlots.entries()].filter(([sid, r]) => sid !== stu.id && r.weekday === d && hm(r.start_time) === tm).length;
    const fixed = rows.filter((r) => r.category !== '코칭' && r.valid_from <= t);
    const clash = (d, tm) => fixed.find((r) => r.weekday === d && toMin(r.start_time) < toMin(tm) + cfg.minutes && toMin(r.end_time) > toMin(tm));
    const drawPick = () => {
      $$('#c-day button', root).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === pick.day));
      $('#c-time', root).innerHTML = slotTimes(cfg).map((tm) => {
        const n = count(pick.day, tm), c = clash(pick.day, tm);
        return `<option value="${tm}"${tm === pick.time ? ' selected' : ''}>${tm}${n ? ` · ${n}명` : ''}${c ? ` · ${c.title} 겹침` : ''}</option>`;
      }).join('');
      if (!pick.time || !slotTimes(cfg).includes(pick.time)) pick.time = $('#c-time', root).value;
      const c = clash(pick.day, pick.time);
      $('#c-warn', root).textContent = c ? `선택한 시간이 ${c.title}(${hm(c.start_time)}~${hm(c.end_time)})과 겹칩니다.` : '';
    };
    $('#c-day', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { pick.day = Number(b.dataset.v); drawPick(); } });
    $('#c-time', root).addEventListener('change', (e) => { pick.time = e.target.value; drawPick(); });
    drawPick();
    $('#c-save', root).addEventListener('click', async () => {
      try { await setCoachingSlot(stu.id, { weekday: pick.day, start: pick.time }, cfg); toast(`코칭 ${DOW[pick.day]} ${pick.time}`); again(); }
      catch (e) { toast('저장 실패: ' + e.message); }
    });
    $('#c-clear', root)?.addEventListener('click', async () => {
      try { await setCoachingSlot(stu.id, null, cfg); toast('코칭 배정 해제'); again(); }
      catch (e) { toast('저장 실패: ' + e.message); }
    });
  }

  /* ---------- 일정 추가 ---------- */
  const paint = () => {
    if (student) f.category = '학원';
    $$('#a-cat button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === f.category));
    $$('#a-days button', root).forEach((b) => b.classList.toggle('on', f.weekdays.includes(Number(b.dataset.v))));
    $$('#a-period button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === f.period));
    $('#a-range', root).hidden = f.period !== 'range';
  };
  $('#a-cancel', root)?.addEventListener('click', () => again({ editIdx: null }));
  $$('[data-edit]', root).forEach((b) => b.addEventListener('click', () => again({ editIdx: Number(b.dataset.edit) })));
  $('#a-cat', root)?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.category = b.dataset.v; paint(); } });
  $('#a-period', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.period = b.dataset.v; paint(); } });
  $('#a-days', root).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = Number(b.dataset.v);
    f.weekdays = f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort();
    paint();
  });
  paint();

  $('#a-go', root).addEventListener('click', async () => {
    const err = $('#a-err', root);
    const title = $('#a-title', root).value.trim(), start = $('#a-start', root).value, end = $('#a-end', root).value;
    const from = $('#a-from', root).value, to = $('#a-to', root).value;
    if (!title) return (err.textContent = '이름을 입력하세요.');
    if (!f.weekdays.length) return (err.textContent = '요일을 선택하세요.');
    if (!start || !end || toMin(end) <= toMin(start)) return (err.textContent = '시간을 확인하세요.');
    if (f.period === 'range' && (!from || !to || to < from)) return (err.textContent = '기간을 확인하세요.');
    const btn = $('#a-go', root); btn.disabled = true; err.textContent = '';
    try {
      if (editing) await endSchedule(editing);
      await addSchedule({ student_id: stu.id, category: f.category, title, weekdays: f.weekdays, start, end, period: f.period, from, to });
      if (editing) await log('변경', `${summary(editing.title, editing.weekdays, editing.start_time, editing.end_time)} → ${summary(title, f.weekdays, start, end)}`);
      else await log('추가', summary(title, f.weekdays, start, end));
      toast(editing ? '일정이 변경되었습니다' : '일정이 추가되었습니다'); again({ editIdx: null });
    } catch (e) { err.textContent = '저장 실패: ' + e.message; btn.disabled = false; }
  });

  // 삭제: 두 번 눌러 확인 (이미 시작된 일정은 어제까지로 종료되어 기록 보존)
  $$('[data-del]', root).forEach((b) => {
    let armed = false;
    b.addEventListener('click', async () => {
      if (!armed) { armed = true; b.classList.add('armed'); setTimeout(() => { armed = false; b.classList.remove('armed'); }, 3000); return; }
      const g = groups[Number(b.dataset.del)];
      try { await endSchedule(g); await log('삭제', summary(g.title, g.weekdays, g.start_time, g.end_time)); toast('일정이 삭제되었습니다'); again({ editIdx: null }); }
      catch (e) { toast('삭제 실패: ' + e.message); }
    });
  });
}

/* ---------- 주간 시간표 (월~일 × 08~23시) ----------
   opt.fitH: 본문 높이(px)를 지정하면 그 높이에 맞춤
   opt.squeezeSchool: 학교 있는 주중은 학교 시간을 줄이고 오후·저녁을 크게 (주말은 고르게, 시간 눈금 따로) */
export function weekGrid(rows, mon, t, hourPx = HOUR_PX, opt = {}) {
  const RANGE = DAY_END - DAY_START;
  const H = opt.fitH ?? (RANGE / 60) * hourPx;
  const sun = addDays(mon, 6);
  const dayItems = (d) => {
    const date = addDays(mon, d - 1);
    // 그 날짜에 유효한 일정. '계속' 일정은 그 주 안에 시작했으면 주 전체에 표시(주간 패턴으로 보기)
    return rows
      .filter((r) => r.weekday === d && (r.valid_to ? r.valid_from <= date && r.valid_to >= date : r.valid_from <= sun))
      .filter((r) => toMin(r.end_time) > DAY_START && toMin(r.start_time) < DAY_END)
      .sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  };
  const items = [1, 2, 3, 4, 5, 6, 7].map(dayItems);

  // 눈금(scale): 분 → 높이(px)
  const mkScale = (sq) => {
    const units = (RANGE - (sq ? (sq.to - sq.from) * (1 - sq.ratio) : 0)) / 60;
    const px = H / units;
    const y = (m) => {
      m = Math.min(Math.max(m, DAY_START), DAY_END);
      if (!sq) return ((m - DAY_START) / 60) * px;
      const inSq = Math.max(0, Math.min(m, sq.to) - sq.from);
      return (((m - DAY_START) - inSq + inSq * sq.ratio) / 60) * px;
    };
    const inSqH = (h) => !!sq && h * 60 > sq.from && h * 60 < sq.to;
    return { y, px, inSqH };
  };
  let sq = null;
  if (opt.squeezeSchool) {
    const sch = items.slice(0, 5).flat().filter((r) => r.category === '학교');
    if (sch.length) sq = {
      from: Math.max(DAY_START, Math.min(...sch.map((r) => toMin(r.start_time)))),
      to: Math.min(DAY_END, Math.max(...sch.map((r) => toMin(r.end_time)))), ratio: 0.35,
    };
  }
  const W = mkScale(sq), E = opt.splitWeekend ? mkScale(null) : W;
  const split = !!sq && !!opt.splitWeekend;   // 주중·주말 눈금이 다르면 주말 앞에 눈금 한 줄 더
  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);

  const lines = (S) => hours.map((h) => `<i class="wk-ln${S.inSqH(h) ? ' sq' : ''}" style="top:${S.y(h * 60)}px"></i>`).join('');
  const axis = (S, cls = '') => `<div class="wk-axis${cls}"><div class="wk-day"></div><div class="wk-body" style="height:${H}px">
      ${hours.filter((h) => !S.inSqH(h) || h % 2 === 0).map((h) => `<span style="top:${S.y(h * 60)}px">${h}</span>`).join('')}</div></div>`;

  const col = (d) => {
    const S = d <= 5 ? W : E;
    const date = addDays(mon, d - 1);
    const its = items[d - 1];
    // 겹치는 일정끼리만 나란히 (겹침 묶음별로 칸 나누기)
    let cluster = [], clusterEnd = -1;
    const flush = () => { const n = Math.max(...cluster.map((c) => c._lane)) + 1; cluster.forEach((c) => { c._n = n; }); cluster = []; };
    for (const it of its) {
      const s0 = toMin(it.start_time);
      if (cluster.length && s0 >= clusterEnd) flush();
      const used = cluster.filter((c) => toMin(c.end_time) > s0).map((c) => c._lane);
      let li = 0; while (used.includes(li)) li++;
      it._lane = li; cluster.push(it);
      clusterEnd = Math.max(clusterEnd, toMin(it.end_time));
    }
    if (cluster.length) flush();
    const blocks = its.map((it) => {
      const n = it._n || 1;
      const top = S.y(toMin(it.start_time)), h = Math.max(16, S.y(toMin(it.end_time)) - top);
      return `<div class="blk blk-${it.category}${it.valid_to ? ' temp' : ''}${h < 40 ? ' thin' : ''}" style="top:${top}px;height:${h - 2}px;left:calc(${(it._lane / n) * 100}% + 2px);width:calc(${100 / n}% - 4px)"
        title="${esc(`${it.title} ${hm(it.start_time)}~${hm(it.end_time)}`)}">
        <b>${esc(it.category === '코칭' ? `코칭 ${hm(it.start_time)}` : it.title)}</b>${h >= 40 ? `<span>${hm(it.start_time)}~${hm(it.end_time)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="wk-col${date === t ? ' today-col' : ''}${d === 6 && !split ? ' wk-wkend' : ''}">
      <div class="wk-day">${DOW[d]}<span>${Number(date.slice(8))}</span></div>
      <div class="wk-body" style="height:${H}px">${lines(S)}${blocks}</div></div>`;
  };

  return `<div class="wk-grid${split ? ' split' : ''}">
    ${axis(W)}${[1, 2, 3, 4, 5].map(col).join('')}${split ? axis(E, ' wk-axis2') : ''}${[6, 7].map(col).join('')}
  </div>`;
}

const PEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
const CHEV_L = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CHEV_R = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
