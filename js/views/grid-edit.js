// 주간 시간표에서 바로 휴강 · 보강 (말풍선 · 모달 아님)
//  · 학원 블럭 누름 → 휴강: 이번 주만 / 다음 주까지 (더 길면 2주 뒤 다시)
//  · 휴강된 블럭 → 휴강 취소 · 보강 블럭 → 보강 취소
//  · 시간표 위 [+ 보강·일정] → 보강(학원 고르기) 또는 기타 일정(그날만) · 휴강 없이도
//  · 빈 칸은 눌러도 아무 일 없음 (잘못 눌러 생기는 것 방지)
//  학생이 바꾸면 선생님 확인 목록(schedule_requests)에 기록
import { esc, toast } from '../ui.js';
import { DOW, addDays, isoDow, toMin, toTime, hm, short, today, mondayOf } from '../date.js';
import { addOffs, removeOverride, removeOverrides, addMakeup, addOneDay, logScheduleRequest } from '../data/schedules.js';

let pop = null;
const close = () => { const f = pop?._onClose; pop?.remove(); pop = null; f?.(); };
// 말풍선은 ✕(또는 끝내는 버튼)로만 닫힘 — 잘못 끌거나 바깥을 눌러도 그대로. 스크롤하면 블럭을 따라감
const place = () => {
  if (!pop) return;
  if (pop._anchor && !document.body.contains(pop._anchor)) return close();
  const a = pop._anchor ? pop._anchor.getBoundingClientRect() : pop._rect, w = pop.offsetWidth, h = pop.offsetHeight;
  let x = a.right + 8, y = a.top;
  if (x + w > innerWidth - 8) x = a.left - w - 8;
  if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, a.left));
  if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
  if (y < 8) y = 8;
  pop.style.left = `${x}px`; pop.style.top = `${y}px`;
};
addEventListener('scroll', place, true);
addEventListener('resize', place);

