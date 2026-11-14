// 학부모 안내 (학부모 보고 + 학습 문의 통합) — 3단
//  ① 학생: 주간 보고 현황(정사각형 3칸 · 누르면 거르기) + 학생 목록(보고 상태 · 안 읽은 문의)
//  ② 이번 주 보고서: 고른 학생의 상태 · 미리보기 · 상담 열기
//  ③ 학부모 대화: 고른 학생 방 (대화 1개월 보관)
import { $, $$, esc, sheet, X } from '../ui.js';
import { today, mondayOf, addDays, short, DOW, hm } from '../date.js';
import { loadWeekReports } from '../data/coaching.js';
import { loadStudents } from '../data/students.js';
import { loadInbox, purgeOld, KEEP_DAYS } from '../data/chat.js';
import { mountReport, badgesOf } from '../views/report-card.js';
import { mountThread } from '../views/chat-thread.js';
import { mountSend } from './send-report.js';
import { openReportViewer } from '../views/report-viewer.js';

const md = (d) => short(d).replace(/\(.\)/, '');
const dow = (d) => DOW[(new Date(d + 'T00:00:00Z').getUTCDay() || 7)];
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const when = (iso) => {
  const d = kst(iso), t = kst(new Date().toISOString()).slice(0, 10);
  return d.slice(0, 10) === t ? d.slice(11, 16) : `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
};
const stamp = (iso) => kst(iso).slice(5, 16).replace('-', '/').replace('T', ' ');
const CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
const STATE = {
  wait: ['상담 전', 'pill-gray'], miss: ['미상담', 'pill-red'], draft: ['작성 중', 'pill-orange'],
  pub: ['미전송', 'pill-blue'], sent: ['전송 완료', 'pill-green'], none: ['', ''],
};
const ORDER = { miss: 0, pub: 1, draft: 2, wait: 3, sent: 4, none: 5 };
const TILES = [
  ['done', '상담 완료', (x) => !!x.c],
  ['pub', '미전송', (x) => x.state === 'pub'],
  ['sent', '전송 완료', (x) => x.state === 'sent'],
];

export async function renderParents(body, { me, onUnread } = {}) {
  const thisMon = mondayOf(today());
  const st = { mon: thisMon, students: [], week: null, inbox: new Map(), rows: [], cur: null, q: '', f: null };
  const token = {}; body._view = token;
  body.innerHTML = `
    <div class="t-head"><h2>학부모 안내</h2><span class="count">주간 보고 · 학부모 대화 ${KEEP_DAYS}일 보관</span></div>
    <div class="pg3">
      <aside class="card pg-col pg-list">
        <div class="wk-nav pg-wk"><button type="button" class="icon-btn sm" id="pg-prev" aria-label="이전 주">${CHEV_L}</button>
          <span id="pg-wk"></span>
          <button type="button" class="icon-btn sm" id="pg-next" aria-label="다음 주">${CHEV_R}</button></div>
        <div class="pg-tiles" id="pg-tiles"></div>
        <div class="search"><input id="pg-q" type="search" placeholder="이름 · 자리 검색" aria-label="학생 검색"></div>
        <ul class="pg-stu" id="pg-stu"><li class="empty">불러오는 중</li></ul>
      </aside>
      <section class="card pg-col pg-rep" id="pg-rep"><div class="pg-none"><i class="pg-ic rep"></i>학생을 고르면 이번 주 보고서가 보입니다.</div></section>
      <section class="card pg-col pg-chat" id="pg-chat"><div class="pg-none"><i class="pg-ic chat"></i>학생을 고르면 학부모와 대화할 수 있습니다.</div></section>
    </div>`;
  purgeOld();

  $('#pg-prev').addEventListener('click', () => { st.mon = addDays(st.mon, -7); loadWeek(); });
  $('#pg-next').addEventListener('click', () => { if (st.mon < thisMon) { st.mon = addDays(st.mon, 7); loadWeek(); } });
  $('#pg-q').addEventListener('input', (e) => { st.q = e.target.value.trim(); drawList(); });
  $('#pg-tiles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    st.f = st.f === b.dataset.f ? null : b.dataset.f; drawTiles(); drawList();
  });

  try { st.students = (await loadStudents()).filter((s) => s.status !== '퇴원'); }
  catch (e) { $('#pg-stu').innerHTML = `<li class="empty">불러오기 실패: ${esc(e.message)}</li>`; return; }

  async function loadBox() { try { st.inbox = await loadInbox(); } catch { /* 그대로 */ } }

  async function loadWeek() {
    $('#pg-wk').textContent = `${st.mon === thisMon ? '이번 주 ' : ''}${md(st.mon)} – ${md(addDays(st.mon, 6))}`;
    $('#pg-next').disabled = st.mon >= thisMon;
    try { st.week = await loadWeekReports(st.mon); }
    catch (e) { $('#pg-stu').innerHTML = `<li class="empty">불러오기 실패: ${esc(e.message)}</li>`; return; }
    build(); drawTiles(); drawList();
    if (st.cur) drawReport();
  }

  // 학생마다: 이번 주 상담·보고 상태 + 대화
  function build() {
    const d = st.week, mon = st.mon;
    st.rows = st.students.map((s) => {
      const c = d.coachings.get(s.id) || null, r = c ? d.reports.get(c.id) || null : null, slot = d.slots.get(s.id) || null;
      const on = c?.scheduled_on || (slot ? addDays(mon, slot.weekday - 1) : null);
      const state = !c ? (slot ? (on < today() ? 'miss' : 'wait') : 'none') : !r ? 'draft' : r.sent_at ? 'sent' : r.published_at ? 'pub' : 'draft';
      return { s, c, r, slot, on, state };
    });
  }

  function drawTiles() {
    $('#pg-tiles').innerHTML = TILES.map(([k, label, fn]) => {
      const n = st.rows.filter(fn).length;
      return `<button type="button" class="pg-tile${st.f === k ? ' on' : ''}${k === 'pub' && n ? ' hot' : ''}" data-f="${k}" aria-pressed="${st.f === k}">
        <span>${label}</span><b class="cu">${n}</b></button>`;
    }).join('');
  }

  function drawList() {
    const q = st.q.toLowerCase();
    const fn = TILES.find(([k]) => k === st.f)?.[2] || (() => true);
    const box = (x) => st.inbox.get(x.s.id);
    const list = st.rows.filter((x) => fn(x) && (!q || x.s.name.toLowerCase().includes(q) || String(x.s.seat_no || '') === q))
      .sort((a, b) => (box(b)?.unread || 0) - (box(a)?.unread || 0)
        || ORDER[a.state] - ORDER[b.state]
        || (box(b)?.last.created_at || '').localeCompare(box(a)?.last.created_at || '')
        || (Number(a.s.seat_no) || 999) - (Number(b.s.seat_no) || 999) || a.s.name.localeCompare(b.s.name, 'ko'));
    const el = $('#pg-stu'); if (!el) return;
    if (!list.length) { el.innerHTML = `<li class="empty">${st.f ? '해당하는 학생이 없습니다.' : '검색 결과가 없습니다.'}</li>`; return; }
    el.innerHTML = list.map((x) => {
      const b = box(x), [lbl, cls] = STATE[x.state];
      const sub = b ? `${b.last.sender === 'teacher' ? '나: ' : ''}${esc(b.last.body)}`
        : x.on ? `상담 ${md(x.on)}(${dow(x.on)})${x.slot && !x.c ? ` ${hm(x.slot.start_time)}` : ''}` : '이번 주 상담 없음';
      return `<li><button type="button" class="pg-item${st.cur?.id === x.s.id ? ' on' : ''}" data-id="${esc(x.s.id)}">
        <div class="pg-top"><span class="seat${x.s.seat_no ? '' : ' none'}">${esc(x.s.seat_no || '-')}</span><b>${esc(x.s.name)}</b><small>${esc(x.s.grade || '')}</small>
          ${lbl ? `<span class="pill ${cls}">${lbl}</span>` : ''}</div>
        <div class="pg-last"><span>${sub}</span>${b ? `<time>${when(b.last.created_at)}</time>` : ''}${b?.unread ? `<i class="pa-n">${b.unread}</i>` : ''}</div>
      </button></li>`;
    }).join('');
  }

  $('#pg-stu').addEventListener('click', (e) => {
    const b = e.target.closest('.pg-item'); if (!b) return;
    open(st.students.find((s) => s.id === b.dataset.id));
  });

  function rowOf(id) { return st.rows.find((x) => x.s.id === id); }

  // ② 보고서
  function drawReport() {
    const x = rowOf(st.cur.id), el = $('#pg-rep');
    const [lbl, cls] = STATE[x.state];
    const head = `<div class="pg-h"><div><b>이번 주 보고서</b><small>${md(st.mon)} – ${md(addDays(st.mon, 6))}</small></div>
      ${lbl ? `<span class="pill ${cls}">${lbl}</span>` : ''}</div>`;
    const consult = x.on ? `<a class="btn btn-sm ${x.c ? 'btn-gray' : 'btn-primary'}" href="#/consult?sid=${esc(x.s.id)}&on=${x.on}">${x.c ? '상담 열기' : '상담 시작'}</a>` : '';
    let main;
    if (x.r?.published_at || x.r) {
      const badges = badgesOf(x.r);
      const rates = (x.r.rates || []).filter((r) => r.rate != null);
      const avg = rates.length ? Math.round(rates.reduce((a, r) => a + r.rate, 0) / rates.length) : null;
      main = `<dl class="pg-meta">
          <div><dt>상담일</dt><dd>${md(x.on)}(${dow(x.on)}) · ${esc(x.c.kind || '')}</dd></div>
          <div><dt>평균 이행도</dt><dd>${avg != null ? `<b class="${avg >= 90 ? 'g' : avg < 50 ? 'r' : ''}">${avg}%</b>` : '-'}</dd></div>
          <div><dt>학부모</dt><dd>${x.r.published_at ? (x.r.read_at ? `<span class="rp-read">읽음 <small>${stamp(x.r.read_at)}</small></span>` : '<span class="rp-unread">안 읽음</span>') : '<span class="sub">공개 전</span>'}</dd></div>
          ${badges.length ? `<div><dt>배지</dt><dd>${badges.map((b) => `<span class="rp-bd">${esc(b)}</span>`).join('')}</dd></div>` : ''}
        </dl>
        <div class="pg-send" id="pg-send"></div>
        <div class="pg-prev"><div class="pg-prev-h"><span>미리보기</span><button type="button" class="btn btn-sm btn-gray" id="pg-big">${EXPAND}크게 보기</button></div>
          <div class="pg-paper" id="pg-paper"></div></div>`;
    } else {
      const msg = x.state === 'none' ? '이번 주 상담 일정이 없습니다.'
        : x.state === 'wait' ? `${md(x.on)}(${dow(x.on)}) ${x.slot ? hm(x.slot.start_time) : ''} 상담 예정입니다.`
          : x.state === 'miss' ? `${md(x.on)}(${dow(x.on)}) 상담이 아직 기록되지 않았습니다.`
            : '상담은 저장됐고 보고서를 작성 중입니다.';
      main = `<div class="pg-empty"><p>${msg}</p>${consult}</div>`;
    }
    el.innerHTML = `${head}<div class="pg-body">${main}</div>${x.r && consult ? `<div class="pg-foot">${consult}</div>` : ''}`;
    if (x.r) {
      mountReport($('#pg-paper', el), x.r, x.s);
      mountSend($('#pg-send', el), { report: x.r, student: x.s, compact: true, onChange: () => { build(); drawTiles(); drawList(); drawReport(); } });
      $('#pg-big', el).addEventListener('click', () => openReportViewer(x.r, x.s, `${x.s.name} ${md(x.on)} 보고서`));
    }
  }

  // ③ 대화
  function open(s) {
    st.cur = s; drawList(); drawReport();
    body.classList.add('pg-open');
    const el = $('#pg-chat');
    el.innerHTML = `<div class="pg-h"><button type="button" class="icon-btn pg-back" id="pg-back" aria-label="목록"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div><b>${esc(s.name)} 학부모</b><small>${esc(s.grade || '')}${s.school ? ` · ${esc(s.school)}` : ''}</small></div></div>
      <div class="pg-thread" id="pg-thread"></div>`;
    $('#pg-back').addEventListener('click', () => { body.classList.remove('pg-open'); st.cur = null; drawList(); });
    mountThread($('#pg-thread'), { student: s, me: 'teacher', meName: me?.name || '', onActivity: async () => { await loadBox(); drawList(); onUnread?.(); } });
  }

  await Promise.all([loadBox(), loadWeek()]);
  const openId = new URLSearchParams(location.hash.split('?')[1] || '').get('sid');
  const first = openId ? st.students.find((s) => s.id === openId) : null;
  if (first) open(first);
  else if (matchMedia('(min-width:1101px)').matches) {
    // 넓은 화면: 맨 위(안 읽은 문의 · 처리할 보고) 학생을 바로 열어 둠
    const top = $('#pg-stu .pg-item'); if (top) open(st.students.find((s) => s.id === top.dataset.id));
  }
  const t = setInterval(async () => { if (body._view !== token || !$('#pg-stu')) return clearInterval(t); await loadBox(); drawList(); }, 15000);
}
