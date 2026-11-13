// 선생님 · 성적: [시험별] 한 시험의 전체 학생 입력 현황 / [학생별] 한 학생의 시험 추이
//  입력은 선생님만. 시험 총평(exams.feedback) + 과목 메모(exam_scores.note, 선택) → 상담 참고사항에 표시
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { SUBJECTS, loadStudents } from '../data/students.js';
import {
  EXAM_TYPES, NAESIN, MOCK, isMock, examOrder, schoolYear, recentExam, scaleOf,
  loadExamRound, loadStudentExams, loadStudentSubjects, saveExam, deleteExam,
} from '../data/exams.js';

const SUB_COLOR = { 국어: '#3182F6', 수학: '#F59E0B', 영어: '#10B981', 사회: '#8B5CF6', 과학: '#06B6D4', 한국사: '#EC4899', 기타: '#8B95A1' };
const ACH = ['A', 'B', 'C', 'D', 'E'];
const MEMO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
const bySeat = (a, b) => {
  if (!a.seat_no !== !b.seat_no) return a.seat_no ? -1 : 1;
  return String(a.seat_no || '').localeCompare(String(b.seat_no || ''), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
};
// 그래프 가로축: "1학기 중간" → "1-중간", "3월 모의" → "3월" (여러 학년도면 앞에 '26)
const axisLabel = (e, list) => {
  const t = e.exam_type.replace('학기 ', '-').replace(' 모의', '');
  return new Set(list.map((x) => x.school_year)).size > 1 ? `'${String(e.school_year).slice(2)} ${t}` : t;
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
    view: 'round', students: [], year: sy, type: recentExam(), level: '전체', q: '',
    sid: null, round: [],
  };
  st.cat = isMock(st.type) ? '모의' : '내신';

  body.innerHTML = `
    <div class="t-head"><h2>성적 <span class="count" id="cnt"></span></h2><div class="spacer"></div>
      <div class="seg" id="ex-view"><button type="button" data-v="round">시험별</button><button type="button" data-v="student">학생별</button></div></div>
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
  st.sid = st.students[0]?.id || null;
  draw();

  function draw() { return st.view === 'round' ? drawRound() : drawStudent(); }

  /* ---------- 시험별 ---------- */
  async function drawRound() {
    const years = [sy, sy - 1, sy - 2];
    const types = st.cat === '모의' ? MOCK : NAESIN;
    $('#ex-body').innerHTML = `
      <div class="t-tools">
        <div class="input sm ex-year"><select id="ex-year">${years.map((y) => `<option value="${y}"${y === st.year ? ' selected' : ''}>${y}학년도</option>`).join('')}</select></div>
        <div class="seg" id="ex-cat">${['내신', '모의'].map((c) => `<button type="button" data-v="${c}">${c}</button>`).join('')}</div>
        <div class="seg" id="ex-type">${types.map((t) => `<button type="button" data-v="${t}">${t.replace(' 모의', '')}</button>`).join('')}</div>
        ${st.cat === '내신' ? `<div class="seg" id="ex-level">${['전체', '중등', '고등'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>` : ''}
        <div class="search"><input id="ex-q" type="search" placeholder="이름 · 자리 검색" aria-label="검색" value="${esc(st.q)}"></div>
      </div>
      <div class="card table-card"><div class="table-wrap" id="ex-tbl"><div class="empty">불러오는 중</div></div></div>`;
    const seg = (id, key, after) => {
      const el = $(id); if (!el) return;
      $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === st[key]));
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st[key] = b.dataset.v; after(); });
    };
    seg('#ex-cat', 'cat', () => { st.type = (st.cat === '모의' ? MOCK : NAESIN).includes(recentExam()) ? recentExam() : (st.cat === '모의' ? MOCK : NAESIN)[0]; drawRound(); });
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
    const mock = isMock(st.type);
    const list = st.students.filter((s) =>
      (mock ? s.grade.startsWith('고') : st.level === '전체' || s.grade.startsWith(st.level === '중등' ? '중' : '고')) &&
      (!st.q || s.name.includes(st.q) || (s.seat_no || '') === st.q));
    const byStu = new Map(st.round.map((e) => [e.student_id, e]));
    const done = list.filter((s) => byStu.get(s.id)?.scores.length).length;
    $('#cnt').textContent = `${st.year} ${st.type} · 입력 ${done} / ${list.length}`;
    if (!list.length) { el.innerHTML = `<div class="empty">${mock ? '고등학생이 없습니다.' : '조건에 맞는 학생이 없습니다.'}</div>`; return; }
    el.innerHTML = `<table class="tbl ex-tbl">
      <thead><tr><th>자리</th><th>이름</th><th>학년</th><th>과목별 성적</th><th>총평</th></tr></thead>
      <tbody>${list.map((s) => {
        const ex = byStu.get(s.id);
        const sc = ex?.scores || [];
        return `<tr data-id="${esc(s.id)}" tabindex="0"${sc.length ? '' : ' class="dim"'}>
          <td><span class="seat${s.seat_no ? '' : ' none'}">${esc(s.seat_no || '-')}</span></td>
          <td><b>${esc(s.name)}</b></td><td>${esc(s.grade)}</td>
          <td class="ex-cells-td"><div class="ex-cells">${sc.length ? sc.map((x) => `<span class="ex-cell"><i style="background:${SUB_COLOR[x.subject]}"></i>${esc(subName(x))}<b>${esc(scoreText(x, st.type))}</b>${x.note ? '<em title="과목 메모">메모</em>' : ''}</span>`).join('') : '<span class="sub">미입력</span>'}</div></td>
          <td>${ex?.feedback ? '<span class="pill pill-green">작성</span>' : '<span class="sub">-</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    $$('tbody tr', el).forEach((tr) => {
      const open = () => openEditor(st.students.find((s) => s.id === tr.dataset.id), st.year, st.type, byStu.get(tr.dataset.id), drawRound);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  /* ---------- 학생별 ---------- */
  async function drawStudent() {
    const stu = st.students.find((s) => s.id === st.sid);
    $('#cnt').textContent = '';
    $('#ex-body').innerHTML = `
      <div class="t-tools">
        <div class="input sm ex-stu"><select id="ex-stu">${st.students.map((s) => `<option value="${esc(s.id)}"${s.id === st.sid ? ' selected' : ''}>${esc(s.seat_no ? s.seat_no + ' · ' : '')}${esc(s.name)} (${esc(s.grade)})</option>`).join('')}</select></div>
        <div class="spacer"></div>
        ${stu ? `<div class="input sm ex-add"><select id="ex-add"><option value="">성적 입력</option>
          ${(stu.grade.startsWith('고') ? EXAM_TYPES : NAESIN)
            .map((t) => `<option value="${t}">${sy} ${t}</option>`).join('')}</select></div>` : ''}
      </div>
      <div id="ex-stu-body">${stu ? '<div class="card empty">불러오는 중</div>' : '<div class="card empty">재원 학생이 없습니다.</div>'}</div>`;
    if (!stu) return;
    $('#ex-stu').addEventListener('change', (e) => { st.sid = e.target.value; drawStudent(); });
    let exams = [];
    try { exams = await loadStudentExams(stu.id); }
    catch (e) { $('#ex-stu-body').innerHTML = `<div class="card empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    $('#ex-add').addEventListener('change', (e) => {
      const t = e.target.value; e.target.value = ''; if (!t) return;
      openEditor(stu, sy, t, exams.find((x) => x.school_year === sy && x.exam_type === t), drawStudent);
    });
    const sec = (title, list) => {
      const mock = title === '모의고사';
      if (!list.length) return `<section class="card ex-sec"><div class="ex-sec-h"><h3>${title}</h3></div><div class="ex-none">입력된 성적이 없습니다.</div></section>`;
      const subs = [...new Set(list.flatMap((e) => e.scores.map(subName)))];
      return `<section class="card ex-sec">
        <div class="ex-sec-h"><h3>${title}</h3><span>${mock ? '원점수 · 백분위' : '원점수 · 등급(성취도)'}</span></div>
        ${list.length >= 2 ? `<div class="ex-trend" data-tr="${mock ? 'm' : 'n'}"></div>` : ''}
        <div class="table-wrap"><table class="tbl tbl-s ex-hist">
          <thead><tr><th>시험</th>${subs.map((s) => `<th>${esc(s)}</th>`).join('')}<th>총평</th></tr></thead>
          <tbody>${list.map((e) => `<tr data-ex="${esc(e.id)}">
            <td><b>${e.school_year} ${esc(e.exam_type)}</b><small>${esc(e.grade)}</small></td>
            ${subs.map((n) => { const x = e.scores.find((s) => subName(s) === n); return `<td>${x ? esc(scoreText(x, e.exam_type)) : '<span class="sub">-</span>'}</td>`; }).join('')}
            <td class="ex-fb-td"><div class="ex-fb">${e.feedback ? esc(e.feedback) : '<span class="sub">-</span>'}</div></td></tr>`).join('')}</tbody>
        </table></div></section>`;
    };
    const nae = exams.filter((e) => !isMock(e.exam_type)), mk = exams.filter((e) => isMock(e.exam_type));
    $('#ex-stu-body').innerHTML = sec('내신', nae) + (stu.grade.startsWith('고') || mk.length ? sec('모의고사', mk) : '');
    const paintTrends = () => $$('[data-tr]').forEach((el) => {
      const mock = el.dataset.tr === 'm', list = mock ? mk : nae;
      el.innerHTML = trend(list, [...new Set(list.flatMap((e) => e.scores.map(subName)))], mock, el.clientWidth);
    });
    st.paintTrends = paintTrends; paintTrends();
    if (!st.ro) { st.ro = new ResizeObserver(() => st.paintTrends?.()); }
    st.ro.disconnect(); $$('[data-tr]').forEach((el) => st.ro.observe(el));
    $$('#ex-stu-body tr[data-ex]').forEach((tr) => tr.addEventListener('click', () => {
      const e = exams.find((x) => x.id === tr.dataset.ex);
      openEditor({ ...stu, grade: e.grade }, e.school_year, e.exam_type, e, drawStudent);
    }));
  }

  // 추이 그래프: 내신 = 등급(위가 1등급) / 모의 = 백분위
  function trend(list, subs, mock, W = 640) {
    const H = 168, L = 34, R = 14, T = 14, B = 26;
    const val = (s, e) => {
      if (mock) return s.percentile;
      if (s.grade_level != null) return s.grade_level;
      return s.achievement ? ACH.indexOf(s.achievement) + 1 : null;
    };
    const max = mock ? 100 : Math.max(5, ...list.flatMap((e) => e.scores.map((s) => (s.grade_level ?? 0))));
    const x = (i) => L + (list.length === 1 ? 0 : (i * (W - L - R)) / (list.length - 1));
    const y = (v) => mock ? T + ((100 - v) / 100) * (H - T - B) : T + ((v - 1) / (max - 1)) * (H - T - B);
    const ticks = mock ? [0, 50, 100] : [1, Math.ceil(max / 2), max];
    const lines = subs.map((n) => {
      const pts = list.map((e, i) => { const s = e.scores.find((q) => subName(q) === n); const v = s && val(s, e); return v != null ? [x(i), y(v)] : null; });
      const c = SUB_COLOR[n.split(' ')[0]] || '#8B95A1';
      const segs = pts.filter(Boolean);
      return `<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="${segs.map((p) => p.join(',')).join(' ')}"/>
        ${segs.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="#fff" stroke="${c}" stroke-width="2"/>`).join('')}`;
    }).join('');
    const n = list.length;
    return `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
        ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#EEF0F3"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${mock ? t : t + '등급'}</text>`).join('')}
        ${list.map((e, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${esc(axisLabel(e, list))}</text>`).join('')}
        ${lines}
      </svg>
      <div class="ex-legend">${subs.map((n) => `<span><i style="background:${SUB_COLOR[n.split(' ')[0]] || '#8B95A1'}"></i>${esc(n)}</span>`).join('')}</div>`;
  }
}

/* ---------- 입력 (가운데 모달) ---------- */
async function openEditor(stu, year, type, exam, onSaved) {
  const scale = scaleOf(stu.grade, year, type);
  const rows = (exam?.scores || []).map((s) => ({ ...s, memoOpen: !!s.note }));
  let subs = [];
  try { subs = await loadStudentSubjects(stu.id); } catch { subs = []; }
  if (!exam && !rows.length) subs.forEach((s) => rows.push({ subject: s.subject, subject_detail: s.subject_detail, memoOpen: false }));
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
              <button type="button" class="icon-btn sm${r.memoOpen ? ' on' : ''}" data-memo="${k}" aria-label="과목 메모" title="과목 메모">${MEMO}</button>
              <button type="button" class="icon-btn sm" data-del="${k}" aria-label="삭제">${X}</button>
            </div>
          </div>
          ${r.memoOpen ? `<div class="input sm ex-memo"><input data-f="note" data-k="${k}" value="${esc(r.note || '')}" placeholder="과목 메모 (선택)"></div>` : ''}
        </div>`).join('') || '<div class="ex-none">과목을 추가하세요.</div>'}</div>
      <div class="ex-quick">${quick.map((s, i) => `<button type="button" class="chip-t" data-q="${i}">+ ${esc(subName(s))}</button>`).join('')}
        <button type="button" class="chip-t" data-q="-1">+ 과목</button></div>
      <div class="field ex-fbf"><label for="ee-fb">시험 총평</label>
        <textarea id="ee-fb" class="textarea" rows="4" placeholder="시험 결과 분석, 다음 시험 준비 방향">${esc(feedback)}</textarea></div>`;
    $$('[data-q]', bodyEl).forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.q);
      rows.push(i >= 0 ? { subject: quick[i].subject, subject_detail: quick[i].subject_detail, memoOpen: false } : { subject: '국어', subject_detail: '', memoOpen: false });
      draw();
      $$('.ex-row', bodyEl).pop()?.querySelector('[data-f=raw_score]')?.focus();
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
    if (b.dataset.del != null) { rows.splice(Number(b.dataset.del), 1); draw(); }
    if (b.dataset.memo != null) {
      const r = rows[Number(b.dataset.memo)]; r.memoOpen = !r.memoOpen; draw();
      if (r.memoOpen) $(`[data-f=note][data-k="${b.dataset.memo}"]`, bodyEl)?.focus();
    }
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
      await saveExam({ id: exam?.id, student_id: stu.id, school_year: year, grade: stu.grade, exam_type: type, feedback: feedback.trim(), scores });
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
