// 선생님 · 설정: 선생님 관리 / 교시 시간표(전자칠판) / 학년 올리기
//  학교별 학사일정(방학 · 시험 · 휴업, 직접 입력)
import { $, $$, esc, toast, X, fadeOut } from '../ui.js';
import { loadStudents } from '../data/students.js';
import { getPeriods, savePeriods, DEFAULT_PERIODS } from '../data/schedules.js';
import { loadTeachers, addTeacher, removeTeacher, updateTeacher, changeMyPassword, teacherId, promoteGrades, lastPromoted, NEXT_GRADE, EVENT_KINDS, loadSchoolEvents, addSchoolEvents, deleteSchoolEvent } from '../data/settings.js';
import { toMin, today, short } from '../date.js';
import { getKakao, saveKakao } from '../data/chat.js';

export async function renderSettings(body, { me } = {}) {
  body.innerHTML = `
    <div class="t-head"><h2>설정</h2></div>
    <div class="set-grid">
      <section class="card set-sec" id="s-teach"><div class="set-h"><h3>선생님 관리</h3></div><div class="empty">불러오는 중</div></section>
      <section class="card set-sec" id="s-per"><div class="set-h"><h3>교시 시간표</h3><span>전자칠판</span></div><div class="empty">불러오는 중</div></section>
      <section class="card set-sec set-wide" id="s-cal"><div class="set-h"><h3>학교별 학사일정</h3><span>방학 · 시험 · 휴업</span></div><div class="empty">불러오는 중</div></section>
      <section class="card set-sec" id="s-kakao"><div class="set-h"><h3>카카오톡 채널</h3><span>학습 문의 창에서 운영 문의 안내</span></div>
        <div class="field"><label for="k-url">채널 주소</label><div class="input"><input id="k-url" placeholder="예: https://pf.kakao.com/_xxxx" autocomplete="off"></div></div>
        <p class="sub-s">학부모가 학원비 · 수강 등을 물으면 이 주소로 안내합니다.</p>
        <button type="button" class="btn btn-primary btn-sm" id="k-save">저장</button></section>
      <section class="card set-sec" id="s-grade"><div class="set-h"><h3>학년 올리기</h3><span>새 학년도 시작 때 1회</span></div></section>
    </div>`;
  let per = [], editing = null;
  const PEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
  drawTeachers(); drawPeriods(); drawGrade(); drawCal();
  getKakao().then((u) => { const i = $('#k-url'); if (i) i.value = u; }).catch(() => {});
  $('#k-save').addEventListener('click', async () => {
    const u = $('#k-url').value.trim();
    if (u && !/^https?:\/\//.test(u)) return toast('주소는 https:// 로 시작해야 합니다');
    try { await saveKakao(u); toast('저장했습니다'); } catch (x) { toast('저장 실패: ' + x.message); }
  });

  /* ---------- 선생님 관리 ---------- */
  async function drawTeachers() {
    const el = $('#s-teach'); if (!el) return;
    let list = [];
    try { list = await loadTeachers(); } catch (e) { el.innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    el.innerHTML = `<div class="set-h"><h3>선생님 관리</h3><span>${list.length}명</span></div>
      <ul class="set-list">${list.map((t, i) => editing === t.email ? `<li class="t-edit">
          <div class="row3">
            <div class="field"><label>이름</label><div class="input sm"><input id="e-name" value="${esc(t.name)}" autocomplete="off"></div></div>
            <div class="field"><label>아이디</label><div class="input sm"><input id="e-id" value="${esc(teacherId(t.email))}" autocomplete="off"></div></div>
            <div class="field"><label>새 비밀번호 <span class="opt">바꿀 때만</span></label><div class="input sm"><input id="e-pw" type="password" autocomplete="new-password" placeholder="6자 이상"></div></div>
          </div>
          <p class="err" id="e-err"></p>
          <div class="t-edit-b"><button type="button" class="btn btn-gray btn-sm" id="e-cancel">취소</button><button type="button" class="btn btn-primary btn-sm" id="e-save" data-email="${esc(t.email)}">저장</button></div>
        </li>` : `<li><b>${esc(t.name)}</b><span class="code">${esc(teacherId(t.email))}</span>
        ${t.email === me?.email ? '<span class="pill pill-blue">나</span>' : ''}
        <span class="t-acts"><button type="button" class="icon-btn sm" data-ed="${esc(t.email)}" aria-label="수정">${PEN}</button>
        ${t.email === me?.email ? '<span class="t-ph"></span>' : `<button type="button" class="icon-btn sm" data-rm="${esc(t.email)}" aria-label="삭제">${X}</button>`}</span></li>`).join('')}</ul>
      <div class="set-form">
        <h4>선생님 추가</h4>
        <div class="row3">
          <div class="field"><label for="t-name">이름</label><div class="input"><input id="t-name" autocomplete="off"></div></div>
          <div class="field"><label for="t-id">아이디</label><div class="input"><input id="t-id" autocomplete="off" placeholder="영문·숫자"></div></div>
          <div class="field"><label for="t-pw">비밀번호</label><div class="input"><input id="t-pw" type="password" autocomplete="new-password" placeholder="6자 이상"></div></div>
        </div>
        <p class="err" id="t-err"></p>
        <button type="button" class="btn btn-primary btn-sm" id="t-add">추가</button>
      </div>
      <div class="set-form">
        <h4>내 비밀번호 변경</h4>
        <div class="row3">
          <div class="field"><label for="p-new">새 비밀번호</label><div class="input"><input id="p-new" type="password" autocomplete="new-password" placeholder="6자 이상"></div></div>
          <div class="field"><label for="p-new2">새 비밀번호 확인</label><div class="input"><input id="p-new2" type="password" autocomplete="new-password"></div></div>
          <div class="field set-btn-f"><button type="button" class="btn btn-gray btn-sm" id="p-go">변경</button></div>
        </div>
        <p class="err" id="p-err"></p>
      </div>`;
    $$('[data-ed]', el).forEach((b) => b.addEventListener('click', () => { editing = b.dataset.ed; drawTeachers(); }));
    $('#e-cancel', el)?.addEventListener('click', () => { editing = null; drawTeachers(); });
    $('#e-save', el)?.addEventListener('click', async (e) => {
      const old = e.currentTarget.dataset.email, err = $('#e-err', el); err.textContent = '';
      const name = $('#e-name', el).value.trim(), id = $('#e-id', el).value.trim().toLowerCase(), pw = $('#e-pw', el).value;
      if (!name) return (err.textContent = '이름을 입력하세요.');
      if (!/^[a-z0-9._-]{2,20}$/.test(id)) return (err.textContent = '아이디는 영문 소문자·숫자 2~20자로 입력하세요.');
      if (pw && pw.length < 6) return (err.textContent = '비밀번호는 6자 이상이어야 합니다.');
      const idChanged = id !== teacherId(old);
      try {
        await updateTeacher(old, { id: idChanged ? id : null, name, password: pw || null });
        editing = null;
        if (old === me?.email && (idChanged || pw)) { toast('변경되었습니다. 다시 로그인하세요'); setTimeout(() => location.reload(), 900); return; }
        toast('변경되었습니다'); drawTeachers();
      } catch (x) { err.textContent = '변경 실패: ' + x.message; }
    });
    $$('[data-rm]', el).forEach((b) => {
      let armed = false;
      b.addEventListener('click', async () => {
        if (!armed) { armed = true; b.classList.add('armed'); toast('한 번 더 누르면 삭제됩니다'); setTimeout(() => { armed = false; b.classList.remove('armed'); }, 3000); return; }
        try { await removeTeacher(b.dataset.rm); await fadeOut(b.closest('li')); toast('삭제되었습니다'); drawTeachers(); } catch (e) { toast('삭제 실패: ' + e.message); }
      });
    });
    $('#t-add', el).addEventListener('click', async (e) => {
      const name = $('#t-name', el).value.trim(), id = $('#t-id', el).value.trim().toLowerCase(), password = $('#t-pw', el).value;
      const err = $('#t-err', el); err.textContent = '';
      if (!name) return (err.textContent = '이름을 입력하세요.');
      if (!/^[a-z0-9._-]{2,20}$/.test(id)) return (err.textContent = '아이디는 영문 소문자·숫자 2~20자로 입력하세요.');
      if (password.length < 6) return (err.textContent = '비밀번호는 6자 이상이어야 합니다.');
      const btn = e.currentTarget; btn.disabled = true;
      try { await addTeacher({ id, name, password }); toast(`${name} 선생님이 추가되었습니다`); drawTeachers(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
    $('#p-go', el).addEventListener('click', async () => {
      const a = $('#p-new', el).value, b = $('#p-new2', el).value, err = $('#p-err', el);
      err.textContent = '';
      if (a.length < 6) return (err.textContent = '비밀번호는 6자 이상이어야 합니다.');
      if (a !== b) return (err.textContent = '두 비밀번호가 다릅니다.');
      try { await changeMyPassword(a); toast('비밀번호가 변경되었습니다'); $('#p-new', el).value = ''; $('#p-new2', el).value = ''; }
      catch (x) { err.textContent = '변경 실패: ' + x.message; }
    });
  }

  /* ---------- 교시 시간표 ---------- */
  async function drawPeriods(reset = false) {
    const el = $('#s-per'); if (!el) return;
    if (!per.length || reset) { try { per = reset ? DEFAULT_PERIODS.map((p) => ({ ...p })) : (await getPeriods()).map((p) => ({ ...p })); } catch { per = DEFAULT_PERIODS.map((p) => ({ ...p })); } }
    el.innerHTML = `<div class="set-h"><h3>교시 시간표</h3><span>전자칠판에 지금 교시 · 남은 시간 표시</span></div>
      <div class="per-h"><span>이름</span><span>시작</span><span>끝</span><span></span></div>
      <div class="per-list">${per.map((p, i) => `<div class="per-row">
        <div class="input sm"><input data-i="${i}" data-f="label" value="${esc(p.label)}"></div>
        <div class="input sm"><input type="time" data-i="${i}" data-f="start" value="${esc(p.start)}"></div>
        <div class="input sm"><input type="time" data-i="${i}" data-f="end" value="${esc(p.end)}"></div>
        <button type="button" class="icon-btn sm" data-del="${i}" aria-label="삭제">${X}</button></div>`).join('')}</div>
      <div class="set-acts"><button type="button" class="link-s" id="per-add">+ 교시 추가</button>
        <button type="button" class="link-s sub" id="per-reset">기본값으로</button><div class="spacer"></div>
        <p class="err" id="per-err"></p><button type="button" class="btn btn-primary btn-sm" id="per-save">저장</button></div>`;
    el.oninput = (e) => { const t = e.target; if (t.dataset.i != null) per[Number(t.dataset.i)][t.dataset.f] = t.value; };
    el.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.del != null) { per.splice(Number(b.dataset.del), 1); return drawPeriods(); }
      if (b.id === 'per-add') { const last = per[per.length - 1]; per.push({ label: `${per.length + 1}교시`, start: last?.end || '08:00', end: last?.end || '09:00' }); return drawPeriods(); }
      if (b.id === 'per-reset') return drawPeriods(true);
      if (b.id === 'per-save') {
        const err = $('#per-err', el); err.textContent = '';
        const list = per.map((p) => ({ label: p.label.trim(), start: p.start, end: p.end })).sort((a, c) => toMin(a.start) - toMin(c.start));
        const bad = list.find((p, i) => !p.label || !p.start || !p.end || toMin(p.end) <= toMin(p.start) || (i && toMin(p.start) < toMin(list[i - 1].end)));
        if (bad) return (err.textContent = `${bad.label || '이름 없음'}: 시간을 확인하세요 (끝 > 시작, 앞 교시와 겹침 없음).`);
        try { await savePeriods(list); per = list; toast('교시 시간표가 저장되었습니다'); drawPeriods(); } catch (x) { err.textContent = '저장 실패: ' + x.message; }
      }
    };
  }

  /* ---------- 학년 올리기 ---------- */
  //  새 학년도(3월) 1회 · 재원·휴원 학생 · 고3은 그대로 두거나 졸업(퇴원) 처리 · 올해 이미 했으면 경고
  async function drawGrade() {
    const el = $('#s-grade'); if (!el) return;
    let list = [], last = null;
    try { [list, last] = await Promise.all([loadStudents().then((l) => l.filter((s) => s.status !== '퇴원')), lastPromoted().catch(() => null)]); }
    catch (e) { el.insertAdjacentHTML('beforeend', `<div class="empty">불러오기 실패</div>`); return; }
    const n = (g) => list.filter((s) => s.grade === g).length;
    const year = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }));
    const done = last && last.year === year;
    const toHigh = list.filter((s) => s.grade === '중3');
    el.innerHTML = `<div class="set-h"><h3>학년 올리기</h3><span>새 학년도 시작 때 1회 · 재원·휴원 학생</span></div>
      ${done ? `<p class="g-warn">${year}년에 이미 올렸습니다 (${short(String(last.at).slice(0, 10))}). 다시 누르면 한 학년 더 올라갑니다.</p>` : ''}
      <div class="grade-flow">${Object.entries(NEXT_GRADE).map(([a, b]) => `<div><span>${a}</span><i>→</i><span>${b}</span><b>${n(a)}명</b></div>`).join('')}
        <div class="dim" id="g-hs"><span>고3</span><i></i><span id="g-hs-to">그대로</span><b>${n('고3')}명</b></div></div>
      <label class="g-grad"><input type="checkbox" id="g-grad"> 고3은 졸업 처리 (퇴원으로 바꿈)</label>
      ${toHigh.length ? `<p class="hint">중3 → 고1 ${toHigh.length}명은 학교 이름을 학생 정보에서 고등학교로 바꿔 주세요.</p>` : ''}
      <button type="button" class="btn btn-gray btn-sm" id="g-go">전체 학년 올리기</button>`;
    $('#g-grad', el).addEventListener('change', (e) => { $('#g-hs-to', el).textContent = e.target.checked ? '졸업(퇴원)' : '그대로'; });
    let armed = false;
    $('#g-go', el).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      if (!armed) { armed = true; b.textContent = '한 번 더 누르면 실행'; b.classList.add('btn-danger'); setTimeout(() => { armed = false; b.textContent = '전체 학년 올리기'; b.classList.remove('btn-danger'); }, 4000); return; }
      b.disabled = true;
      try {
        const r = await promoteGrades(list, $('#g-grad', el).checked);
        toast(r ? `${r.moved}명 학년을 올렸습니다${r.graduated ? ` · ${r.graduated}명 졸업` : ''}` : '학년을 올렸습니다');
        drawGrade();
      } catch (x) { toast('실패: ' + x.message, 'bad'); b.disabled = false; }
    });
  }

  /* ---------- 학교별 학사일정 ---------- */
  //  학교 = 재원생 학교 이름 그대로 · 여러 학교 한 번에 추가 가능
  const cal = { schools: [], kind: '방학' };
  async function drawCal() {
    const el = $('#s-cal'); if (!el) return;
    let stu = [], evs = [];
    try { [stu, evs] = await Promise.all([loadStudents(), loadSchoolEvents()]); }
    catch (e) { el.innerHTML = `<div class="set-h"><h3>학교별 학사일정</h3></div><div class="empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    const t = today();
    const count = new Map();
    for (const s of stu.filter((x) => x.status === '재원' && x.school)) count.set(s.school, (count.get(s.school) || 0) + 1);
    for (const e of evs) if (!count.has(e.school)) count.set(e.school, 0);
    const schools = [...count.keys()].sort((a, b) => a.localeCompare(b, 'ko'));
    const md = (d) => short(d).replace(/\(.\)/, '');
    const dday = (e) => (e.end_date < t ? '' : e.start_date <= t ? '<em class="cal-now">진행 중</em>'
      : `<em>D-${Math.round((new Date(e.start_date) - new Date(t)) / 86400000)}</em>`);
    el.innerHTML = `<div class="set-h"><h3>학교별 학사일정</h3><span>방학 · 시험 · 휴업</span></div>
      <div class="cal-form">
        <div class="field"><span class="lbl">학교 <span class="opt">여러 개 선택 가능</span></span>
          <div class="chips" id="c-sch">${schools.map((x) => `<button type="button" class="chip-t" data-v="${esc(x)}">${esc(x)}${count.get(x) ? ` <small>${count.get(x)}</small>` : ''}</button>`).join('') || '<span class="sub-s">학생 정보에 학교가 없습니다.</span>'}</div></div>
        <div class="cal-row">
          <div class="field"><span class="lbl">구분</span><div class="seg" id="c-kind">${EVENT_KINDS.map((k) => `<button type="button" data-v="${k}">${k}</button>`).join('')}</div></div>
          <div class="field grow"><label for="c-title">이름 <span class="opt">선택</span></label><div class="input"><input id="c-title" placeholder="예: 겨울방학, 2학기 기말고사" autocomplete="off"></div></div>
          <div class="field"><label for="c-from">시작</label><div class="input"><input id="c-from" type="date"></div></div>
          <div class="field"><label for="c-to">끝</label><div class="input"><input id="c-to" type="date"></div></div>
          <button type="button" class="btn btn-primary" id="c-add">추가</button>
        </div>
        <p class="err" id="c-err"></p>
      </div>
      <div class="cal-grid">${schools.map((x) => {
        const list = evs.filter((e) => e.school === x);
        return `<div class="cal-sch"><h4>${esc(x)}</h4>${list.length ? `<ul>${list.map((e) => `<li class="${e.end_date < t ? 'past' : ''}">
          <span class="cal-k k-${esc(e.kind)}">${esc(e.kind)}</span>
          <div class="cal-t"><b>${esc(e.title || e.kind)}</b><span>${md(e.start_date)}${e.end_date !== e.start_date ? ` – ${md(e.end_date)}` : ''}</span></div>
          ${dday(e)}<button type="button" class="icon-btn sm" data-del="${esc(e.id)}" aria-label="삭제">${X}</button></li>`).join('')}</ul>` : '<p class="sub-s">등록된 일정이 없습니다.</p>'}</div>`;
      }).join('')}</div>`;
    const paint = () => {
      $$('#c-sch [data-v]', el).forEach((b) => b.classList.toggle('on', cal.schools.includes(b.dataset.v)));
      $$('#c-kind button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === cal.kind));
    };
    paint();
    $('#c-sch', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const v = b.dataset.v; cal.schools = cal.schools.includes(v) ? cal.schools.filter((x) => x !== v) : [...cal.schools, v]; paint();
    });
    $('#c-kind', el).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { cal.kind = b.dataset.v; paint(); } });
    $('#c-from', el).addEventListener('change', (e) => { const to = $('#c-to', el); if (!to.value || to.value < e.target.value) to.value = e.target.value; });
    $('#c-add', el).addEventListener('click', async () => {
      const err = $('#c-err', el); err.textContent = '';
      const from = $('#c-from', el).value, to = $('#c-to', el).value || from, title = $('#c-title', el).value.trim();
      if (!cal.schools.length) return (err.textContent = '학교를 선택하세요.');
      if (!from || to < from) return (err.textContent = '날짜를 확인하세요.');
      try {
        await addSchoolEvents(cal.schools.map((school) => ({ school, kind: cal.kind, title: title || null, start_date: from, end_date: to })));
        toast(`${cal.schools.length}개 학교에 추가했습니다`); drawCal();
      } catch (x) { err.textContent = '저장 실패: ' + x.message; }
    });
    $$('[data-del]', el).forEach((b) => {
      let armed = false;
      b.addEventListener('click', async () => {
        if (!armed) { armed = true; b.classList.add('armed'); setTimeout(() => { armed = false; b.classList.remove('armed'); }, 3000); return; }
        try { await deleteSchoolEvent(b.dataset.del); await fadeOut(b.closest('li')); toast('삭제했습니다'); drawCal(); } catch (x) { toast('삭제 실패: ' + x.message); }
      });
    });
  }
}
