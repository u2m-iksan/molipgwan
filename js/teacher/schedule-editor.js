// 학생 일정 편집 (선생님 패널에서 사용, 학생 화면에서도 재사용 예정)
//   반복 일정: 학교 / 학원 / 기타 × 요일 × 시간 × 기간(계속 · 이번 주만 · 기간 지정)
import { $, $$, esc, toast } from '../ui.js';
import { DOW, today, addMonths, addDays, hm, toMin } from '../date.js';
import { loadStudentSchedules, groupSchedules, addSchedule, endSchedule, periodLabel } from '../data/schedules.js';

const CATS = ['학교', '학원', '기타'];
const CAT_PILL = { 학교: 'pill-gray', 학원: 'pill-blue', 기타: 'pill-orange', 코칭: 'pill-green' };

export async function renderScheduleEditor(root, stu, { canCoach = false } = {}) {
  root.innerHTML = '<div class="drawer-body"><div class="empty">불러오는 중</div></div>';
  let rows;
  try { rows = await loadStudentSchedules(stu.id); }
  catch (e) { root.innerHTML = `<div class="drawer-body"><p class="err">불러오기 실패: ${esc(e.message)}</p></div>`; return; }

  const t = today();
  const coach = rows.filter((r) => r.category === '코칭' && r.valid_from <= t).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const groups = groupSchedules(rows.filter((r) => r.category !== '코칭'));
  const f = { category: '학원', weekdays: [], period: 'always' };

  root.innerHTML = `
    <div class="drawer-body">
      <div class="sched-sec">
        <h4>코칭</h4>
        <div class="sched-row">
          <span class="pill ${CAT_PILL['코칭']}">코칭</span>
          <div class="sched-main">${coach ? `<b>${DOW[coach.weekday]}요일 ${hm(coach.start_time)}~${hm(coach.end_time)}</b>` : '<span class="sub">미배정</span>'}</div>
          ${canCoach ? '<a class="link-s" href="#/coaching" data-close>시간표에서 변경</a>' : ''}
        </div>
      </div>

      <div class="sched-sec">
        <h4>학교 · 학원 일정</h4>
        ${groups.length ? groups.map((g, i) => `
          <div class="sched-row">
            <span class="pill ${CAT_PILL[g.category]}">${esc(g.category)}</span>
            <div class="sched-main"><b>${esc(g.title)}</b>
              <span class="sub">${g.weekdays.map((d) => DOW[d]).join('·')} ${hm(g.start_time)}~${hm(g.end_time)}</span></div>
            <span class="period${g.valid_to ? ' temp' : ''}">${esc(periodLabel(g))}</span>
            <button type="button" class="icon-btn sm" data-del="${i}" aria-label="일정 삭제">${TRASH}</button>
          </div>`).join('') : '<p class="sub-s">등록된 일정이 없습니다.</p>'}
      </div>

      <div class="sched-add" id="addBox">
        <h4>일정 추가</h4>
        <div class="field"><span class="lbl">구분</span><div class="seg seg-wide" id="a-cat">${CATS.map((c) => `<button type="button" data-v="${c}">${c}</button>`).join('')}</div></div>
        <div class="field"><label for="a-title">이름</label><div class="input"><input id="a-title" placeholder="예: 수학학원" autocomplete="off"></div></div>
        <div class="field"><span class="lbl">요일 <span class="opt">복수 선택</span></span>
          <div class="chips days" id="a-days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" class="chip-t" data-v="${d}">${DOW[d]}</button>`).join('')}</div></div>
        <div class="row2">
          <div class="field"><label for="a-start">시작</label><div class="input"><input id="a-start" type="time" step="300"></div></div>
          <div class="field"><label for="a-end">종료</label><div class="input"><input id="a-end" type="time" step="300"></div></div>
        </div>
        <div class="field"><span class="lbl">기간</span>
          <div class="seg seg-wide" id="a-period"><button type="button" data-v="always">계속</button><button type="button" data-v="week">이번 주만</button><button type="button" data-v="range">기간 지정</button></div></div>
        <div class="row2" id="a-range" hidden>
          <div class="field"><label for="a-from">시작일</label><div class="input"><input id="a-from" type="date" value="${t}"></div></div>
          <div class="field"><label for="a-to">종료일</label><div class="input"><input id="a-to" type="date" value="${addDays(addMonths(t, 1), -1)}"></div></div>
        </div>
        <p class="err" id="a-err" role="alert"></p>
        <button type="button" class="btn btn-primary btn-sm btn-block" id="a-go">추가</button>
      </div>
    </div>`;

  const paint = () => {
    $$('#a-cat button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === f.category));
    $$('#a-days button', root).forEach((b) => b.classList.toggle('on', f.weekdays.includes(Number(b.dataset.v))));
    $$('#a-period button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === f.period));
    $('#a-range', root).hidden = f.period !== 'range';
  };
  $('#a-cat', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.category = b.dataset.v; paint(); } });
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
      await addSchedule({ student_id: stu.id, category: f.category, title, weekdays: f.weekdays, start, end, period: f.period, from, to });
      toast('일정이 추가되었습니다');
      renderScheduleEditor(root, stu, { canCoach });
    } catch (e) { err.textContent = '저장 실패: ' + e.message; btn.disabled = false; }
  });

  // 삭제: 두 번 눌러 확인 (이미 시작된 일정은 어제까지로 종료되어 기록 보존)
  $$('[data-del]', root).forEach((b) => {
    let armed = false;
    b.addEventListener('click', async () => {
      if (!armed) { armed = true; b.classList.add('armed'); setTimeout(() => { armed = false; b.classList.remove('armed'); }, 3000); return; }
      try { await endSchedule(groups[Number(b.dataset.del)]); toast('일정이 삭제되었습니다'); renderScheduleEditor(root, stu, { canCoach }); }
      catch (e) { toast('삭제 실패: ' + e.message); }
    });
  });
}

const TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
