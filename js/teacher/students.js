// 선생님 · 학생 관리: 목록 / 등록·수정(오른쪽 패널) / 기존 시트에서 가져오기
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import {
  GRADES, STATUSES, SUBJECTS, TRAITS, digits, fmtPhone, validPhone,
  loadStudents, createStudent, updateStudent, deleteStudent, parseSheet,
} from '../data/students.js';
import { renderScheduleEditor } from './schedule-editor.js';

const STATUS_PILL = { 재원: 'pill-green', 휴원: 'pill-orange', 퇴원: 'pill-gray' };

export async function renderStudents(body) {
  const state = { list: [], status: '재원', level: '전체', q: '', sort: 'seat' };

  body.innerHTML = `
    <div class="t-head">
      <h2>학생 관리 <span class="count" id="cnt"></span></h2>
      <div class="spacer"></div>
      <button type="button" class="btn btn-gray btn-sm" id="imp">가져오기</button>
      <button type="button" class="btn btn-primary btn-sm" id="add">학생 등록</button>
    </div>
    <div class="t-tools">
      <div class="seg" id="segStatus">${['재원', '휴원', '퇴원', '전체'].map((s) => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div>
      <div class="seg" id="segLevel">${['전체', '중등', '고등'].map((s) => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div>
      <div class="seg" id="segSort"><button type="button" data-v="seat">자리순</button><button type="button" data-v="name">이름순</button></div>
      <div class="search"><input id="q" type="search" placeholder="이름 · 학교 · 자리 · 번호 검색" aria-label="검색"></div>
    </div>
    <div class="card table-card"><div class="table-wrap" id="tbl"><div class="empty">불러오는 중</div></div></div>`;

  const seg = (id, key) => {
    const el = $(id);
    const paint = () => $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === state[key]));
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state[key] = b.dataset.v; paint(); draw(); });
    paint();
  };
  seg('#segStatus', 'status');
  seg('#segLevel', 'level');
  seg('#segSort', 'sort');
  $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); draw(); });
  $('#add').addEventListener('click', () => openEditor(null));
  $('#imp').addEventListener('click', openImport);

  async function reload() {
    try { state.list = await loadStudents(); draw(); }
    catch (e) { $('#tbl').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; }
  }

  function filtered() {
    const q = state.q, qd = digits(q);
    return state.list.filter((s) =>
      (state.status === '전체' || s.status === state.status) &&
      (state.level === '전체' || s.grade.startsWith(state.level === '중등' ? '중' : '고')) &&
      (!q || s.name.includes(q) || (s.school || '').includes(q) || (s.seat_no || '') === q ||
        (qd.length >= 3 && (digits(s.parent_phone).includes(qd) || digits(s.student_phone).includes(qd)))));
  }

  const bySeat = (a, b) => {
    if (!a.seat_no !== !b.seat_no) return a.seat_no ? -1 : 1;
    return String(a.seat_no || '').localeCompare(String(b.seat_no || ''), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
  };

  function draw() {
    const rows = filtered().sort(state.sort === 'seat' ? bySeat : (a, b) => a.name.localeCompare(b.name, 'ko'));
    const active = state.list.filter((s) => s.status === '재원').length;
    $('#cnt').textContent = `재원 ${active}명`;
    if (!rows.length) {
      $('#tbl').innerHTML = `<div class="empty">${state.list.length ? '조건에 맞는 학생이 없습니다.' : '<b>등록된 학생이 없습니다</b>학생 등록 또는 가져오기로 추가하세요.'}</div>`;
      return;
    }
    $('#tbl').innerHTML = `
      <table class="tbl">
        <thead><tr><th>자리</th><th>이름</th><th>학년</th><th>학교</th><th>학부모 번호</th><th>로그인 번호</th><th>학생 번호</th><th>특성</th><th>상태</th></tr></thead>
        <tbody>${rows.map((s) => `
          <tr data-id="${esc(s.id)}" tabindex="0">
            <td><span class="seat${s.seat_no ? '' : ' none'}">${esc(s.seat_no || '-')}</span></td>
            <td><b>${esc(s.name)}</b>${s.siblings.length ? ` <span class="tag" title="형제: ${esc(s.siblings.join(', '))}">형제 ${s.siblings.length}</span>` : ''}</td>
            <td>${esc(s.grade)}</td>
            <td>${esc(s.school || '')}</td>
            <td>${esc(s.parent_phone)}</td>
            <td><span class="code">${esc(s.login_code)}</span></td>
            <td class="sub">${esc(s.student_phone || '')}</td>
            <td class="sub">${esc((s.traits || []).join(', '))}</td>
            <td><span class="pill ${STATUS_PILL[s.status]}">${esc(s.status)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    $$('#tbl tbody tr').forEach((tr) => {
      const open = () => openEditor(state.list.find((s) => s.id === tr.dataset.id));
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  /* ---------- 등록 · 수정 패널 ---------- */
  function openEditor(stu) {
    const f = stu ? { ...stu, traits: [...(stu.traits || [])] }
      : { name: '', seat_no: '', grade: '', school: '', parent_phone: '', student_phone: '', status: '재원', traits: [], avoid_subject: '', trait_note: '' };

    const panel = sheet(`
      <div class="drawer">
        <div class="drawer-head"><h3>${stu ? esc(stu.name) : '학생 등록'}</h3>
          <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
        ${stu ? `<div class="drawer-tabs seg seg-wide" id="d-tabs"><button type="button" data-v="sched" class="on">일정</button><button type="button" data-v="info">기본 정보</button></div>` : ''}
        <form class="pane" id="ed" novalidate${stu ? ' hidden' : ''}>
        <div class="drawer-body">
          <div class="row2">
            <div class="field"><label for="f-name">이름</label><div class="input"><input id="f-name" value="${esc(f.name)}" autocomplete="off"></div></div>
            <div class="field field-s"><label for="f-seat">자리번호</label><div class="input"><input id="f-seat" value="${esc(f.seat_no || '')}" autocomplete="off"></div>
              <p class="hint" id="f-seat-hint"></p></div>
          </div>
          <div class="field"><span class="lbl">학년</span><div class="seg seg-wide" id="f-grade">${GRADES.map((g) => `<button type="button" data-v="${g}">${g}</button>`).join('')}</div></div>
          <div class="field"><label for="f-school">학교</label><div class="input"><input id="f-school" value="${esc(f.school || '')}" autocomplete="off"></div></div>
          <div class="field"><label for="f-pp">학부모 휴대폰</label><div class="input"><input id="f-pp" inputmode="numeric" value="${esc(f.parent_phone)}" autocomplete="off" placeholder="010-0000-0000"></div>
            <p class="hint" id="f-pp-hint"></p></div>
          <div class="field"><label for="f-sp">학생 휴대폰 <span class="opt">선택</span></label><div class="input"><input id="f-sp" inputmode="numeric" value="${esc(f.student_phone || '')}" autocomplete="off"></div></div>
          <div class="field"><span class="lbl">상태</span><div class="seg seg-wide" id="f-status">${STATUSES.map((s) => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div></div>
          <div class="field"><span class="lbl">학생 특성 <span class="opt">복수 선택</span></span>
            <div class="chips" id="f-traits">${TRAITS.map((t) => `<button type="button" class="chip-t" data-v="${t}">${t}</button>`).join('')}</div></div>
          <div class="field" id="f-avoid-wrap"><label for="f-avoid">회피 과목</label>
            <div class="input"><select id="f-avoid"><option value="">선택</option>${SUBJECTS.map((s) => `<option${s === f.avoid_subject ? ' selected' : ''}>${s}</option>`).join('')}</select></div></div>
          <div class="field"><label for="f-note">지도 방향 메모</label><textarea id="f-note" class="textarea" rows="3">${esc(f.trait_note || '')}</textarea></div>
          <p class="err" id="f-err" role="alert"></p>
        </div>
        <div class="drawer-foot">
          ${stu ? '<button type="button" class="btn btn-sm btn-danger-text" id="f-del">삭제</button>' : ''}
          <div class="spacer"></div>
          <button type="button" class="btn btn-gray btn-sm" data-close>취소</button>
          <button type="submit" class="btn btn-primary btn-sm" id="f-save">${stu ? '저장' : '등록'}</button>
        </div>
        </form>
        <div class="pane" id="sched"${stu ? '' : ' hidden'}></div>
      </div>`);

    if (stu) {
      const tabs = $('#d-tabs', panel);
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        $$('button', tabs).forEach((x) => x.classList.toggle('on', x === b));
        $('#ed', panel).hidden = b.dataset.v !== 'info';
        $('#sched', panel).hidden = b.dataset.v !== 'sched';
        if (b.dataset.v === 'sched') renderScheduleEditor($('#sched', panel), stu, { canCoach: true });
      });
      renderScheduleEditor($('#sched', panel), stu, { canCoach: true });
    }

    const pick = (id, key) => {
      const el = $(id, panel);
      const paint = () => $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === f[key]));
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; f[key] = b.dataset.v; paint(); });
      paint();
    };
    pick('#f-grade', 'grade');
    pick('#f-status', 'status');

    const traitsEl = $('#f-traits', panel), avoidWrap = $('#f-avoid-wrap', panel);
    const paintTraits = () => {
      $$('button', traitsEl).forEach((b) => b.classList.toggle('on', f.traits.includes(b.dataset.v)));
      avoidWrap.hidden = !f.traits.includes('과목 회피');
    };
    traitsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v;
      f.traits = f.traits.includes(v) ? f.traits.filter((t) => t !== v) : [...f.traits, v];
      paintTraits();
    });
    paintTraits();

    // 학부모 번호 입력 → 자동 서식 + 로그인 번호 · 형제 안내
    const pp = $('#f-pp', panel), hint = $('#f-pp-hint', panel);
    const phoneHint = () => {
      const d = digits(pp.value);
      if (!validPhone(d)) { hint.textContent = ''; return; }
      const sibs = state.list.filter((s) => digits(s.parent_phone) === d && (!stu || s.id !== stu.id)).map((s) => s.name);
      const shared = new Set(state.list.filter((s) => s.login_code === d.slice(-4) && digits(s.parent_phone) !== d).map((s) => s.family_id)).size;
      hint.innerHTML = `로그인 번호 <b>${d.slice(-4)}</b>` +
        (sibs.length ? ` · 형제로 연결: ${esc(sibs.join(', '))}` : '') +
        (shared ? ` · 같은 로그인 번호 사용 가족 ${shared}곳` : '');
    };
    const autoFormat = (inp) => inp.addEventListener('blur', () => { if (digits(inp.value)) inp.value = fmtPhone(inp.value); });
    autoFormat(pp); autoFormat($('#f-sp', panel));
    pp.addEventListener('input', phoneHint);
    phoneHint();

    // 자리번호 중복 안내 (재원 학생 기준)
    const seat = $('#f-seat', panel), seatHint = $('#f-seat-hint', panel);
    const seatCheck = () => {
      const v = seat.value.trim();
      const who = v && state.list.find((s) => s.status === '재원' && (s.seat_no || '') === v && (!stu || s.id !== stu.id));
      seatHint.textContent = who ? `${who.name} 사용 중` : '';
    };
    seat.addEventListener('input', seatCheck);
    seatCheck();

    // 삭제: 두 번 눌러 확인
    const del = $('#f-del', panel);
    if (del) {
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) { armed = true; del.textContent = '한 번 더 누르면 삭제'; setTimeout(() => { armed = false; del.textContent = '삭제'; }, 3000); return; }
        del.disabled = true;
        try { await deleteStudent(stu); panel.close(); toast(`${stu.name} 삭제됨`); reload(); }
        catch (e) { $('#f-err', panel).textContent = '삭제 실패: ' + e.message; del.disabled = false; }
      });
    }

    $('#ed', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      f.name = $('#f-name', panel).value; f.school = $('#f-school', panel).value; f.seat_no = $('#f-seat', panel).value;
      f.parent_phone = pp.value; f.student_phone = $('#f-sp', panel).value;
      f.avoid_subject = $('#f-avoid', panel).value; f.trait_note = $('#f-note', panel).value;
      const err = $('#f-err', panel);
      if (!f.name.trim()) return (err.textContent = '이름을 입력하세요.');
      if (!GRADES.includes(f.grade)) return (err.textContent = '학년을 선택하세요.');
      if (!validPhone(f.parent_phone)) return (err.textContent = '학부모 휴대폰 번호를 확인하세요.');
      if (digits(f.student_phone) && !validPhone(f.student_phone)) return (err.textContent = '학생 휴대폰 번호를 확인하세요.');
      const btn = $('#f-save', panel); btn.disabled = true; err.textContent = '';
      try {
        if (stu) await updateStudent(stu.id, f, stu); else await createStudent(f);
        panel.close(); toast(stu ? '저장되었습니다' : `${f.name.trim()} 등록됨`); reload();
      } catch (ex) { err.textContent = '저장 실패: ' + ex.message; btn.disabled = false; }
    });
    if (!stu) setTimeout(() => $('#f-name', panel).focus(), 50);
  }

  /* ---------- 가져오기 ---------- */
  function openImport() {
    let parsed = [];
    const panel = sheet(`
      <div class="modal" role="dialog" aria-label="학생 가져오기">
        <div class="drawer-head"><h3>기존 시트에서 가져오기</h3>
          <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
        <div class="drawer-body">
          <p class="desc-s">기존 학생 시트를 첫 행(머리글)부터 전체 선택해 복사한 뒤 아래에 붙여넣으세요.</p>
          <textarea id="im-text" class="textarea mono" rows="5" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>
          <label class="check"><input type="checkbox" id="im-skip" checked> 퇴원 학생 제외</label>
          <div id="im-prev"></div>
          <p class="err" id="im-err" role="alert"></p>
        </div>
        <div class="drawer-foot"><span class="sub" id="im-sum"></span><div class="spacer"></div>
          <button type="button" class="btn btn-gray btn-sm" data-close>취소</button>
          <button type="button" class="btn btn-primary btn-sm" id="im-go" disabled>가져오기</button></div>
      </div>`, 'center');

    const text = $('#im-text', panel), prev = $('#im-prev', panel), go = $('#im-go', panel), err = $('#im-err', panel);
    const existing = new Set(state.list.map((s) => s.name + '|' + digits(s.parent_phone)));

    function preview() {
      err.textContent = '';
      if (!text.value.trim()) { prev.innerHTML = ''; go.disabled = true; $('#im-sum', panel).textContent = ''; return; }
      const r = parseSheet(text.value);
      if (r.error) { err.textContent = r.error; prev.innerHTML = ''; go.disabled = true; return; }
      const skipOut = $('#im-skip', panel).checked;
      parsed = r.items.map((it) => ({
        ...it,
        state: it.problem ? 'bad' : (skipOut && it.status === '퇴원') ? 'skip'
          : existing.has(it.name + '|' + digits(it.parent_phone)) ? 'dup' : 'new',
      }));
      const n = parsed.filter((p) => p.state === 'new');
      const fams = new Set(n.map((p) => digits(p.parent_phone))).size;
      const label = { new: ['신규', 'pill-blue'], dup: ['이미 등록', 'pill-gray'], skip: ['제외', 'pill-gray'], bad: ['오류', 'pill-red'] };
      prev.innerHTML = `<div class="table-wrap prev"><table class="tbl tbl-s">
        <thead><tr><th>자리</th><th>이름</th><th>학년</th><th>학교</th><th>학부모 번호</th><th>상태</th><th></th></tr></thead>
        <tbody>${parsed.map((p) => `<tr class="${p.state === 'new' ? '' : 'dim'}"><td>${esc(p.seat_no || '')}</td><td>${esc(p.name)}</td><td>${esc(p.grade)}</td><td>${esc(p.school)}</td>
          <td>${esc(fmtPhone(p.parent_phone))}</td><td>${esc(p.status)}</td>
          <td><span class="pill ${label[p.state][1]}">${p.problem ? esc(p.problem) : label[p.state][0]}</span></td></tr>`).join('')}</tbody></table></div>`;
      $('#im-sum', panel).textContent = `신규 ${n.length}명 · ${fams}가족`;
      go.disabled = !n.length;
      go.textContent = n.length ? `${n.length}명 가져오기` : '가져오기';
    }
    text.addEventListener('input', preview);
    $('#im-skip', panel).addEventListener('change', preview);

    go.addEventListener('click', async () => {
      const todo = parsed.filter((p) => p.state === 'new');
      go.disabled = true; text.disabled = true;
      let done = 0;
      try {
        for (const p of todo) {
          await createStudent({ ...p, traits: [] });
          done += 1; go.textContent = `${done} / ${todo.length}`;
        }
        panel.close(); toast(`${done}명 가져왔습니다`); reload();
      } catch (e) {
        err.textContent = `${done}명 저장 후 실패: ${e.message}`; reload();
      }
    });
    setTimeout(() => text.focus(), 50);
  }

  await reload();
  const openId = new URLSearchParams(location.hash.split('?')[1] || '').get('open');
  if (openId) {
    history.replaceState(null, '', '#/students');
    const s = state.list.find((x) => x.id === openId);
    if (s) openEditor(s);
  }
}
