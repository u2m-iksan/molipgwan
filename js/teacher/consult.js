// 상담 화면 (전체 페이지 #/consult?sid=…&on=…): ① 상담 (지난 계획 이행도 → 다음 계획 → 총평) ② 보고 (GPT 정돈 → 학부모 카드 공개)
import { $, $$, esc, toast, sheet, X, flashDone, saveState, fadeOut, popIn } from '../ui.js';
import { today, short, addDays } from '../date.js';
import { refPanel } from './ref-panel.js';
import { segBar } from '../views/progress-bar.js';
import { SUBJECTS } from '../data/students.js';
import { sb } from '../sb.js';
import { loadStudentSchedules, loadVacations, withTerm } from '../data/schedules.js';
import { hasAcademy, matches, academyStat, dayLabel } from '../data/academy.js';
import {
  loadConsult, loadCarryCandidates, saveConsult, saveReport, computeReportStats,
  buildPrompt, parseGpt, reportSubjects, noticeText,
} from '../data/coaching.js';
import { mountReport, autoBadges, badgesOf, BADGE_ORDER } from '../views/report-card.js';
import { openReportViewer } from '../views/report-viewer.js';
import { mountSend } from './send-report.js';


async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}

const SIDE_KEY = 'molip-ref-side';
const PEN_S = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
const PANEL_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></svg>';

