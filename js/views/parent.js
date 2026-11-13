// 학부모 화면: 받은 주간 보고를 문자처럼 작게 → 누르면 크게
import { mount, $, $$, esc, BRAND } from '../ui.js';
import { sb } from '../sb.js';
import { short } from '../date.js';
import { mountReport, BADGE_INFO } from './report-card.js';
import { openReportViewer } from './report-viewer.js';

export async function renderParentHome({ students, onLogout }) {
  let cur = students[0];
  mount(`<div class="pa">
    <header class="top"><div class="top-in">${BRAND}<div class="spacer"></div>
      <button type="button" class="chip muted" id="lo">로그아웃</button></div></header>
    <main class="pa-page">
      <h1 class="pa-h">학습 보고</h1>
      ${students.length > 1 ? `<div class="seg seg-wide pa-kids" id="kids">${students.map((s, i) =>
        `<button type="button" data-i="${i}" class="${i ? '' : 'on'}">${esc(s.name)}</button>`).join('')}</div>` : ''}
      <div id="msgs" class="pa-msgs"><div class="pa-empty">불러오는 중</div></div>
    </main></div>`);
  $('#lo').addEventListener('click', onLogout);

  let all = [];
  try {
    const { data, error } = await sb.from('reports').select('*').in('student_id', students.map((s) => s.id));
    if (error) throw error;
    all = (data || []).filter((r) => r.published_at).sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
  } catch (e) {
    $('#msgs').innerHTML = `<div class="pa-empty">불러오기 실패: ${esc(e.message)}</div>`;
    return;
  }

  function draw() {
    const list = all.filter((r) => r.student_id === cur.id);
    const box = $('#msgs');
    if (!list.length) { box.innerHTML = '<div class="pa-empty">도착한 보고가 없습니다.</div>'; return; }
    box.innerHTML = list.map((r, i) => {
      const b = BADGE_INFO[r.badge];
      const when = r.period_end ? short(r.period_end) : '';
      return `<div class="msg">
        <div class="msg-av">U2M</div>
        <div class="msg-main">
          <div class="msg-from">몰입관<span>${when}</span></div>
          <button type="button" class="msg-bubble" data-i="${i}">
            <p class="msg-text">${esc(cur.name)} 학생 주간 보고서${b ? `<br><em class="${b.cls}">${esc(b.title)}</em>` : ''}</p>
            <div class="msg-thumb"><div class="msg-thumb-in"></div>
              <span class="msg-zoom" aria-label="크게 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M8 10.5h5M10.5 8v5"/></svg></span></div>
          </button>
        </div>
      </div>`;
    }).join('');
    $$('.msg-bubble', box).forEach((btn) => {
      const r = list[Number(btn.dataset.i)];
      mountReport($('.msg-thumb-in', btn), r, cur);
      btn.addEventListener('click', () => openReportViewer(r, cur, `${short(r.period_end)} 주간 보고`));
    });
  }
  draw();

  $('#kids')?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    cur = students[Number(b.dataset.i)];
    $$('#kids button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
}
