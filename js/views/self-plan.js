// 학생 자율 계획: 상담을 못 한 주(보강 대상) · 계획이 없을 때 학생이 다음 상담일까지 직접 작성
//  다니는 학원 과목은 학원 숙제 칸 자동 · 지난 계획 항목 가져오기 · 저장하면 지난 계획은 마감
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { short } from '../date.js';
import { SUBJECTS } from '../data/students.js';
import { hasAcademy, matches } from '../data/academy.js';
import { loadMySubjects, saveSelfPlan } from '../data/student.js';

const md = (d) => short(d);

export async function openSelfPlan(student, { plan, items = [], sched = [], need, onSaved }) {
  const acHas = (i) => hasAcademy(i, sched);
  let mine = [];
  try { mine = await loadMySubjects(student.id); } catch { /* 과목 목록 없이 */ }
  // 기본: 다니는 학원 과목마다 학원 숙제 칸
  const rows = [];
  const seen = new Set();
  for (const r of sched.filter((x) => x.category === '학원' && x.subject)) {
    const k = `${r.subject}|${r.subject_detail || ''}`; if (seen.has(k)) continue; seen.add(k);
    rows.push({ subject: r.subject, subject_detail: r.subject_detail || '', title: '', detail: '', academy: true });
  }
  const carry = items.filter((i) => i.title);

  const m = sheet(`<div class="modal modal-m sp" role="dialog" aria-label="계획 세우기">
    <div class="drawer-head"><h3>계획 세우기 <span class="h-sub">오늘 ~ ${md(need.due)} 상담 전까지</span></h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
    <div class="drawer-body">
      ${carry.length ? `<div class="field"><span class="lbl">지난 계획에서 가져오기</span>
        <div class="chips" id="sp-carry">${carry.map((i, k) => `<button type="button" class="chip-t" data-c="${k}">${esc(i.subject)} · ${esc(i.title)}</button>`).join('')}</div></div>` : ''}
      <div class="field"><span class="lbl">과목 추가</span>
        <div class="chips" id="sp-add">${[...mine.map((s) => ({ subject: s.subject, subject_detail: s.subject_detail || '' })), ...SUBJECTS.filter((x) => !mine.some((s) => s.subject === x && !s.subject_detail)).map((x) => ({ subject: x, subject_detail: '' }))]
          .map((s, k) => `<button type="button" class="chip-t" data-a="${k}" data-s="${esc(s.subject)}" data-d="${esc(s.subject_detail)}">+ ${esc(s.subject)}${s.subject_detail ? ' ' + esc(s.subject_detail) : ''}</button>`).join('')}</div></div>
      <div class="sp-list" id="sp-list"></div>
      <p class="err" id="sp-err" role="alert"></p>
      <button type="button" class="btn btn-primary btn-block" id="sp-go">계획 저장</button>
    </div></div>`, 'center');

  const draw = () => {
    $('#sp-list', m).innerHTML = rows.length ? rows.map((r, k) => `<div class="sp-row" data-k="${k}">
        <div class="sp-top"><span class="sp-sub">${esc(r.subject)}</span>
          <div class="input sm sp-det"><input data-f="subject_detail" value="${esc(r.subject_detail)}" placeholder="세부 과목"></div>
          <button type="button" class="chip-t ac-chip${r.academy ? ' on' : ''}" data-ac="${k}"${acHas(r) ? '' : ' hidden'}>학원 숙제</button>
          <button type="button" class="icon-btn sm" data-del="${k}" aria-label="삭제">${X}</button></div>
        <div class="input sm"><input data-f="title" value="${esc(r.title)}" placeholder="${r.academy ? '숙제 범위 (선택)' : '분량 (예: 쎈 B단계 p.40–72)'}"></div>
      </div>`).join('') : '<p class="sp-empty">과목을 추가하세요.</p>';
    $$('#sp-carry [data-c]', m).forEach((b) => b.classList.toggle('on', rows.some((r) => r.carried_from === carry[Number(b.dataset.c)].id)));
  };
  draw();

  $('#sp-list', m).addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (!f) return;
    const row = e.target.closest('[data-k]'), r = rows[Number(row.dataset.k)];
    r[f] = e.target.value;
    if (f === 'subject_detail') {   // 세부 과목에 따라 학원 숙제 다시 판정
      const has = acHas(r), chip = row.querySelector('[data-ac]');
      if (!has) r.academy = false; else if (!r.acManual) r.academy = true;
      chip.hidden = !has; chip.classList.toggle('on', r.academy);
    }
  });
  $('#sp-list', m).addEventListener('click', (e) => {
    const ac = e.target.closest('[data-ac]'), del = e.target.closest('[data-del]');
    if (ac) { const r = rows[Number(ac.dataset.ac)]; r.academy = !r.academy; r.acManual = true; draw(); }
    if (del) { rows.splice(Number(del.dataset.del), 1); draw(); }
  });
  $('#sp-add', m).addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = { subject: b.dataset.s, subject_detail: b.dataset.d, title: '', detail: '' };
    r.academy = acHas(r); rows.push(r); draw();
    $$('#sp-list [data-f=title]', m).pop()?.focus();
  });
  $('#sp-carry', m)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const i = carry[Number(b.dataset.c)];
    const at = rows.findIndex((r) => r.carried_from === i.id);
    if (at >= 0) { rows.splice(at, 1); draw(); return; }
    const r = { subject: i.subject, subject_detail: i.subject_detail || '', title: i.title, detail: i.detail || '', carried_from: i.id };
    r.academy = acHas(r) && (i.academy ?? true);
    // 같은 과목의 빈 학원 숙제 칸이 있으면 그 자리에
    const k = rows.findIndex((x) => !x.carried_from && !x.title.trim() && x.subject === r.subject && (x.subject_detail || '') === (r.subject_detail || ''));
    if (k >= 0) rows[k] = r; else rows.push(r);
    draw();
  });

  $('#sp-go', m).addEventListener('click', async () => {
    const err = $('#sp-err', m); err.textContent = '';
    const list = rows.map((r) => (r.academy && !r.title.trim() ? { ...r, title: '학원 숙제' } : r)).filter((r) => r.title.trim())
      .map((r) => ({ ...r, academy: !!r.academy && acHas(r) }));
    if (!list.length) { err.textContent = '계획을 1개 이상 입력하세요.'; return; }
    const btn = $('#sp-go', m); btn.disabled = true;
    try {
      await saveSelfPlan(student, plan, list, need.due);
      m.close(); toast('계획이 저장되었습니다'); onSaved?.();
    } catch (ex) { err.textContent = '저장 실패: ' + ex.message; btn.disabled = false; }
  });
}
