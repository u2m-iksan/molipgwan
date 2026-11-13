// 선생님 · 전체 현황(상황판): 자리순 학생 카드, 빨강·주황·초록 + 몰입 중 · 오늘 순공 · (토) 등원 상태
import { $, $$, esc } from '../ui.js';
import { isoDow, today } from '../date.js';
import { loadOverview, judge } from '../data/overview.js';

const COLOR = { red: '빨강', orange: '주황', green: '초록' };
const bySeat = (a, b) => {
  if (!a.seat_no !== !b.seat_no) return a.seat_no ? -1 : 1;
  return String(a.seat_no || '').localeCompare(String(b.seat_no || ''), 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
};
const hm = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const clock = () => new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });

export async function renderOverview(body) {
  const st = { filter: '전체', level: '전체', data: null, list: [], timer: null };
  const sat = isoDow(today()) === 6;

  body.innerHTML = `
    <div class="t-head"><h2>전체 현황 <span class="count" id="ov-at"></span></h2><div class="spacer"></div>
      <span class="ov-live" id="ov-live"></span></div>
    <div class="t-tools">
      <div class="seg" id="ov-f"></div>
      <div class="seg" id="ov-l">${['전체', '중등', '고등'].map((l) => `<button type="button" data-v="${l}">${l}</button>`).join('')}</div>
      <div class="spacer"></div>
      <span class="ov-rule">빨강: 계획 없음 · 스톱워치/진행률 2일 공백 &nbsp;·&nbsp; 주황: 최근 2일 순공 2시간 미만</span>
    </div>
    <div id="ov-grid" class="ov-grid"><div class="card empty">불러오는 중</div></div>`;

  $('#ov-f').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.filter = b.dataset.v; paint(); });
  const lv = $('#ov-l');
  lv.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.level = b.dataset.v; paint(); });

  async function load() {
    try { st.data = await loadOverview(); }
    catch (e) { $('#ov-grid').innerHTML = `<div class="card empty">불러오기 실패: ${esc(e.message)}</div>`; return; }
    st.list = judge(st.data).sort(bySeat);
    $('#ov-at') && ($('#ov-at').textContent = `${clock()} 기준`);
    paint();
  }

  function paint() {
    const grid = $('#ov-grid'); if (!grid) return;
    const lvl = st.list.filter((s) => st.level === '전체' || s.grade.startsWith(st.level === '중등' ? '중' : '고'));
    const n = (c) => lvl.filter((s) => s.color === c).length;
    const segs = [['전체', lvl.length], ['red', n('red')], ['orange', n('orange')], ['green', n('green')]];
    $('#ov-f').innerHTML = segs.map(([v, c]) => `<button type="button" data-v="${v}" class="${st.filter === v ? 'on' : ''}">${v === '전체' ? '전체' : `<i class="ov-dot ${v}"></i>${COLOR[v]}`}<b>${c}</b></button>`).join('');
    $$('button', lv).forEach((b) => b.classList.toggle('on', b.dataset.v === st.level));
    const live = lvl.filter((s) => s.active && !s.active.paused_at).length;
    $('#ov-live').innerHTML = live ? `<i></i>몰입 중 ${live}명` : '';
    const list = lvl.filter((s) => st.filter === '전체' || s.color === st.filter);
    if (!list.length) { grid.innerHTML = `<div class="card empty">${st.list.length ? '해당 학생이 없습니다.' : '재원 학생이 없습니다.'}</div>`; return; }
    grid.innerHTML = list.map(card).join('');
    $$('.ov-card', grid).forEach((c) => c.addEventListener('click', () => { location.hash = `#/students?open=${c.dataset.id}`; }));
  }

  function card(s) {
    const on = s.active && !s.active.paused_at;
    const att = !sat ? '' : !s.att ? '<span class="pill pill-red">미등원</span>'
      : s.att.kind === '외출' ? `<span class="pill pill-orange">외출${s.att.reason ? ' · ' + esc(s.att.reason) : ''}</span>`
        : s.att.kind === '하원' ? '<span class="pill pill-gray">하원</span>' : '<span class="pill pill-green">등원</span>';
    return `<button type="button" class="ov-card ${s.color}" data-id="${esc(s.id)}">
      <div class="ov-top"><span class="seat${s.seat_no ? '' : ' none'}">${esc(s.seat_no || '-')}</span>
        <b class="ov-name">${esc(s.name)}</b><span class="ov-grade">${esc(s.grade)}</span><i class="ov-dot ${s.color}" title="${COLOR[s.color]}"></i></div>
      <div class="ov-why">${s.reasons.length ? s.reasons.map((r) => `<span>${esc(r)}</span>`).join('') : '<span class="ok">정상</span>'}</div>
      <div class="ov-foot">
        ${on ? `<span class="ov-on"><i></i>${esc(s.active.subject)} 몰입 중</span>` : s.active ? '<span class="ov-pause">일시정지</span>' : ''}
        <span class="ov-today">오늘 ${s.todaySec ? hm(s.todaySec) : '-'}</span>${att}
      </div>
    </button>`;
  }

  await load();
  // 1분마다 갱신 (화면을 떠나면 멈춤)
  const token = {}; body._view = token;
  st.timer = setInterval(() => { if (body._view !== token || !$('#ov-grid')) return clearInterval(st.timer); load(); }, 60000);
}