export function renderConsult(root, stu, scheduled, { onSaved } = {}) {
  const panel = root;
  const wide = () => window.innerWidth > 720;
  const sideOpen = wide() && localStorage.getItem(SIDE_KEY) === '1';   // 폰에서는 항상 접힌 채로 시작
  root.innerHTML = `
    <div class="cp">
      <header class="cp-head">
        <a href="#/coaching" class="cp-back" aria-label="코칭으로"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>
        <div class="cp-title">
          <h2>${esc(stu.name)}</h2>
          <p>${stu.seat_no ? esc(stu.seat_no) + '번 · ' : ''}${esc(stu.grade)} · ${short(scheduled)} 상담</p>
        </div>
        <div class="cp-tools">
          <button type="button" class="btn btn-gray btn-sm cp-ref${sideOpen ? ' on' : ''}" id="cp-toggle" aria-pressed="${sideOpen}">${PANEL_IC}참고사항</button>
          <a class="btn btn-gray btn-sm" href="#/students?open=${esc(stu.id)}">일정</a>
        </div>
      </header>
      <div class="cp-wrap${sideOpen ? ' side-open' : ''}" id="cp-wrap">
        <aside class="cp-side" id="cp-side" aria-label="상담 참고사항"></aside>
        <div class="cp-main">
          <div class="pane" id="p-c"><div class="cp-body"><div class="empty">불러오는 중</div></div></div>
          <div class="pane" id="p-r" hidden></div>
          <div class="pane" id="p-s" hidden></div>
        </div>
      </div>
    </div>`;

  // 왼쪽 상담 참고사항 패널 (이행도 · 순공시간 · 성적)
  const wrap = $('#cp-wrap', root);
  refPanel($('#cp-side', root), stu, { onClose: () => setSide(false) });
  function setSide(on) {
    wrap.classList.toggle('side-open', on);
    const b = $('#cp-toggle', root); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    if (wide()) localStorage.setItem(SIDE_KEY, on ? '1' : '0');
  }
  $('#cp-toggle', root).addEventListener('click', () => {
    if (wide()) return setSide(!wrap.classList.contains('side-open'));
    // 폰: 왼쪽에서 밀려 나오는 패널
    const d = sheet('<aside class="drawer drawer-left cp-side-m" aria-label="상담 참고사항"></aside>', 'left');
    refPanel($('.cp-side-m', d), stu, { onClose: () => d.close() });
  });

  const st = {
    d: null, me: null,
    heldOn: today(), absent: false, isNew: false, isLeaving: false,
    prevItems: [], newItems: [], removedIds: [], removedPrevIds: [], summary: '', checkItems: [],
    carry: null, report: null, coachingId: null,
    profile: { goal: stu.goal || '', strong: [...(stu.strong_subjects || [])], weak: [...(stu.weak_subjects || [])], habits: stu.habits?.length ? [...stu.habits] : [''] },
  };

  /* ---------- 작성 중 내용 임시저장 (이 기기) — 다른 화면으로 가거나 창을 닫아도 유실 안 됨 ---------- */
  const DKEY = `molip-draft:${stu.id}:${scheduled}`;
  const DFIELDS = ['heldOn', 'absent', 'isNew', 'isLeaving', 'summary', 'checkItems', 'profile', 'prevItems', 'newItems', 'removedIds', 'removedPrevIds'];
  let dTimer = 0, dReady = false;
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch { return null; } };
  const clearDraft = () => { clearTimeout(dTimer); try { localStorage.removeItem(DKEY); } catch { /* 무시 */ } };
  const queueDraft = () => {
    if (!dReady) return;
    const ss = saveState($('#cs-draft', panel));
    ss.saving('임시저장 중');
    clearTimeout(dTimer);
    dTimer = setTimeout(() => {
      try {
        const snap = { ts: Date.now() }; DFIELDS.forEach((k) => { snap[k] = st[k]; });
        localStorage.setItem(DKEY, JSON.stringify(snap));
        ss.saved('임시저장됨');
      } catch { ss.failed('임시저장 실패'); }
    }, 600);
  };
  panel.addEventListener('input', (e) => { if (e.target.closest('#p-c')) queueDraft(); });
  panel.addEventListener('click', (e) => { if (e.target.closest('#p-c button:not(#cs-save):not([href])')) setTimeout(queueDraft, 0); });

  /* ---------- 단계: ① 상담 → ② 프롬프트 · 보고 저장 → ③ 전송(선택) ---------- */
  st.tab = 'c';
  const STEPS = [['c', '상담'], ['r', '프롬프트 · 저장'], ['s', '전송', '선택']];
  const stepDone = (k) => (k === 'c' ? !!st.coachingId
    : k === 'r' ? !!(st.report && (st.report.summary || (st.report.subject_feedback || []).length || st.report.published_at))
      : !!st.report?.sent_at);
  const stepsHtml = () => `<ol class="cs-steps" aria-label="상담 단계">${STEPS.map(([k, label, opt], i) => `
    <li class="${st.tab === k ? 'cur' : ''}${stepDone(k) ? ' done' : ''}"><button type="button" data-step="${k}"${st.tab === k ? ' aria-current="step"' : ''}>
      <i>${stepDone(k) && st.tab !== k ? '✓' : i + 1}</i><span>${label}${opt ? `<small>${opt}</small>` : ''}</span></button></li>`).join('<li class="sep" aria-hidden="true"></li>')}</ol>`;
  function paintSteps() { $$('.cs-steps-slot', panel).forEach((x) => { x.innerHTML = stepsHtml(); }); }
  async function showTab(v) {
    if (v === st.tab) return;
    if ((v === 'r' || v === 's') && !st.report) return toast('1단계 상담을 먼저 저장하세요');
    if (st.tab === 'r' && st.flushReport) await st.flushReport();
    st.tab = v;
    $('#p-c', panel).hidden = v !== 'c';
    $('#p-r', panel).hidden = v !== 'r';
    $('#p-s', panel).hidden = v !== 's';
    if (v === 'r' && !st.rDrawn) { drawReport(); st.rDrawn = true; }
    if (v === 's') drawSend();
    paintSteps();
    window.scrollTo(0, 0);
  }
  panel.addEventListener('click', (e) => { const b = e.target.closest('.cs-steps [data-step]'); if (b) showTab(b.dataset.step); });

  /* ---------- 불러오기 ---------- */
  (async () => {
    try {
      const [d, ses, sched0, vac] = await Promise.all([loadConsult(stu.id, scheduled), sb.auth.getSession(), loadStudentSchedules(stu.id).catch(() => []), loadVacations()]);
      st.d = d; st.me = ses?.data?.session?.user?.email || null;
      const sched = withTerm(sched0, stu.school, vac);
      st.sched = sched; st.acHas = (i) => hasAcademy(i, sched);
      const c = d.coaching;
      if (c) {
        Object.assign(st, {
          heldOn: c.held_on || today(), absent: c.kind === '결석', isNew: c.is_new, isLeaving: c.is_leaving,
          summary: c.summary_raw || '', coachingId: c.id,
        });
      }   // 신규생은 선생님이 직접 체크 (기존 재원생은 지난 계획을 직접 입력)
      st.report = d.report;
      const last = (id) => { const h = d.progress.get(id); return h?.length ? h[h.length - 1].pct : null; };
      const acRate = (i) => (i.academy && d.prevPlan ? academyStat(i, d.prevPlan, sched, d.progress.get(i.id), d.prevPlan.due_date ? d.prevPlan.due_date : today()).rate : null);
      st.prevItems = d.prevItems.map((i) => ({ ...i, final_rate: i.final_rate ?? (i.academy ? acRate(i) : last(i.id)) }));
      st.newItems = d.newItems.map((i) => ({ ...i }));
      if (!d.newPlan) seedAcademy();
      const dr = readDraft();
      if (dr && (!c || !c.created_at || dr.ts > Date.parse(c.created_at))) {
        DFIELDS.forEach((k) => { if (dr[k] !== undefined) st[k] = dr[k]; });
        toast('작성 중이던 내용을 이어서 불러왔습니다');
      } else if (dr) clearDraft();
      drawConsult();
      dReady = true;
      if (dr && readDraft()) saveState($('#cs-draft', panel)).saved('임시저장됨');
    } catch (e) {
      $('#p-c .cp-body', panel).innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`;
    }
  })();

  // 다음 계획 기본: 다니는 학원 과목마다 칸 하나 (과목 · 세부 과목 · 학원 숙제 켜짐)
  function seedAcademy() {
    const t = today(), seen = new Set();
    const acs = (st.sched || []).filter((r) => r.category === '학원' && r.subject && r.valid_from <= addDays(t, 7) && (!r.valid_to || r.valid_to >= t));
    const add = [];
    for (const r of acs) {
      const k = `${r.subject}|${r.subject_detail || ''}`; if (seen.has(k)) continue; seen.add(k);
      if (st.newItems.some((i) => matches(i, r))) continue;
      add.push({ subject: r.subject, subject_detail: r.subject_detail || null, title: '', detail: '', source: '계획', academy: true, acSeed: true });
    }
    st.newItems = [...add, ...st.newItems];
  }

  /* ---------- ① 상담 ---------- */
  const subOpts = (v) => SUBJECTS.map((s) => `<option${s === v ? ' selected' : ''}>${s}</option>`).join('');
  const subLabel = (i) => `${esc(i.subject)}${i.subject_detail ? `<small>${esc(i.subject_detail)}</small>` : ''}`;

  // 신규생: 목표 · 자신 있는 과목 · 약점 과목 · 만들고 싶은 공부 습관 (학생 정보에 저장)
  function newProfileHtml() {
    const P = st.profile;
    const chips = (key) => SUBJECTS.map((x) => `<button type="button" class="chip-t${P[key].includes(x) ? ' on' : ''}" data-pf="${key}" data-v="${x}">${x}</button>`).join('');
    return `<section class="cs-card" id="np">
      <div class="cs-card-h"><h4>신규생 정보</h4><span class="cs-meta">학생 정보에 저장 · 상담 참고사항에 표시</span></div>
      <div class="np-grid">
        <div class="field"><label for="np-goal">학생 목표</label>
          <textarea class="textarea" id="np-goal" rows="3" placeholder="예: 2학기 기말 수학 1등급, 수능 국어 2등급">${esc(P.goal)}</textarea></div>
        <div>
          <div class="field"><span class="lbl">자신 있는 과목<span class="opt">1개</span></span><div class="chips">${chips('strong')}</div></div>
          <div class="field"><span class="lbl">약점 과목<span class="opt">1개</span></span><div class="chips">${chips('weak')}</div></div>
        </div>
      </div>
      <div class="field"><span class="lbl">몰입관에서 만들고 싶은 공부 습관<span class="opt">1~3개</span></span>
        <div class="np-habits">${P.habits.map((h, k) => `<div class="np-habit"><span class="np-n">${k + 1}</span>
          <div class="input sm grow"><input data-habit="${k}" value="${esc(h)}" placeholder="예: 매일 스톱워치 3시간 이상"></div>
          ${P.habits.length > 1 ? `<button type="button" class="icon-btn sm" data-habit-del="${k}" aria-label="삭제">${X}</button>` : ''}</div>`).join('')}</div>
        ${P.habits.length < 3 ? '<button type="button" class="link-s cs-add" id="np-add">+ 습관 추가</button>' : ''}
      </div>
    </section>`;
  }

  function prevMeta() {
    const p = st.d.prevPlan; if (!p) return '';
    return `<span class="cs-meta">${p.author_role === '학생' ? '<span class="pill pill-gray">학생 작성</span>' : ''}${short(p.start_date)} ~ ${p.due_date ? short(p.due_date) : ''}</span>`;
  }

  // 학원 숙제: 학원 간 날마다 ✓/✗ + n/m회
  function acHist(i, h) {
    const a = academyStat(i, st.d.prevPlan, st.sched || [], h, st.d.prevPlan.due_date || today());
    if (!a.dates.length) return '<div class="cs-hist none">학원 숙제 · 기간 안에 학원 일정 없음</div>';
    return `<div class="ac-hist"><span class="ac-tag">학원 숙제 ${a.done}/${a.total}회</span>${a.dates.map((d) => {
      const v = a.checks.get(d);
      return `<span class="ac-d ${v === true ? 'ok' : v === false ? 'no' : ''}">${dayLabel(d)}${v === true ? ' ✓' : v === false ? ' ✗' : ''}</span>`;
    }).join('')}</div>`;
  }

  function prevHtml() {
    const { prevPlan } = st.d;
    // 지난 계획이 없으면(이전 시스템에서 옮겨 오는 학생 등) 직접 입력 → 저장 시 마감된 계획으로 기록
    if (!prevPlan && !st.prevItems.length) return `<div class="cs-empty">지난 계획이 없습니다.
      <button type="button" class="btn btn-gray btn-sm cs-manual" id="prev-add">지난 계획 직접 입력</button></div>`;
    return `
      <div class="cs-list" id="prev-list">${st.prevItems.map((i, k) => {
        const h = i.id ? st.d.progress.get(i.id) || [] : [];
        return `<div class="cs-item" data-k="${k}">
          <div class="cs-item-top">
            ${i.id && !i._editing ? `<span class="cs-sub">${subLabel(i)}</span><span class="cs-title">${esc(i.title)}</span>`
              : `<div class="input sm cs-subsel"><select data-f="subject">${subOpts(i.subject)}</select></div>
                 ${i.id ? `<div class="input sm cs-detail"><input data-f="subject_detail" value="${esc(i.subject_detail || '')}" placeholder="세부 과목"></div>` : ''}
                 <div class="input sm grow"><input data-f="title" value="${esc(i.title)}" placeholder="${prevPlan ? '추가 항목' : '지난 계획 분량'}"></div>`}
            <div class="input sm rate"><input data-f="final_rate" inputmode="numeric" maxlength="3" value="${i.final_rate ?? ''}" placeholder="-"><em>%</em></div>
            ${i.id && !i._editing ? `<button type="button" class="icon-btn sm" data-edit-prev="${k}" aria-label="지난 계획 수정" title="지난 계획 수정">${PEN_S}</button>` : ''}
            ${!i.id || i._editing ? `<button type="button" class="icon-btn sm" data-del-prev="${k}" aria-label="삭제">${X}</button>` : ''}
          </div>
          ${i.academy && st.d.prevPlan ? acHist(i, h) : h.length ? segBar(h) : (i.id ? '<div class="cs-hist none">진행률 입력 없음</div>' : '')}
          ${i.academy ? `<div class="ac-fb">
            <div class="input sm"><em>진도</em><input data-f="academy_progress" value="${esc(i.academy_progress || '')}" placeholder="예: 수특 6강까지"></div>
            <div class="input sm"><em>피드백</em><input data-f="final_note" value="${esc(i.final_note || '')}" placeholder="숙제 상태 · 보완할 점"></div></div>`
            : `<div class="input sm"><input data-f="final_note" value="${esc(i.final_note || '')}" placeholder="세부 이행도"></div>`}
        </div>`;
      }).join('') || '<div class="cs-empty">항목이 없습니다.</div>'}</div>
      <button type="button" class="link-s cs-add" id="prev-add">+ 항목 추가</button>`;
  }

  function nextHtml() {
    if (st.absent && !st.d.newPlan) return `<div class="cs-empty">결석 처리 시 지난 계획이 다음 상담까지 이어집니다.</div>`;
    const mine = st.d.subjects.map((s) => ({ subject: s.subject, subject_detail: s.subject_detail }));
    return `
      <div class="cs-quick">${mine.map((s, k) => `<button type="button" class="chip-t" data-quick="${k}">+ ${esc(s.subject)}${s.subject_detail ? ' ' + esc(s.subject_detail) : ''}</button>`).join('')}
        <button type="button" class="chip-t" data-quick="-1">+ 과목</button>
</div>
      <div id="carry"></div>
      <div class="cs-list" id="next-list">${st.newItems.map((i, k) => `
        <div class="cs-item" data-k="${k}">
          <div class="cs-item-top">
            <div class="input sm cs-subsel"><select data-f="subject">${subOpts(i.subject)}</select></div>
            <div class="input sm cs-detail"><input data-f="subject_detail" value="${esc(i.subject_detail || '')}" placeholder="세부 과목"></div>
            ${i.source === '이월' ? '<span class="pill pill-orange">이월</span>' : ''}
            <button type="button" class="chip-t ac-chip${i.academy ? ' on' : ''}" data-ac="${k}" title="학원 가는 날마다 숙제 해갔는지 체크"${st.acHas?.(i) ? '' : ' hidden'}>학원 숙제</button>
            <button type="button" class="icon-btn sm" data-del-next="${k}" aria-label="삭제">${X}</button>
          </div>
          <div class="input sm"><input data-f="title" value="${esc(i.title)}" placeholder="${i.academy ? '숙제 범위 (선택)' : '분량 (예: 쎈 B단계 p.40–72)'}"></div>
          <div class="input sm"><input data-f="detail" value="${esc(i.detail || '')}" placeholder="세부 사항"></div>
        </div>`).join('') || '<div class="cs-empty">위에서 과목을 눌러 추가하세요.</div>'}</div>`;
  }

  function drawConsult() {
    const body = $('#p-c', panel);
    body.innerHTML = `
      <div class="cp-body">
        <section class="cs-info">
          <div class="cs-info-g"><label for="cs-held">상담일</label>
            <div class="input sm cs-date"><input type="date" id="cs-held" value="${st.heldOn}"${st.absent ? ' disabled' : ''}></div></div>
          <span class="cs-div"></span>
          <div class="cs-info-g"><span class="lbl">구분</span>
            <div class="chips" id="cs-flags">
              <button type="button" class="chip-t${st.isNew ? ' on' : ''}" data-flag="isNew">신규생</button>
              <button type="button" class="chip-t${st.absent ? ' on' : ''}" data-flag="absent">결석</button>
              <button type="button" class="chip-t${st.isLeaving ? ' on' : ''}" data-flag="isLeaving">퇴원</button>
            </div></div>
          <span class="cs-kind" id="cs-kind"></span>
        </section>
        ${st.isNew ? newProfileHtml() : ''}
        <div class="cs-cols${st.isNew ? ' one' : ''}">
          ${st.isNew ? '' : `<section class="cs-card">
            <div class="cs-card-h"><h4>지난 계획 이행도</h4>${prevMeta()}</div>
            ${prevHtml()}
          </section>`}
          <section class="cs-card">
            <div class="cs-card-h"><h4>다음 계획</h4>${st.d.newPlan?.author_role === '학생' ? '<span class="pill pill-gray">학생 작성</span>' : ''}
              ${!(st.absent && !st.d.newPlan) && (st.d.prevPlan || st.carry) ? '<button type="button" class="link-s cs-carry" id="carry-btn">지난 계획에서 가져오기</button>' : ''}</div>
            ${nextHtml()}
          </section>
        </div>
        <section class="cs-card">
          <div class="cs-card-h"><h4>총평</h4></div>
          <textarea class="textarea" id="cs-sum" rows="4" aria-label="총평" placeholder="상담 내용, 학생 상태, 지도 방향">${esc(st.summary)}</textarea>
        </section>
      </div>
      <div class="cp-foot"><div class="cs-steps-slot">${stepsHtml()}</div><span class="save-st" id="cs-draft"></span><p class="err" id="cs-err" role="alert"></p><div class="spacer"></div>
        <a href="#/coaching" class="btn btn-gray btn-sm">목록</a>
        <button type="button" class="btn btn-primary btn-sm" id="cs-save">${st.coachingId ? '저장 · 다음' : '상담 저장 · 다음'}</button></div>`;
    paintKind();
    wireConsult(body);
  }

  function paintKind() {
    const el = $('#cs-kind', panel); if (!el) return;
    const k = st.absent ? '결석' : (st.heldOn > scheduled ? '보강' : '정규');
    el.innerHTML = `<span class="pill ${k === '결석' ? 'pill-red' : k === '보강' ? 'pill-orange' : 'pill-blue'}">${k}</span>`;
  }

  function wireConsult(body) {
    const keepScroll = (fn) => { const y = window.scrollY; fn(); window.scrollTo(0, y); };

    $('#cs-held', body).addEventListener('change', (e) => { st.heldOn = e.target.value || today(); paintKind(); });
    $('#cs-flags', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-flag]'); if (!b) return;
      st[b.dataset.flag] = !st[b.dataset.flag];
      keepScroll(drawConsult);
    });

    // 학원 숙제: 그 과목(과학·사회는 세부 과목까지) 학원이 있을 때만 칩 표시, 있으면 기본으로 켜짐 · 끄고 켜기 가능
    const acSync = (it, row) => {
      const has = !!st.acHas?.(it);
      if (!has) { it.academy = false; it.acManual = false; } else if (!it.acManual) it.academy = true;
      const chip = row?.querySelector('[data-ac]');
      if (chip) { chip.hidden = !has; chip.classList.toggle('on', it.academy); }
    };
    // 입력 → 상태 (다시 그리지 않음)
    const bind = (listSel, arr) => {
      const list = $(listSel, body); if (!list) return;
      list.addEventListener('input', (e) => {
        const f = e.target.dataset.f; if (!f) return;
        const it = arr()[Number(e.target.closest('[data-k]').dataset.k)];
        if (f === 'final_rate') {
          const v = e.target.value.replace(/\D/g, '').slice(0, 3);
          e.target.value = v;
          it.final_rate = v === '' ? null : Math.min(100, Number(v));
        } else it[f] = e.target.value;
        // 과목을 바꾸면 학원 과목인지 다시 판정 (직접 바꾼 적 없을 때)
        if ((f === 'subject' || f === 'subject_detail') && listSel === '#next-list') acSync(it, e.target.closest('[data-k]'));
      });
      list.addEventListener('blur', (e) => {
        if (e.target.dataset.f === 'final_rate' && e.target.value) e.target.value = String(Math.min(100, Number(e.target.value)));
      }, true);
    };
    bind('#prev-list', () => st.prevItems);
    bind('#next-list', () => st.newItems);

    const onClick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.pf) {
        const key = t.dataset.pf, v = t.dataset.v;
        st.profile[key] = st.profile[key][0] === v ? [] : [v];   // 과목 1개만
        $$(`[data-pf=${key}]`, panel).forEach((x) => x.classList.toggle('on', st.profile[key][0] === x.dataset.v));
        return;
      }
      if (t.id === 'np-add') { st.profile.habits.push(''); return keepScroll(drawConsult); }
      if (t.dataset.habitDel != null) { st.profile.habits.splice(Number(t.dataset.habitDel), 1); return keepScroll(drawConsult); }
      if (t.id === 'prev-add') {
        st.prevItems.push({ subject: '수학', subject_detail: null, title: '', final_rate: null, final_note: '', source: '추가' });
        keepScroll(drawConsult);
        popIn($$('#prev-list .cs-item', panel).pop());
        return;
      }
      if (t.dataset.editPrev != null) {
        const it = st.prevItems[Number(t.dataset.editPrev)]; it._editing = true; it._edited = true;
        keepScroll(drawConsult); queueDraft();
        $(`#prev-list [data-k="${t.dataset.editPrev}"] [data-f=title]`, panel)?.focus({ preventScroll: true });
        return;
      }
      if (t.dataset.delPrev != null) {
        const k = Number(t.dataset.delPrev);
        fadeOut(t.closest('.cs-item')).then(() => {
          const [it] = st.prevItems.splice(k, 1);
          if (it?.id) st.removedPrevIds = [...(st.removedPrevIds || []), it.id];
          keepScroll(drawConsult); queueDraft();
        });
        return;
      }
      if (t.dataset.quick != null) {
        const s = Number(t.dataset.quick) >= 0 ? st.d.subjects[Number(t.dataset.quick)] : { subject: '국어', subject_detail: null };
        st.newItems.push({ subject: s.subject, subject_detail: s.subject_detail, title: '', detail: '', source: '계획', academy: !!st.acHas?.(s) });
        keepScroll(drawConsult);
        const last = $$('#next-list .cs-item', panel).pop();
        popIn(last);
        last?.querySelector('[data-f=title]')?.focus({ preventScroll: true });
        return;
      }
      if (t.dataset.ac != null) { const it = st.newItems[Number(t.dataset.ac)]; it.academy = !it.academy; it.acManual = true; t.classList.toggle('on', it.academy); return; }
      if (t.dataset.delNext != null) {
        const k = Number(t.dataset.delNext);
        fadeOut(t.closest('.cs-item')).then(() => {
          const [it] = st.newItems.splice(k, 1);
          if (it?.id) st.removedIds.push(it.id);
          keepScroll(drawConsult); queueDraft();
        });
        return;
      }
      if (t.id === 'carry-btn') return toggleCarry();
      if (t.id === 'cs-save') return save(t);
    };
    // 패널은 다시 그릴 때마다 내용이 바뀌므로, 매번 새로 생기는 요소에만 연결
    $('.cp-body', body).addEventListener('click', onClick);
    $('.cp-foot', body).addEventListener('click', onClick);
    $('#cs-sum', body).addEventListener('input', (e) => { st.summary = e.target.value; });
    $('#np', body)?.addEventListener('input', (e) => {
      if (e.target.id === 'np-goal') st.profile.goal = e.target.value;
      if (e.target.dataset.habit != null) st.profile.habits[Number(e.target.dataset.habit)] = e.target.value;
    });
  }



  async function toggleCarry() {
    const box = $('#carry', panel);
    if (box.innerHTML) { box.innerHTML = ''; return; }
    if (!st.carry) {
      box.innerHTML = '<div class="cs-empty">불러오는 중</div>';
      try { st.carry = await loadCarryCandidates(stu.id, st.d.newPlan ? [st.d.newPlan.id] : []); }
      catch (e) { box.innerHTML = `<div class="cs-empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    }
    const rateOf = (i) => st.prevItems.find((p) => p.id === i.id)?.final_rate ?? i.final_rate;
    box.innerHTML = `<div class="carry-box">${st.carry.map((p) => `
      <p class="cs-range">${short(p.start_date)} ~ ${p.due_date ? short(p.due_date) : ''}</p>
      ${p.items.map((i) => `<label class="carry-row"><input type="checkbox" value="${esc(i.id)}">
        <span class="cs-sub">${subLabel(i)}</span><span class="cs-title">${esc(i.title)}</span>
        ${rateOf(i) != null ? `<span class="rate-tag${rateOf(i) <= 49 ? ' low' : ''}">${rateOf(i)}%</span>` : ''}</label>`).join('')}`).join('')
      || '<div class="cs-empty">가져올 계획이 없습니다.</div>'}
      <div class="carry-foot"><button type="button" class="btn btn-primary btn-sm" id="carry-go">선택 항목 가져오기</button></div></div>`;
    $('#carry-go', box)?.addEventListener('click', () => {
      const ids = $$('input:checked', box).map((c) => c.value);
      const all = st.carry.flatMap((p) => p.items);
      for (const id of ids) {
        const i = all.find((x) => x.id === id);
        const row = { subject: i.subject, subject_detail: i.subject_detail, title: i.title, detail: i.detail || '', source: '이월', carried_from: i.id, academy: !!st.acHas?.(i) && (i.academy ?? true) };
        const k = st.newItems.findIndex((x) => x.acSeed && !x.title.trim() && x.subject === i.subject && (x.subject_detail || '') === (i.subject_detail || ''));
        if (k >= 0) st.newItems[k] = row; else st.newItems.push(row);
      }
      const y = window.scrollY; drawConsult(); window.scrollTo(0, y);
      if (ids.length) toast(`${ids.length}개 항목을 가져왔습니다`);
    });
  }

  async function save(btn) {
    const err = $('#cs-err', panel); err.textContent = '';
    const prevItems = st.prevItems.filter((i) => i.id || i.title.trim());
    const newItems = st.newItems.map((i) => (i.academy && !i.title.trim() ? { ...i, title: '학원 숙제' } : i)).filter((i) => i.title.trim()).map((i) => ({ ...i, academy: !!i.academy && !!st.acHas?.(i) }));
    if (st.newItems.some((i) => !i.title.trim() && (i.detail || '').trim())) { toast('분량이 비어 있는 계획이 있습니다', 'bad'); return (err.textContent = '분량이 비어 있는 계획이 있습니다.'); }
    if (!st.absent && !newItems.length && !st.isLeaving) { toast('다음 계획을 하나 이상 입력하세요', 'bad'); return (err.textContent = '다음 계획을 하나 이상 입력하세요.'); }

    btn.disabled = true; btn.textContent = '저장 중';
    try {
      // 상담 중 추가한 지난 계획 항목
      // 지난 계획 직접 입력분 → 마감된 계획 1장으로 기록 (기간: 상담일 7일 전 ~ 상담일)
      if (!st.d.prevPlan && !st.isNew && prevItems.some((i) => !i.id)) {
        const { data: pl, error: pe } = await sb.from('plans').insert({
          student_id: stu.id, start_date: addDays(scheduled, -7), due_date: scheduled,
          author_role: '선생님', status: '마감', closed_at: new Date().toISOString(), created_by: st.me,
        }).select('*').single();
        if (pe) throw pe;
        st.d.prevPlan = pl;
      }
      for (const it of prevItems) {
        if (it.id || !st.d.prevPlan || st.isNew) continue;
        const { data, error } = await sb.from('plan_items').insert({
          plan_id: st.d.prevPlan.id, student_id: stu.id, subject: it.subject, title: it.title.trim(),
          source: st.d.prevPlan.status === '마감' && !st.d.prevItems.length ? '계획' : '추가', created_by: st.me,
          final_rate: it.final_rate ?? null, final_note: it.final_note || null,
        }).select('*').single();
        if (error) throw error;
        it.id = data.id;
      }
      let profile = null;
      if (st.isNew) {
        const P = st.profile;
        profile = { goal: P.goal.trim() || null, strong_subjects: P.strong, weak_subjects: P.weak, habits: P.habits.map((h) => h.trim()).filter(Boolean) };
        const { error } = await sb.from('students').update(profile).eq('id', stu.id);
        if (error) throw error;
        Object.assign(stu, profile);
      }
      // 학원 숙제 횟수 (보고에 고정)
      if (st.d.prevPlan) for (const i of prevItems) if (i.academy) i.acStat = academyStat(i, st.d.prevPlan, st.sched || [], st.d.progress.get(i.id), st.d.prevPlan.due_date || today());
      const coachingId = await saveConsult({ profile,
        student: stu, scheduled, heldOn: st.heldOn, absent: st.absent, isNew: st.isNew, isLeaving: st.isLeaving,
        summary: st.summary.trim(), checkItems: st.checkItems,
        prevPlan: st.isNew ? null : st.d.prevPlan, prevItems: st.isNew ? [] : prevItems.filter((i) => i.id), newPlan: st.d.newPlan,
        newItems, removedIds: st.removedIds, removedPrevIds: st.isNew ? [] : st.removedPrevIds, subjects: st.d.subjects,
      }, st.me);
      st.d = await loadConsult(stu.id, scheduled);
      st.coachingId = coachingId; st.report = st.d.report; st.removedIds = []; st.removedPrevIds = []; st.rDrawn = false;
      st.prevItems.forEach((i) => { delete i._editing; delete i._edited; });
      st.newItems = st.d.newItems.map((i) => ({ ...i }));
      clearDraft();
      onSaved?.();
      toast('상담이 저장되었습니다');
      drawConsult();
      showTab('r');
    } catch (e) {
      err.textContent = '저장 실패: ' + e.message; toast('저장 실패: ' + e.message, 'bad'); console.error(e);
      btn.disabled = false; btn.textContent = st.coachingId ? '저장 · 다음' : '상담 저장 · 다음';
    }
  }

  /* ---------- ③ 전송 (선택) ---------- */
  function drawSend() {
    const pane = $('#p-s', panel), r = st.report;
    pane.innerHTML = `
      <div class="cp-body">
        <div class="rp-cols">
          <div class="sd-wrap"><h3 class="sd-title">학부모에게 전송</h3>
            <p class="sd-sub">지금 보내도 되고, 나중에 <a href="#/parents?sid=${esc(stu.id)}" class="link-s">학부모 안내</a> 탭에서 보내도 됩니다.</p>
            <div id="sd-box"></div></div>
          <div class="rp-preview"><div class="rp-pv-h"><p class="lbl">학부모 화면</p><button type="button" class="link-s" id="sd-big">크게 보기</button></div><div id="sd-card"></div></div>
        </div>
      </div>
      <div class="cp-foot"><div class="cs-steps-slot">${stepsHtml()}</div><div class="spacer"></div>
        <a href="#/coaching" class="btn btn-gray btn-sm">코칭으로</a></div>`;
    mountReport($('#sd-card', pane), r, stu);
    $('#sd-big', pane).addEventListener('click', () => openReportViewer(r, stu));
    mountSend($('#sd-box', pane), { report: r, student: stu, onChange: () => { onSaved?.(); paintSteps(); } });
  }

  /* ---------- ② 보고 ---------- */
  function drawReport() {
    const r = st.report;
    const isNew = !!r.stats?.is_new;
    const subs = isNew ? [] : reportSubjects(r);   // 신규생은 총평만
    const fbOf = (s) => (r.subject_feedback || []).find((x) => x.subject === s)?.text || '';
    const extra = isNew ? [] : (r.subject_feedback || []).filter((x) => !subs.includes(x.subject));
    const pane = $('#p-r', panel);
    // 배지: 처음 열 때 자동 판정(이행도·순공시간·기록 일수) → 선생님이 끄고 켤 수 있음
    let badges = r.stats ? [...badgesOf(r)] : [];
    pane.innerHTML = `
      <div class="cp-body">
        <div class="rp-cols">
          <div class="rp-edit">
            <div class="rp-step"><span class="num">가</span><div class="grow"><b>프롬프트 복사</b><p class="sub-s">${isNew ? 'GPT에 붙여넣으면 신규생 총평이 정돈됩니다.' : 'GPT에 붙여넣으면 과목별 피드백과 총평이 정돈됩니다.'}</p></div>
              <button type="button" class="btn btn-gray btn-sm" id="rp-copy">복사</button></div>
            <div class="rp-step col"><div class="rp-step-h"><span class="num">나</span><b>GPT 결과 붙여넣기</b></div>
              <textarea class="textarea mono" id="rp-paste" rows="4" placeholder="[국어] …&#10;[총평] …"></textarea>
              <p class="hint" id="rp-parsed"></p></div>
            <div class="rp-step col"><div class="rp-step-h"><span class="num">다</span><b>확인 · 수정</b></div>
              ${[...subs, ...extra.map((x) => x.subject)].map((s) => `
                <div class="field"><label>${esc(s)}<span class="opt">2문장 이내</span></label>
                  <textarea class="textarea" rows="2" data-fb="${esc(s)}">${esc(fbOf(s))}</textarea></div>`).join('')}
              <div class="field"><label for="rp-sum">총평<span class="opt">${isNew ? '과목별 공부 방향 · 분량 자유' : '3문장 이내'}</span></label>
                <textarea class="textarea" id="rp-sum" rows="3">${esc(r.summary || '')}</textarea></div>
              <div class="field"><span class="lbl">배지<span class="opt">자동 판정 · 눌러서 끄고 켜기</span></span>
                <div class="chips" id="rp-badge">${BADGE_ORDER.map((k) => `<button type="button" class="chip-t" data-v="${k}">${k}</button>`).join('')}</div>
                <p class="hint" id="rp-badge-hint"></p></div>
            </div>
          </div>
          <div class="rp-preview"><div class="rp-pv-h"><p class="lbl">학부모 화면</p><button type="button" class="link-s" id="rp-big">크게 보기</button></div><div id="rp-card"></div></div>
        </div>
      </div>
      <div class="cp-foot">
        <div class="cs-steps-slot">${stepsHtml()}</div><span class="save-st" id="rp-auto"></span><p class="err" id="rp-err" role="alert"></p><div class="spacer"></div>
        <button type="button" class="btn btn-gray btn-sm" id="rp-save">저장</button>
        <button type="button" class="btn btn-primary btn-sm" id="rp-next">저장 · 다음</button>
      </div>`;

    const collect = () => {
      const fb = $$('[data-fb]', pane).map((t) => ({ subject: t.dataset.fb, text: t.value.trim() })).filter((x) => x.text);
      const main = ['최우수', '우수', '주말등원'].find((k) => badges.includes(k)) || '없음';   // 예전 칸(1개)도 채움
      return { subject_feedback: fb, summary: $('#rp-sum', pane).value.trim() || null, badges: [...badges], badge: main, stats: r.stats || null };
    };
    const preview = () => mountReport($('#rp-card', pane), { ...r, ...collect() }, stu);
    $('#rp-big', pane).addEventListener('click', () => openReportViewer({ ...r, ...collect() }, stu));
    const paintState = () => paintSteps();
    const paintBadges = () => {
      $$('#rp-badge button', pane).forEach((x) => x.classList.toggle('on', badges.includes(x.dataset.v)));
      const auto = r.stats ? autoBadges(r.rates, r.stats) : [];
      const h = r.stats;
      $('#rp-badge-hint', pane).textContent = h
        ? `자동: ${auto.join(' · ') || '없음'}  (순공 ${Math.floor((h.study_seconds || 0) / 3600)}시간 ${Math.round(((h.study_seconds || 0) % 3600) / 60)}분 · 기록 ${h.days_studied}/${h.days_needed}일${h.prev_avg != null ? ` · 지난번 평균 ${h.prev_avg}%` : ''})`
        : '판정 중';
    };
    preview(); paintState(); paintBadges();
    if (!r.stats) {
      computeReportStats(r).then((stats) => {
        r.stats = stats; badges = autoBadges(r.rates, stats);
        paintBadges(); preview();
      }).catch((e) => { $('#rp-badge-hint', pane).textContent = '자동 판정 실패: ' + e.message; });
    }

    $('.cp-body', pane).addEventListener('input', (e) => {
      if (e.target.id === 'rp-paste') {
        const g = parseGpt(e.target.value);
        let n = 0;
        for (const f of g.feedback) {
          const t = $$('[data-fb]', pane).find((x) => x.dataset.fb === f.subject);
          if (t) { t.value = f.text; n++; }
        }
        if (g.summary) $('#rp-sum', pane).value = g.summary;
        const miss = g.feedback.filter((f) => !subs.includes(f.subject)).map((f) => f.subject);
        $('#rp-parsed', pane).innerHTML = g.feedback.length || g.summary
          ? `과목 ${n}개${g.summary ? ' · 총평' : ''} 반영${miss.length ? ` · <b>${esc(miss.join(', '))}</b>은(는) 과목이 없어 제외` : ''}` : '';
      }
      dirty = true; preview(); autoSave();
    });
    $('#rp-badge', pane).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.v;
      badges = badges.includes(k) ? badges.filter((x) => x !== k) : [...badges, k];
      dirty = true; paintBadges(); preview(); autoSave();
    });
    $('#rp-copy', pane).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = buildPrompt({ student: stu, scheduled, report: r, prevItems: st.d.prevItems, summary: st.summary.trim(), checkItems: st.checkItems });
      if (await copy(text)) { flashDone(btn); toast('프롬프트를 복사했습니다'); } else toast('복사 실패');
    });

    let aTimer = 0, dirty = false;
    const ss = saveState($('#rp-auto', pane));
    const persist = async (extraPatch = {}) => {
      const err = $('#rp-err', pane); err.textContent = '';
      try {
        const saved = await saveReport(st.coachingId, { ...collect(), ...extraPatch });
        Object.assign(r, saved); dirty = false; paintState(); onSaved?.();
        return true;
      } catch (e) { err.textContent = '저장 실패: ' + e.message; toast('저장 실패: ' + e.message, 'bad'); console.error(e); return false; }
    };
    $('#rp-save', pane).addEventListener('click', async () => { clearTimeout(aTimer); if (await persist()) { toast('저장되었습니다'); ss.saved(); } });
    // 공개 전에는 입력을 멈추면 자동 저장 (공개 후에는 학부모 화면이 바뀌므로 직접 저장)
    function autoSave() {
      if (r.published_at) return;
      ss.saving('자동 저장 중');
      clearTimeout(aTimer);
      aTimer = setTimeout(async () => { (await persist()) ? ss.saved('자동 저장됨') : ss.failed(); }, 1400);
    }
    $('#rp-next', pane).addEventListener('click', async (e) => {
      clearTimeout(aTimer);
      const c = collect();
      if (!c.summary && !c.subject_feedback.length && !r.is_absent) { toast('피드백이나 총평을 입력하세요', 'bad'); return ($('#rp-err', pane).textContent = '피드백이나 총평을 입력하세요.'); }
      e.currentTarget.disabled = true;
      const ok = await persist();
      e.currentTarget.disabled = false;
      if (ok) { ss.saved(); showTab('s'); }
    });
    // 다른 단계로 갈 때 작성 중인 내용 저장 (공개 전만 — 공개 후에는 직접 저장)
    st.flushReport = async () => {
      clearTimeout(aTimer);
      if (!r.published_at) await persist();
      else if (dirty) toast('공개된 보고는 [저장]을 눌러야 학부모 화면에 반영돼요', 'bad');
    };
  }

}
