// 선생님 · 성적: [학생별] 학생 카드(최근 시험 요약) → 돋보기 자세히 · 연필 입력/수정 / [시험별 입력 현황] 한 시험의 전체 학생
//  입력은 선생님만. 시험 총평(exams.feedback) + 과목 피드백(exam_scores.note, 선택) → 자세히 보기 · 상담 참고사항에 표시
import { $, $$, esc, toast, sheet, X, fadeOut, popIn } from '../ui.js';
import { SUBJECTS, loadStudents } from '../data/students.js';
import {
  BASIC, isMock, examOrder, examNames, schoolYear, recentExam, scaleOf,
  loadExamRound, loadAllExams, loadStudentSubjects, saveExam, deleteExam, summarize, prevOf, subjectChange,
} from '../data/exams.js';
import { summaryCard } from '../views/exam-summary.js';

const SUB_COLOR = { 국어: '#3182F6', 수학: '#F59E0B', 영어: '#10B981', 사회: '#8B5CF6', 과학: '#06B6D4', 한국사: '#EC4899', 기타: '#8B95A1' };
const ACH = ['A', 'B', 'C', 'D', 'E'];
const bySeat = (a, b) => {
  if (!a.seat_no !== !b.seat_no) return a.seat_no ? -1 : 1;
  return String(a.seat_no || '').localeCompare(String(b.seat_no || ''), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
};
const subName = (s) => `${s.subject}${s.subject_detail ? ` ${s.subject_detail}` : ''}`;

// 점수 한 칸: "92 · 2등급" / "88 · A" / "84 · 91%"
function scoreText(s, type) {
  const v = isMock(type) ? (s.percentile != null ? `${s.percentile}%` : '') : (s.grade_level ?? s.achievement ?? '');
  return [s.raw_score ?? '', v].filter((x) => x !== '').join(' · ') || '-';
}

export async function renderExams(body) {
  const sy = schoolYear();
  const st = {
    view: 'student', students: [], all: new Map(),
    year: sy, type: recentExam(), level: '전체', q: '', has: '전체', round: [],
  };

  body.innerHTML = `
    <div class="t-head"><h2>성적 관리 <span class="count" id="cnt"></span></h2><div class="spacer"></div>
      <div class="seg" id="ex-view"><button type="button" data-v="student">학생별</button><button type="button" data-v="round">시험별 입력 현황</button></div></div>
    <div id="ex-body"></div>`;

  const viewSeg = $('#ex-view');
  const paintView = () => $$('button', viewSeg).forEach((b) => b.classList.toggle('on', b.dataset.v === st.view));
  viewSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === st.view) return;
    st.view = b.dataset.v; paintView(); draw();
  });
  paintView();

  try { st.students = (await loadStudents()).filter((s) => s.status === '재원').sort(bySeat); }
  catch (e) { $('#ex-body').innerHTML = `<div class="card empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
  draw();

  function draw() { return st.view === 'round' ? drawRound() : drawCards(); }
  const reload = () => draw();

  /* ---------- 학생별: 학생 카드 (최근 시험 요약) ---------- */
  async function drawCards() {
    $('#cnt').textContent = '';
    $('#ex-body').innerHTML = `
      <div class="t-tools">
        <div class="seg" id="xc-level">${['전체', '중등', '고등'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>
        <div class="seg" id="xc-has">${['전체', '입력됨', '미입력'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>
        <div class="search"><input id="xc-q" type="search" placeholder="이름 · 자리 검색" aria-label="검색" value="${esc(st.q)}"></div>
      </div>
      <div class="xc-grid" id="xc-grid"><div class="card empty">불러오는 중</div></div>`;
    const seg = (id, key) => {
      const el = $(id);
      const paint = () => $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === st[key]));
      paint();
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st[key] = b.dataset.v; paint(); paintCards(); });
    };
    seg('#xc-level', 'level'); seg('#xc-has', 'has');
    $('#xc-q').addEventListener('input', (e) => { st.q = e.target.value.trim(); paintCards(); });
    try { st.all = await loadAllExams(); st.allLoaded = true; }
    catch (e) { $('#xc-grid').innerHTML = `<div class="card empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    paintCards();
  }

  function paintCards() {
    const grid = $('#xc-grid'); if (!grid) return;
    const has = (s) => (st.all.get(s.id) || []).some((e) => e.scores.length);
    const base = st.students.filter((s) => st.level === '전체' || s.grade.startsWith(st.level === '중등' ? '중' : '고'));
    const list = base.filter((s) =>
      (st.has === '전체' || (st.has === '입력됨') === has(s)) &&
      (!st.q || s.name.includes(st.q) || (s.seat_no || '') === st.q));
    $('#cnt').textContent = `입력 ${base.filter(has).length} / ${base.length}명`;
    if (!list.length) { grid.innerHTML = '<div class="card empty">조건에 맞는 학생이 없습니다.</div>'; return; }
    grid.innerHTML = list.map((s) => {
      const exams = st.all.get(s.id) || [];
      const sum = summarize(exams);
      return `<article class="card xc${sum ? '' : ' none'}" data-id="${esc(s.id)}" tabindex="0" aria-label="${esc(s.name)} 성적 자세히">
        <div class="xc-h">
          <span class="seat${s.seat_no ? '' : ' none'}">${esc(s.seat_no || '-')}</span>
          <div class="xc-name"><b>${esc(s.name)}</b><small>${esc(s.grade)}${s.school ? ` · ${esc(s.school)}` : ''}</small></div>
          <div class="xc-acts">
            ${sum ? `<button type="button" class="icon-btn" data-zoom aria-label="자세히 보기" title="자세히 보기">${ZOOM}</button>` : ''}
            <button type="button" class="icon-btn" data-edit aria-label="성적 입력 · 수정" title="성적 입력 · 수정">${PEN}</button>
          </div>
        </div>
        ${sum ? `<p class="xc-latest"><b>${esc(examName(sum.latest))}</b>${sum.prev ? ` · ${esc(examName(sum.prev))} 대비` : ''}</p>
          ${summaryCard(sum, { compact: true })}`
        : `<div class="xc-empty"><p>입력된 성적이 없습니다.</p><button type="button" class="btn btn-sm btn-gray" data-edit>성적 입력</button></div>`}
      </article>`;
    }).join('');
    $$('.xc', grid).forEach((card) => {
      const stu = st.students.find((x) => x.id === card.dataset.id);
      const exams = () => st.all.get(stu.id) || [];
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit]')) return openPicker(stu, exams(), st.all, reload);
        if (!exams().some((x) => x.scores.length)) return openPicker(stu, exams(), st.all, reload);
        openDetail(stu, exams(), st.all, reload);
      });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) card.click(); });
    });
  }

  /* ---------- 시험별 입력 현황 ---------- */
  async function drawRound() {
    const years = [sy, sy - 1, sy - 2];
    if (!st.allLoaded) { try { st.all = await loadAllExams(); st.allLoaded = true; } catch { /* 기본 시험만 */ } }
    const types = examNames(st.all, st.year);
    if (!types.includes(st.type)) st.type = types.includes(recentExam()) ? recentExam() : types[0];
    $('#ex-body').innerHTML = `
      <div class="t-tools">
        <div class="input sm ex-year"><select id="ex-year">${years.map((y) => `<option value="${y}"${y === st.year ? ' selected' : ''}>${y}학년도</option>`).join('')}</select></div>
        <div class="seg ex-types" id="ex-type">${types.map((t) => `<button type="button" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="seg" id="ex-level">${['전체', '중등', '고등'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>
        <div class="search"><input id="ex-q" type="search" placeholder="이름 · 자리 검색" aria-label="검색" value="${esc(st.q)}"></div>
      </div>
      <div class="card table-card"><div class="table-wrap" id="ex-tbl"><div class="empty">불러오는 중</div></div></div>`;
    const seg = (id, key, after) => {
      const el = $(id); if (!el) return;
      $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === st[key]));
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st[key] = b.dataset.v; after(); });
    };
    seg('#ex-type', 'type', () => drawRound());
    seg('#ex-level', 'level', () => paintRound());
    $('#ex-year').addEventListener('change', (e) => { st.year = Number(e.target.value); drawRound(); });
    $('#ex-q').addEventListener('input', (e) => { st.q = e.target.value.trim(); paintRound(); });
    try { st.round = await loadExamRound(st.year, st.type); }
    catch (e) { $('#ex-tbl').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    paintRound();
  }

  function paintRound() {
    const el = $('#ex-tbl'); if (!el) return;
    const list = st.students.filter((s) =>
      (st.level === '전체' || s.grade.startsWith(st.level === '중등' ? '중' : '고')) &&
      (!st.q || s.name.includes(st.q) || (s.seat_no || '') === st.q));
    const byStu = new Map(st.round.map((e) => [e.student_id, e]));
    const done = list.filter((s) => byStu.get(s.id)?.scores.length).length;
    $('#cnt').textContent = `${st.year} ${st.type} · 입력 ${done} / ${list.length}`;
    if (!list.length) { el.innerHTML = '<div class="empty">조건에 맞는 학생이 없습니다.</div>'; return; }
    el.innerHTML = `<table class="tbl ex-tbl">
      <thead><tr><th>자리</th><th>이름</th><th>학년</th><th>과목별 성적</th><th>총평</th></tr></thead>
      <tbody>${list.map((s) => {
        const ex = byStu.get(s.id);
        const sc = ex?.scores || [];
        return `<tr data-id="${esc(s.id)}" tabindex="0"${sc.length ? '' : ' class="dim"'}>
          <td><span class="seat${s.seat_no ? '' : ' none'}">${esc(s.seat_no || '-')}</span></td>
          <td><b>${esc(s.name)}</b></td><td>${esc(s.grade)}</td>
          <td class="ex-cells-td"><div class="ex-cells">${sc.length ? sc.map((x) => `<span class="ex-cell"><i style="background:${SUB_COLOR[x.subject]}"></i>${esc(subName(x))}<b>${esc(scoreText(x, st.type))}</b></span>`).join('') : '<span class="sub">미입력</span>'}</div></td>
          <td>${ex?.feedback ? '<span class="pill pill-green">작성</span>' : '<span class="sub">-</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    $$('tbody tr', el).forEach((tr) => {
      const open = () => openEditor(st.students.find((s) => s.id === tr.dataset.id), st.year, st.type, byStu.get(tr.dataset.id), () => { st.allLoaded = false; drawRound(); });
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }
}

const examName = (e) => `${e.school_year} ${e.exam_type}`;
const ZOOM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const SAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
const valLabel = (s, type) => isMock(type) ? (s.percentile != null ? `백분위 ${s.percentile}` : '')
  : s.grade_level != null ? `${s.grade_level}등급` : s.achievement ? `성취도 ${s.achievement}` : '';

/* ---------- 자세히 보기 (돋보기): 시험 고르기 → 과목별 점수 · 변화 · 피드백 · 총평 + 전체 기록 ---------- */
function openDetail(stu, exams, allMap, onChanged) {
  const list = [...exams].filter((e) => e.scores.length || e.feedback).sort(examOrder).reverse();   // 최신 먼저
  let cur = list[0]?.id;
  const m = sheet(`
    <div class="modal modal-xd" role="dialog" aria-label="${esc(stu.name)} 성적">
      <div class="drawer-head"><h3>${esc(stu.name)} <span class="h-sub">${esc(stu.grade)}${stu.school ? ` · ${esc(stu.school)}` : ''}</span></h3>
        <button type="button" class="icon-btn" id="xd-edit" aria-label="성적 입력 · 수정" title="성적 입력 · 수정">${PEN}</button>
        <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body" id="xd-body"></div>
    </div>`, 'center');
  const bodyEl = $('#xd-body', m);

  const hist = (title, l) => {
    if (!l.length) return '';
    const mock = title === '모의고사';
    const subs = [...new Set(l.flatMap((e) => e.scores.map(subName)))];
    const asc = [...l].sort(examOrder);
    return `<section class="xd-sec"><div class="xd-sec-h"><h4>${title} 기록</h4><span>${mock ? '원점수 · 백분위' : '원점수 · 등급(성취도)'}</span></div>
      <div class="table-wrap"><table class="tbl tbl-s ex-hist">
        <thead><tr><th>시험</th>${subs.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead>
        <tbody>${asc.map((e) => `<tr data-ex="${esc(e.id)}"${e.id === cur ? ' class="on"' : ''}>
          <td><b>${e.school_year} ${esc(e.exam_type)}</b><small>${esc(e.grade)}</small></td>
          ${subs.map((n) => { const x = e.scores.find((q) => subName(q) === n); return `<td>${x ? esc(scoreText(x, e.exam_type)) : '<span class="sub">-</span>'}</td>`; }).join('')}
        </tr>`).join('')}</tbody></table></div></section>`;
  };

  function draw() {
    const e = list.find((x) => x.id === cur);
    if (!e) { bodyEl.innerHTML = '<div class="ex-none">입력된 성적이 없습니다.</div>'; return; }
    const prev = prevOf(exams, e);
    const rows = e.scores.map((s) => {
      const c = subjectChange(s, e.exam_type, prev);
      const icon = c ? { up: UP, down: DOWN, same: SAME }[c.k] : '';
      return `<li class="xd-row">
        <div class="xd-line">
          <b class="xd-sub"><i style="background:${SUB_COLOR[s.subject] || SUB_COLOR.기타}"></i>${esc(subName(s))}</b>
          <span class="xd-score">${s.raw_score != null ? `<strong>${s.raw_score}</strong>점` : ''}${valLabel(s, e.exam_type) ? `<em>${esc(valLabel(s, e.exam_type))}</em>` : ''}</span>
          <span class="xd-chg ${c ? c.k : ''}">${c ? `${esc(c.from)} → ${esc(c.to)}<i>${icon}</i>` : ''}</span>
        </div>
        ${s.note ? `<p class="xd-note">${esc(s.note)}</p>` : ''}
      </li>`;
    }).join('');
    bodyEl.innerHTML = `
      <div class="xd-chips" role="tablist">${list.map((x) => `<button type="button" role="tab" class="chip-t${x.id === cur ? ' on' : ''}" data-ex="${esc(x.id)}" aria-selected="${x.id === cur}">${x.school_year !== list[0].school_year || x.school_year !== schoolYear() ? `${String(x.school_year).slice(2)}년 ` : ''}${esc(x.exam_type)}</button>`).join('')}</div>
      <section class="xd-exam">
        <div class="xd-exam-h"><div><h4>${esc(examName(e))}</h4><span>${esc(e.grade)}${prev ? ` · ${esc(examName(prev))} 대비` : ''}</span></div>
          <button type="button" class="btn btn-sm btn-gray" id="xd-fix">${PEN}수정</button></div>
        ${e.scores.length ? `<ul class="xd-list">${rows}</ul>` : '<p class="ex-none">과목 성적이 없습니다.</p>'}
        <div class="xd-fb"><h5>시험 총평</h5>${e.feedback ? `<p>${esc(e.feedback)}</p>` : '<p class="sub">작성된 총평이 없습니다.</p>'}</div>
      </section>
      ${hist('내신', list.filter((x) => !isMock(x.exam_type)))}
      ${hist('모의고사', list.filter((x) => isMock(x.exam_type)))}`;
    $('#xd-fix', bodyEl).addEventListener('click', () => {
      m.close();
      openEditor({ ...stu, grade: e.grade }, e.school_year, e.exam_type, e, onChanged);
    });
  }
  draw();
  bodyEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ex]'); if (!b || b.dataset.ex === cur) return;
    cur = b.dataset.ex; const top = bodyEl.scrollTop; draw();
    if (b.tagName === 'TR') bodyEl.scrollTo({ top: 0, behavior: 'smooth' }); else bodyEl.scrollTop = top;
    $('.xd-exam', bodyEl)?.classList.add('fx-in');
    $('.xd-chips .on', bodyEl)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  $('#xd-edit', m).addEventListener('click', () => { m.close(); openPicker(stu, exams, allMap, onChanged); });
}

/* ---------- 성적 입력 · 수정 (연필): 시험 고르기 (기본 4개 + 추가한 시험) → 입력 창 ---------- */
function openPicker(stu, exams, allMap, onChanged) {
  const sy = schoolYear();
  let year = sy, adding = false, kind = '내신';
  const m = sheet(`
    <div class="modal modal-xp" role="dialog" aria-label="성적 입력">
      <div class="drawer-head"><h3>성적 입력 <span class="h-sub">${esc(stu.name)} · ${esc(stu.grade)}</span></h3>
        <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body" id="xp-body"></div>
    </div>`, 'center');
  const bodyEl = $('#xp-body', m);
  const names = () => {
    const l = examNames(allMap, year);
    exams.filter((e) => e.school_year === year && !l.includes(e.exam_type)).forEach((e) => l.push(e.exam_type));
    return l;
  };
  function draw() {
    const now = recentExam();
    bodyEl.innerHTML = `
      <div class="seg xp-year">${[sy, sy - 1].map((y) => `<button type="button" data-y="${y}" class="${y === year ? 'on' : ''}">${y}학년도</button>`).join('')}</div>
      <ul class="xp-list">${names().map((t) => {
        const e = exams.find((x) => x.school_year === year && x.exam_type === t);
        const n = e?.scores.length || 0;
        const tags = `${year === sy && t === now ? '<em class="xp-now">이번 시험</em>' : ''}${BASIC.includes(t) ? '' : `<em class="xp-tag">${isMock(t) ? '모의형' : '추가'}</em>`}`;
        return `<li><button type="button" data-t="${esc(t)}" class="${e ? 'done' : ''}">
          <span class="xp-name">${esc(t)}${tags}</span>
          <span class="xp-st">${e ? `입력됨 · ${n}과목` : '미입력'}</span>
          <span class="xp-go">${e ? '수정' : '입력'}</span>
        </button></li>`;
      }).join('')}</ul>
      ${adding ? `<div class="xp-add">
          <div class="field"><label for="xp-name">시험 이름</label>
            <div class="input"><input id="xp-name" maxlength="20" placeholder="예: 3월 모의, 단원평가, 수행평가" autocomplete="off"></div></div>
          <div class="xp-add-row">
            <div class="field"><label>입력 방식</label>
              <div class="seg" id="xp-kind"><button type="button" data-k="내신" class="${kind === '내신' ? 'on' : ''}">등급 · 성취도</button><button type="button" data-k="모의" class="${kind === '모의' ? 'on' : ''}">백분위 (모의)</button></div></div>
            <div class="field"><label for="xp-date">시험일 <small>(순서 정렬용 · 선택)</small></label>
              <div class="input"><input id="xp-date" type="date"></div></div>
          </div>
          <p class="err" id="xp-err" role="alert"></p>
          <div class="xp-add-acts"><button type="button" class="btn btn-gray btn-sm" id="xp-cancel">취소</button><button type="button" class="btn btn-primary btn-sm" id="xp-go">다음 · 성적 입력</button></div>
        </div>`
      : '<button type="button" class="xp-more" id="xp-open"><span>+</span>시험 추가</button>'}`;
    if (adding) $('#xp-name', bodyEl).focus({ preventScroll: true });
  }
  draw();
  const go = () => {
    const err = $('#xp-err', bodyEl);
    let name = $('#xp-name', bodyEl).value.trim().replace(/\s+/g, ' ');
    if (!name) return (err.textContent = '시험 이름을 입력하세요.');
    if (kind === '모의' && !/모의/.test(name)) name = `${name} 모의`;
    if (kind === '내신' && /모의/.test(name)) return (err.textContent = "'모의'가 들어간 이름은 백분위(모의)로 골라 주세요.");
    const e = exams.find((x) => x.school_year === year && x.exam_type === name);
    m.close();
    openEditor(e ? { ...stu, grade: e.grade } : stu, year, name, e, onChanged, { takenOn: e ? undefined : ($('#xp-date', bodyEl).value || null) });
  };
  bodyEl.addEventListener('click', (ev) => {
    const y = ev.target.closest('[data-y]'); if (y) { year = Number(y.dataset.y); return draw(); }
    if (ev.target.closest('#xp-open')) { adding = true; draw(); popIn($('.xp-add', bodyEl)); return; }
    if (ev.target.closest('#xp-cancel')) { adding = false; return draw(); }
    const k = ev.target.closest('[data-k]');
    if (k) { kind = k.dataset.k; $$('#xp-kind button', bodyEl).forEach((x) => x.classList.toggle('on', x === k)); return; }
    if (ev.target.closest('#xp-go')) return go();
    const b = ev.target.closest('[data-t]'); if (!b) return;
    const e = exams.find((x) => x.school_year === year && x.exam_type === b.dataset.t);
    m.close();
    openEditor(e ? { ...stu, grade: e.grade } : stu, year, b.dataset.t, e, onChanged);
  });
  bodyEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'xp-name') { ev.preventDefault(); go(); } });
}

/* ---------- 입력 (가운데 모달) ---------- */
async function openEditor(stu, year, type, exam, onSaved, { takenOn } = {}) {
  const scale = scaleOf(stu.grade, year, type);
  const rows = (exam?.scores || []).map((s) => ({ ...s }));
  let subs = [];
  try { subs = await loadStudentSubjects(stu.id); } catch { subs = []; }
  if (!exam && !rows.length) subs.forEach((s) => rows.push({ subject: s.subject, subject_detail: s.subject_detail }));
  let feedback = exam?.feedback || '';

  const panel = sheet(`
    <div class="modal modal-ex" role="dialog" aria-label="성적 입력">
      <div class="drawer-head"><h3>${esc(stu.name)} <span class="h-sub">${esc(stu.grade)} · ${year} ${esc(type)}</span></h3>
        <button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body" id="ee-body"></div>
      <div class="drawer-foot">
        ${exam ? '<button type="button" class="btn btn-sm btn-danger-text" id="ee-del">삭제</button>' : ''}
        <p class="err" id="ee-err" role="alert"></p>
        <div class="spacer"></div>
        <button type="button" class="btn btn-gray btn-sm" data-close>취소</button>
        <button type="button" class="btn btn-primary btn-sm" id="ee-save">저장</button>
      </div>
    </div>`, 'center');
  const bodyEl = $('#ee-body', panel);

  const valCell = (r, k) => {
    if (scale.kind === 'pct') return `<div class="input sm ex-v"><input data-f="percentile" data-k="${k}" inputmode="decimal" maxlength="5" value="${r.percentile ?? ''}" placeholder="-"><em>%</em></div>`;
    if (scale.kind === 'ach') return `<div class="input sm ex-v"><select data-f="achievement" data-k="${k}"><option value="">-</option>${ACH.map((a) => `<option${r.achievement === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>`;
    return `<div class="input sm ex-v"><select data-f="grade_level" data-k="${k}"><option value="">-</option>${Array.from({ length: scale.max }, (_, i) => i + 1).map((g) => `<option value="${g}"${Number(r.grade_level) === g ? ' selected' : ''}>${g}등급</option>`).join('')}</select></div>`;
  };

  function draw() {
    const have = new Set(rows.map((r) => subName(r)));
    const quick = subs.filter((s) => !have.has(subName(s)));
    bodyEl.innerHTML = `
      <div class="ex-rows-h"><span>과목</span><span>세부 과목</span><span>원점수</span><span>${scale.label}${scale.kind === 'grade' ? ` (${scale.max}등급제)` : ''}</span><span></span></div>
      <div class="ex-rows">${rows.map((r, k) => `
        <div class="ex-row" data-k="${k}">
          <div class="ex-line">
            <div class="input sm ex-sub"><select data-f="subject" data-k="${k}">${SUBJECTS.map((s) => `<option${s === r.subject ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="input sm ex-det"><input data-f="subject_detail" data-k="${k}" value="${esc(r.subject_detail || '')}" placeholder="예: 미적분"></div>
            <div class="input sm ex-raw"><input data-f="raw_score" data-k="${k}" inputmode="decimal" maxlength="5" value="${r.raw_score ?? ''}" placeholder="-"><em>점</em></div>
            ${valCell(r, k)}
            <div class="ex-acts">
              <button type="button" class="icon-btn sm" data-del="${k}" aria-label="삭제">${X}</button>
            </div>
          </div>
          <div class="input sm ex-memo"><input data-f="note" data-k="${k}" value="${esc(r.note || '')}" placeholder="${esc(subName(r) || '과목')} 피드백 (선택)" aria-label="과목 피드백"></div>
        </div>`).join('') || '<div class="ex-none">과목을 추가하세요.</div>'}</div>
      <div class="ex-quick">${quick.map((s, i) => `<button type="button" class="chip-t" data-q="${i}">+ ${esc(subName(s))}</button>`).join('')}
        <button type="button" class="chip-t" data-q="-1">+ 과목</button></div>
      <div class="field ex-fbf"><label for="ee-fb">시험 총평</label>
        <textarea id="ee-fb" class="textarea" rows="4" placeholder="시험 결과 분석, 다음 시험 준비 방향">${esc(feedback)}</textarea></div>`;
    $$('[data-q]', bodyEl).forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.q);
      rows.push(i >= 0 ? { subject: quick[i].subject, subject_detail: quick[i].subject_detail } : { subject: '국어', subject_detail: '' });
      draw();
      const nr = $$('.ex-row', bodyEl).pop(); popIn(nr);
      nr?.querySelector('[data-f=raw_score]')?.focus({ preventScroll: true });
    }));
  }
  draw();

  bodyEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'ee-fb') { feedback = t.value; return; }
    if (t.dataset.k == null) return;
    rows[Number(t.dataset.k)][t.dataset.f] = t.value;
  });
  bodyEl.addEventListener('change', (e) => {
    const t = e.target; if (t.tagName !== 'SELECT' || t.dataset.k == null) return;
    rows[Number(t.dataset.k)][t.dataset.f] = t.value;
  });
  bodyEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.del != null) { const k = Number(b.dataset.del); fadeOut(b.closest('.ex-row')).then(() => { rows.splice(k, 1); draw(); }); }
  });

  const num = (v) => (v === '' || v == null ? null : Number(v));
  $('#ee-save', panel).addEventListener('click', async (e) => {
    const err = $('#ee-err', panel); err.textContent = '';
    const scores = rows.map((r) => ({
      subject: r.subject, subject_detail: (r.subject_detail || '').trim(),
      raw_score: num(r.raw_score), grade_level: num(r.grade_level), achievement: r.achievement || null,
      percentile: num(r.percentile), note: (r.note || '').trim(),
    })).filter((r) => r.raw_score != null || r.grade_level != null || r.achievement || r.percentile != null || r.note);
    const bad = scores.find((r) => (r.raw_score != null && (isNaN(r.raw_score) || r.raw_score < 0 || r.raw_score > 100))
      || (r.percentile != null && (isNaN(r.percentile) || r.percentile < 0 || r.percentile > 100)));
    if (bad) return (err.textContent = `${subName(bad)}: 0~100 사이로 입력하세요.`);
    const keys = scores.map(subName);
    if (new Set(keys).size !== keys.length) return (err.textContent = '같은 과목이 두 번 있습니다. 세부 과목으로 구분하세요.');
    if (!scores.length && !feedback.trim()) return (err.textContent = '입력된 성적이 없습니다.');
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = '저장 중';
    try {
      await saveExam({ id: exam?.id, student_id: stu.id, school_year: year, grade: stu.grade, exam_type: type, feedback: feedback.trim(), scores, ...(takenOn !== undefined && !exam ? { taken_on: takenOn } : {}) });
      toast('성적이 저장되었습니다'); panel.close(); onSaved?.();
    } catch (x) { err.textContent = '저장 실패: ' + x.message; btn.disabled = false; btn.textContent = '저장'; }
  });

  $('#ee-del', panel)?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = '한 번 더 누르면 삭제'; setTimeout(() => { b.classList.remove('armed'); b.textContent = '삭제'; }, 3000); return; }
    try { await deleteExam(exam.id); toast('삭제되었습니다'); panel.close(); onSaved?.(); }
    catch (x) { $('#ee-err', panel).textContent = '삭제 실패: ' + x.message; }
  });
}
