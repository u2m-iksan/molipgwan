// 주간 시간표에서 바로 휴강 · 보강 (말풍선 · 모달 아님)
//  · 학원 블럭 누름 → 휴강: 이번 주만 / 다음 주까지 / 직접(날짜까지) · 보강 잡기
//  · 휴강된 블럭 → 휴강 취소 · 보강 잡기
//  · 보강 블럭 → 보강 취소
//  · 빈 칸 누름 → 그 시각에 보강 추가 (학원 고르기)
//  학생이 바꾸면 선생님 확인 목록(schedule_requests)에 기록
import { esc, toast } from '../ui.js';
import { DOW, addDays, isoDow, toMin, toTime, hm, short } from '../date.js';
import { addOffs, removeOverride, addMakeup, logScheduleRequest } from '../data/schedules.js';

let pop = null;
const close = () => { pop?.remove(); pop = null; };
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
addEventListener('scroll', close, true);
addEventListener('resize', close);
document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.wk-grid.can-edit')) close(); });

export function wireGridEdit(root, { rows, stu, isStudent = false, onChanged }) {
  const grid = root.querySelector('.wk-grid'); if (!grid) return;
  grid.classList.add('can-edit');
  const md = (d) => short(d);
  const log = (action, text) => (isStudent ? logScheduleRequest(stu.id, action, text).catch(() => {}) : null);
  const done = (msg) => { close(); toast(msg); onChanged?.(); };
  const fail = (e) => toast('저장 실패: ' + (e.message || e), 'bad');
  const academies = () => {
    const seen = new Map();
    for (const r of rows) if (r.category === '학원' && !r.makeup && !seen.has(r.title)) seen.set(r.title, r);
    return [...seen.values()];
  };

  function open(anchor, html, wire) {
    close();
    pop = document.createElement('div');
    pop.className = 'gp'; pop.innerHTML = html;
    document.body.append(pop);
    const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = a.right + 8, y = a.top;
    if (x + w > innerWidth - 8) x = a.left - w - 8;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, a.left));
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    wire(pop);
  }

  // 보강 입력 (날짜 · 시간)
  const makeupForm = (base, date, start, end) => `
    <span class="gp-lbl">보강 날짜 · 시간</span>
    ${base ? '' : `<div class="gp-chips" id="gp-ac">${academies().map((r, i) => `<button type="button" data-i="${i}">${esc(r.title)}</button>`).join('') || '<span class="gp-sub">등록된 학원이 없어요</span>'}</div>`}
    <div class="gp-row"><input type="date" id="gp-d" value="${date}"></div>
    <div class="gp-row"><input type="time" id="gp-s" value="${start}"><span>~</span><input type="time" id="gp-e" value="${end}"></div>
    <button type="button" class="gp-go" id="gp-add"${base ? '' : ' disabled'}>보강 추가</button>`;
  const wireMakeup = (p, base) => {
    let pick = base;
    p.querySelectorAll('#gp-ac [data-i]').forEach((b) => b.addEventListener('click', () => {
      pick = academies()[Number(b.dataset.i)];
      p.querySelectorAll('#gp-ac button').forEach((x) => x.classList.toggle('on', x === b));
      const s = p.querySelector('#gp-s').value || hm(pick.start_time);
      p.querySelector('#gp-e').value = toTime(toMin(s) + (toMin(pick.end_time) - toMin(pick.start_time)));
      p.querySelector('#gp-add').disabled = false;
    }));
    p.querySelector('#gp-add').addEventListener('click', async (e) => {
      const d = p.querySelector('#gp-d').value, s = p.querySelector('#gp-s').value, en = p.querySelector('#gp-e').value;
      if (!pick || !d || !s || !en || en <= s) return toast('날짜 · 시간을 확인하세요', 'bad');
      e.currentTarget.disabled = true;
      try {
        await addMakeup({ student_id: stu.id, date: d, title: pick.title, subject: pick.subject ?? null, subject_detail: pick.subject_detail ?? null, start: s, end: en });
        log('보강', `${pick.title} 보강 ${md(d)} ${s}~${en}`);
        done(`${pick.title} 보강 ${md(d)} ${s}`);
      } catch (x) { fail(x); e.currentTarget.disabled = false; }
    });
  };

  grid.addEventListener('click', (e) => {
    const blk = e.target.closest('.blk');
    if (blk) {
      const date = blk.dataset.date, id = blk.dataset.sid;
      const r = rows.find((x) => String(x.id) === id);
      if (!r || r.category !== '학원') return;
      e.stopPropagation();
      const when = `${md(date)} ${hm(r.start_time)}~${hm(r.end_time)}`;
      if (r.makeup) {
        return open(blk, `<h5>${esc(r.title)} · 보강</h5><p class="gp-sub">${when}</p><button type="button" class="gp-link danger" id="gp-del">보강 취소</button>`, (p) => {
          p.querySelector('#gp-del').addEventListener('click', async () => {
            try { await removeOverride(r.ov_id); log('보강 취소', `${r.title} 보강 ${when} 취소`); done('보강을 취소했어요'); } catch (x) { fail(x); }
          });
        });
      }
      const offId = rows.offs?.get(`${r.id}|${date}`);
      if (offId) {
        return open(blk, `<h5>${esc(r.title)} · 휴강</h5><p class="gp-sub">${when}</p>
          <button type="button" class="gp-link danger" id="gp-undo">휴강 취소</button>
          <button type="button" class="gp-link" id="gp-mk">보강 잡기</button>`, (p) => {
          p.querySelector('#gp-undo').addEventListener('click', async () => {
            try { await removeOverride(offId); log('휴강 취소', `${r.title} ${md(date)} 휴강 취소`); done('휴강을 취소했어요'); } catch (x) { fail(x); }
          });
          p.querySelector('#gp-mk').addEventListener('click', () => {
            p.querySelector('#gp-mk').outerHTML = makeupForm(r, date, hm(r.start_time), hm(r.end_time)); wireMakeup(p, r);
          });
        });
      }
      return open(blk, `<h5>${esc(r.title)}</h5><p class="gp-sub">${when}</p>
        <span class="gp-lbl">휴강</span>
        <div class="gp-chips"><button type="button" data-w="1">이번 주만</button><button type="button" data-w="2">다음 주까지</button><button type="button" data-w="d">직접</button></div>
        <div class="gp-row" id="gp-until" hidden><input type="date" id="gp-u" value="${addDays(date, 14)}" min="${date}"><button type="button" class="gp-go" style="width:auto;margin:0;padding:0 12px" id="gp-u-go">휴강</button></div>
        <button type="button" class="gp-link" id="gp-mk">보강 잡기</button>`, (p) => {
        const doOff = async (until) => {
          try {
            const n = await addOffs(r, date, until);
            log('휴강', `${r.title} ${DOW[isoDow(date)]} 휴강 ${md(date)}${until > date ? ` ~ ${md(until)}` : ''} (${n}회)`);
            done(n > 1 ? `${r.title} ${n}회 휴강` : `${r.title} ${md(date)} 휴강`);
          } catch (x) { fail(x); }
        };
        p.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.w === 'd') { p.querySelector('#gp-until').hidden = false; p.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b)); return; }
          doOff(addDays(date, b.dataset.w === '2' ? 7 : 0));
        }));
        p.querySelector('#gp-u-go').addEventListener('click', () => { const u = p.querySelector('#gp-u').value; if (u >= date) doOff(u); });
        p.querySelector('#gp-mk').addEventListener('click', () => {
          p.querySelector('#gp-mk').outerHTML = makeupForm(r, date, hm(r.start_time), hm(r.end_time)); wireMakeup(p, r);
        });
      });
    }
    // 빈 칸: 그 시각에 보강
    const body = e.target.closest('.wk-body[data-date]');
    if (!body) return;
    const ticks = body.dataset.ticks.split(',').map((x) => x.split(':').map(Number));
    const y = e.clientY - body.getBoundingClientRect().top;
    let m = ticks[0][0];
    for (const [mm, yy] of ticks) if (yy <= y) m = mm;
    const date = body.dataset.date;
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY - 20 }) };
    open(anchor, `<h5>보강 추가</h5><p class="gp-sub">${md(date)} · 학원을 고르세요</p>${makeupForm(null, date, toTime(m), toTime(m + 60))}`, (p) => wireMakeup(p, null));
  });
}