// 날짜 고르기: 한 번 누르면 그날 하루 · 두 번째 날짜를 누르면 기간 (기간이면 반복 요일 고르기)
const MAX_DAYS = 62;
function calHtml() {
  return `<span class="gp-lbl">날짜<small>하루는 한 번 · 기간은 시작일과 끝날을 눌러요</small></span>
    <div class="gc" id="gc"></div>
    <div class="gc-dow" id="gc-dow" hidden><span class="gp-lbl">반복 요일</span><div class="gc-w">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" data-wd="${d}">${DOW[d]}</button>`).join('')}</div></div>
    <p class="gc-sum" id="gc-sum"></p>`;
}
function wireCal(p, d0, onChange) {
  const min = mondayOf(today());
  const st = { a: d0 >= min ? d0 : today(), b: null, wd: new Set(), view: (d0 >= min ? d0 : today()).slice(0, 7) };
  const box = p.querySelector('#gc'), dowBox = p.querySelector('#gc-dow'), sum = p.querySelector('#gc-sum');
  const dates = () => {
    if (!st.b) return [st.a];
    const out = [];
    for (let d = st.a; d <= st.b; d = addDays(d, 1)) if (st.wd.has(isoDow(d))) out.push(d);
    return out;
  };
  const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const paint = () => {
    const [y, m] = st.view.split('-').map(Number);
    const first = `${st.view}-01`, lead = isoDow(first) - 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const sel = new Set(dates()), maxD = addDays(st.a, MAX_DAYS);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let k = 1; k <= last; k++) {
      const d = `${st.view}-${String(k).padStart(2, '0')}`;
      const inR = st.b && d >= st.a && d <= st.b;
      const cls = [d === st.a || d === st.b ? 'end' : '', inR ? 'rng' : '', sel.has(d) ? 'on' : '', d === today() ? 'td' : ''].filter(Boolean).join(' ');
      cells += `<button type="button" data-d="${d}" class="${cls}"${d < min ? ' disabled' : ''}>${k}</button>`;
    }
    const prevOk = st.view > min.slice(0, 7);
    box.innerHTML = `<div class="gc-h"><button type="button" data-mv="-1"${prevOk ? '' : ' disabled'} aria-label="이전 달">‹</button><b>${y}년 ${m}월</b><button type="button" data-mv="1" aria-label="다음 달">›</button></div>
      <div class="gc-g">${['월', '화', '수', '목', '금', '토', '일'].map((x) => `<i>${x}</i>`).join('')}${cells}</div>`;
    dowBox.hidden = !st.b;
    dowBox.querySelectorAll('[data-wd]').forEach((b) => b.classList.toggle('on', st.wd.has(Number(b.dataset.wd))));
    const ds = dates();
    sum.textContent = !st.b ? `${short(st.a)} 하루` : ds.length ? `${md(st.a)} ~ ${md(st.b)} · ${[...st.wd].sort().map((d) => DOW[d]).join('·')} · ${ds.length}회` : '반복할 요일을 골라 주세요';
    void maxD;
    onChange(ds);
  };
  box.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-mv]');
    if (mv) { const [y, m] = st.view.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + Number(mv.dataset.mv), 1)); st.view = dt.toISOString().slice(0, 7); return paint(); }
    const b = e.target.closest('[data-d]'); if (!b || b.disabled) return;
    const d = b.dataset.d;
    if (st.b || d <= st.a) { st.a = d; st.b = null; st.wd = new Set(); }
    else if (d > addDays(st.a, MAX_DAYS)) { toast('기간은 두 달까지 고를 수 있어요', 'bad'); return; }
    else { st.b = d; st.wd = new Set([isoDow(st.a)]); }
    paint();
  });
  dowBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wd]'); if (!b) return;
    const w = Number(b.dataset.wd); st.wd.has(w) ? st.wd.delete(w) : st.wd.add(w); paint();
  });
  paint();
  place();
}
const rangeText = (ds) => {
  const md = (d) => short(d);
  if (ds.length === 1) return md(ds[0]);
  return `${md(ds[0])} ~ ${md(ds[ds.length - 1])} ${[...new Set(ds.map(isoDow))].sort().map((d) => DOW[d]).join('·')} ${ds.length}회`;
};

export function wireGridEdit(root, { rows, stu, isStudent = false, onChanged }) {
  const grid = root.querySelector('.wk-grid'); if (!grid) return;
  grid.classList.add('can-edit');   // 학원 블럭만 눌림
  const md = (d) => short(d);
  const log = (action, text) => (isStudent ? logScheduleRequest(stu.id, action, text).catch(() => {}) : null);
  const done = (msg) => { if (pop) pop._onClose = null; close(); toast(msg); onChanged?.(); };
  const fail = (e) => toast('저장 실패: ' + (e.message || e), 'bad');
  const academies = () => {
    const seen = new Map();
    for (const r of rows) if (r.category === '학원' && !r.makeup && !seen.has(r.title)) seen.set(r.title, r);
    return [...seen.values()];
  };

  function open(anchor, html, wire) {
    close();
    pop = document.createElement('div');
    pop.className = 'gp'; pop.innerHTML = `<button type="button" class="gp-x" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>${html}`;
    document.body.append(pop);
    pop._anchor = anchor; place();
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    pop.querySelector('.gp-x').addEventListener('click', close);
    wire(pop);
  }

  // 보강 입력 (날짜 · 시간)
  const makeupForm = (base, date, start, end) => `
    ${base ? '' : '<span class="gp-lbl">학원</span>'}
    ${base ? '' : `<div class="gp-chips" id="gp-ac">${academies().map((r, i) => `<button type="button" data-i="${i}">${esc(r.title)}</button>`).join('') || '<span class="gp-sub">등록된 학원이 없어요</span>'}</div>`}
    ${calHtml()}
    <span class="gp-lbl">시간</span>
    <div class="gp-row"><input type="time" step="600" data-t10 id="gp-s" value="${start}"><span>~</span><input type="time" step="600" data-t10 id="gp-e" value="${end}"></div>
    <button type="button" class="gp-go" id="gp-add"${base ? '' : ' disabled'}>보강 추가</button>`;
  const wireMakeup = (p, base, d0) => {
    let pick = base, ds = [d0];
    wireCal(p, d0, (x) => { ds = x; });
    p.querySelectorAll('#gp-ac [data-i]').forEach((b) => b.addEventListener('click', () => {
      pick = academies()[Number(b.dataset.i)];
      p.querySelectorAll('#gp-ac button').forEach((x) => x.classList.toggle('on', x === b));
      const s = p.querySelector('#gp-s').value || hm(pick.start_time);
      p.querySelector('#gp-s').value = s;
      p.querySelector('#gp-e').value = toTime(toMin(s) + (toMin(pick.end_time) - toMin(pick.start_time)));
      p.querySelector('#gp-add').disabled = false;
    }));
    p.querySelector('#gp-add').addEventListener('click', async (e) => {
      const s = p.querySelector('#gp-s').value, en = p.querySelector('#gp-e').value;
      if (!pick) return toast('학원을 고르세요', 'bad');
      if (!ds.length) return toast('반복할 요일을 골라 주세요', 'bad');
      if (!s || !en || en <= s) return toast('시간을 확인하세요', 'bad');
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await addMakeup({ student_id: stu.id, dates: ds, title: pick.title, subject: pick.subject ?? null, subject_detail: pick.subject_detail ?? null, start: s, end: en });
        log('보강', `${pick.title} 보강 ${rangeText(ds)} ${s}~${en}`);
        done(ds.length > 1 ? `${pick.title} 보강 ${ds.length}회 추가` : `${pick.title} 보강 ${md(ds[0])} ${s}`);
      } catch (x) { fail(x); btn.disabled = false; }
    });
  };

  // 시간표 위 [+ 보강] 버튼: 휴강과 상관없이 아무 날이나
  const mkBtn = root.querySelector('[data-makeup]');
  mkBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const d0 = mkBtn.dataset.makeup;
    // [보강 | 기타 일정] — 기타는 병원 · 학교 행사처럼 그날 하루만 있는 일정
    open(mkBtn, `<h5>일정 추가</h5>
      <div class="seg gp-seg" id="gp-kind"><button type="button" data-k="mk" class="on">보강</button><button type="button" data-k="etc">기타 일정</button></div>
      <div id="gp-body">${makeupForm(null, d0, '', '')}</div>`, (p) => {
      wireMakeup(p, null, d0);
      p.querySelectorAll('#gp-kind [data-k]').forEach((b) => b.addEventListener('click', () => {
        if (b.classList.contains('on')) return;
        p.querySelectorAll('#gp-kind button').forEach((x) => x.classList.toggle('on', x === b));
        const body = p.querySelector('#gp-body');
        if (b.dataset.k === 'mk') { body.innerHTML = makeupForm(null, d0, '', ''); wireMakeup(p, null, d0); return; }
        body.innerHTML = `
          <span class="gp-lbl">이름</span>
          <div class="gp-row"><input type="text" id="gp-t" placeholder="예: 병원, 학교 행사" maxlength="20" autocomplete="off"></div>
          ${calHtml()}
          <span class="gp-lbl">시간</span>
          <div class="gp-row"><input type="time" step="600" data-t10 id="gp-s"><span>~</span><input type="time" step="600" data-t10 id="gp-e"></div>
          <button type="button" class="gp-go" id="gp-add">추가</button>`;
        let ds = [d0];
        wireCal(p, d0, (x) => { ds = x; });
        p.querySelector('#gp-t').focus();
        p.querySelector('#gp-add').addEventListener('click', async (ev) => {
          const t = p.querySelector('#gp-t').value.trim(), st = p.querySelector('#gp-s').value, en = p.querySelector('#gp-e').value;
          if (!t) return toast('이름을 입력하세요', 'bad');
          if (!ds.length) return toast('반복할 요일을 골라 주세요', 'bad');
          if (!st || !en || en <= st) return toast('시간을 확인하세요', 'bad');
          const btn = ev.currentTarget; btn.disabled = true;
          try {
            await addOneDay({ student_id: stu.id, dates: ds, title: t, start: st, end: en });
            log('일정 추가', `${t} ${rangeText(ds)} ${st}~${en}${ds.length > 1 ? '' : ' (그날만)'}`);
            done(ds.length > 1 ? `${t} ${ds.length}회 추가` : `${t} ${md(ds[0])} ${st} 추가`);
          } catch (x) { fail(x); btn.disabled = false; }
        });
      }));
    });
  });

  grid.addEventListener('click', (e) => {
    const blk = e.target.closest('.blk');
    if (blk) {
      const date = blk.dataset.date, id = blk.dataset.sid;
      const r = rows.find((x) => String(x.id) === id);
      if (!r || (r.category !== '학원' && !r.makeup)) return;
      e.stopPropagation();
      const when = `${md(date)} ${hm(r.start_time)}~${hm(r.end_time)}`;
      if (r.makeup) {
        const mk = r.category === '학원', what = mk ? '보강' : '일정';
        // 같이 잡은 묶음 (같은 이름 · 시간 · 이 날 이후)
        const sibs = rows.filter((x) => x.makeup && x.category === r.category && x.title === r.title && hm(x.start_time) === hm(r.start_time) && hm(x.end_time) === hm(r.end_time) && x.valid_from >= date);
        return open(blk, `<h5>${esc(r.title)} · ${mk ? '보강' : '일정'}</h5><p class="gp-sub">${when}</p>
          <button type="button" class="gp-link danger" id="gp-del">이 날만 취소</button>
          ${sibs.length > 1 ? `<button type="button" class="gp-link danger" id="gp-all">이 날부터 같은 ${what} 모두 취소 (${sibs.length}회)</button>` : ''}`, (p) => {
          p.querySelector('#gp-del').addEventListener('click', async () => {
            try { await removeOverride(r.ov_id); log(`${what} 취소`, `${r.title} ${when} 취소`); done(`${what}을 취소했어요`); } catch (x) { fail(x); }
          });
          p.querySelector('#gp-all')?.addEventListener('click', async () => {
            try {
              await removeOverrides(sibs.map((x) => x.ov_id));
              log(`${what} 취소`, `${r.title} ${md(date)}부터 ${sibs.length}회 취소`);
              done(`${what} ${sibs.length}회를 취소했어요`);
            } catch (x) { fail(x); }
          });
        });
      }
      const offId = rows.offs?.get(`${r.id}|${date}`);
      if (offId) {
        return open(blk, `<h5>${esc(r.title)} · 휴강</h5><p class="gp-sub">${when}</p>
          <button type="button" class="gp-link danger" id="gp-undo">휴강 취소</button>`, (p) => {
          p.querySelector('#gp-undo').addEventListener('click', async () => {
            try { await removeOverride(offId); log('휴강 취소', `${r.title} ${md(date)} 휴강 취소`); done('휴강을 취소했어요'); } catch (x) { fail(x); }
          });
        });
      }
      return open(blk, `<h5>${esc(r.title)}</h5><p class="gp-sub">${when}</p>
        <span class="gp-lbl">휴강</span>
        <div class="gp-chips"><button type="button" data-w="1">이번 주만</button><button type="button" data-w="2">다음 주까지</button></div>
        <p class="gp-note">2주보다 길게 쉬면, 2주 뒤에 한 번 더 눌러 주세요.</p>`, (p) => {
        const doOff = async (until) => {
          try {
            const n = await addOffs(r, date, until);
            log('휴강', `${r.title} ${DOW[isoDow(date)]} 휴강 ${md(date)}${until > date ? ` ~ ${md(until)}` : ''} (${n}회)`);
            toast(n > 1 ? `${r.title} ${n}회 휴강` : `${r.title} ${md(date)} 휴강`);
            // 이어서 물어보기: 보강도 잡을까요? (시간표는 말풍선을 닫을 때 새로 그림)
            p._onClose = () => onChanged?.();
            p.querySelectorAll(':scope > :not(.gp-x)').forEach((x) => x.remove());
            p.insertAdjacentHTML('beforeend', `<h5>${esc(r.title)} 휴강했어요</h5><p class="gp-sub">보강도 잡을까요?</p>
              <div class="gp-ask"><button type="button" class="gp-no" id="gp-no">괜찮아요</button><button type="button" class="gp-go" id="gp-yes">보강 잡기</button></div>`);
            p.querySelector('#gp-no').addEventListener('click', close);
            p.querySelector('#gp-yes').addEventListener('click', () => {
              p.querySelector('.gp-ask').outerHTML = makeupForm(r, addDays(date, 1), hm(r.start_time), hm(r.end_time));
              p.querySelector('.gp-sub').textContent = '날짜 · 시간을 정하세요';
              wireMakeup(p, r, addDays(date, 1));
            });
          } catch (x) { fail(x); }
        };
        p.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => doOff(addDays(date, b.dataset.w === '2' ? 7 : 0))));
      });
    }
  });
}
