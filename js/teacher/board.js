// 전자칠판 (다크 전체 화면): 시계 · 지금 시간대 · 오늘 코칭 순서 · 등원 코드(07시부터 1시간마다 바뀜)
import { $, esc } from '../ui.js';
import { sb } from '../sb.js';
import { DOW, today, isoDow, hm, toMin } from '../date.js';
import { loadStudents } from '../data/students.js';
import { loadCoachingSlots } from '../data/schedules.js';

const pad = (n) => String(n).padStart(2, '0');
const kst = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); return d; };

export async function openBoard() {
  const el = document.createElement('div');
  el.className = 'bd';
  el.innerHTML = `<div class="bd-in">
    <div class="bd-top"><span class="bd-logo">U2M</span><button type="button" class="bd-x" id="bd-x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="bd-clock"><div class="bd-time" id="bd-time"></div><p class="bd-date" id="bd-date"></p></div>
    <section class="bd-card bd-now"><div class="bd-now-h"><b id="bd-slot"></b><span id="bd-range"></span></div>
      <div class="bd-bar"><i id="bd-fill"></i></div><p class="bd-left" id="bd-left"></p></section>
    <div class="bd-row">
      <section class="bd-card"><h4>오늘 코칭 순서</h4><ul class="bd-coach" id="bd-coach"><li class="bd-muted">불러오는 중</li></ul></section>
      <section class="bd-card bd-code"><h4>등원 코드</h4><div class="bd-digits" id="bd-code">----</div><p class="bd-muted" id="bd-code-s"></p></section>
    </div></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.classList.add('open'));
  try { await el.requestFullscreen?.(); } catch {}

  let code = null, codeHour = -1, alive = true;
  const close = () => {
    alive = false; clearInterval(t);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    el.classList.remove('open'); document.body.style.overflow = '';
    setTimeout(() => el.remove(), 250);
  };
  $('#bd-x', el).addEventListener('click', close);
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', k); if (alive) close(); } });

  async function refreshCode(h) {
    codeHour = h;
    if (h < 7) { code = null; return; }
    try { const { data, error } = await sb.rpc('current_checkin_code'); if (error) throw error; code = data; }
    catch { code = null; }
  }

  function tick() {
    const n = kst(), h = n.getHours(), m = n.getMinutes(), s = n.getSeconds();
    $('#bd-time', el).textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    $('#bd-date', el).textContent = `${n.getFullYear()}년 ${n.getMonth() + 1}월 ${n.getDate()}일 (${DOW[isoDow(today())]})`;
    // 지금 시간대 (정시 단위)
    $('#bd-slot', el).textContent = `${h}시`;
    $('#bd-range', el).textContent = `${pad(h)}:00 – ${pad((h + 1) % 24)}:00`;
    const used = m * 60 + s, left = 3600 - used;
    $('#bd-fill', el).style.width = `${(used / 3600) * 100}%`;
    $('#bd-left', el).textContent = `남은 시간 ${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    // 등원 코드 (정시마다 갱신)
    if (h !== codeHour) refreshCode(h).then(paintCode);
  }
  function paintCode() {
    const h = kst().getHours();
    $('#bd-code', el).textContent = code || '----';
    $('#bd-code-s', el).textContent = h < 7 ? '07:00부터 표시됩니다' : code ? `${pad((h + 1) % 24)}:00에 바뀝니다` : '코드를 불러오지 못했습니다';
  }

  // 오늘 코칭 순서
  try {
    const [students, slots] = await Promise.all([loadStudents(), loadCoachingSlots()]);
    const d = isoDow(today());
    const list = students.filter((x) => x.status === '재원' && slots.get(x.id)?.weekday === d)
      .map((x) => ({ s: x, slot: slots.get(x.id) })).sort((a, b) => toMin(a.slot.start_time) - toMin(b.slot.start_time));
    const nowMin = kst().getHours() * 60 + kst().getMinutes();
    $('#bd-coach', el).innerHTML = list.length ? list.map(({ s, slot }) => {
      const st = toMin(slot.start_time), en = toMin(slot.end_time);
      const cls = nowMin >= en ? 'done' : nowMin >= st ? 'now' : '';
      return `<li class="${cls}"><span>${hm(slot.start_time)}</span><b>${esc(s.name)}</b>${cls === 'now' ? '<em>상담 중</em>' : ''}</li>`;
    }).join('') : '<li class="bd-muted">오늘 코칭이 없습니다.</li>';
  } catch { $('#bd-coach', el).innerHTML = '<li class="bd-muted">불러오기 실패</li>'; }

  tick();
  const t = setInterval(tick, 1000);
}
