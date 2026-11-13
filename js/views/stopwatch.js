// 스톱워치: 검은 전체 화면. 시작 시각을 서버에 저장 → 앱을 닫아도 계속 흐름
import { $, $$, esc, toast } from '../ui.js';
import { SUBJECTS } from '../data/students.js';
import { loadSessions, elapsedSec, startSession, pauseSession, resumeSession, stopSession, needsCheck, isStale, sinceCheck, confirmSession, autoEnd, CHECK_SEC, GRACE_SEC } from '../data/student.js';

const pad = (n) => String(n).padStart(2, '0');
export const clock = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
const dur = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };

export async function openStopwatch(student, { planSubjects = [], onChange } = {}) {
  const el = document.createElement('div');
  el.className = 'sw';
  el.innerHTML = '<div class="sw-in"><p class="sw-load">불러오는 중</p></div>';
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.classList.add('open'));
  try { await el.requestFullscreen?.(); } catch {}

  let s = null, doneSec = 0, subject = planSubjects[0] || '수학', busy = false, timer = null;
  try { ({ active: s, doneSec } = await loadSessions(student.id)); if (s) subject = s.subject; }
  catch (e) { el.querySelector('.sw-in').innerHTML = `<p class="sw-load">불러오기 실패: ${esc(e.message)}</p>`; }

  const close = () => {
    clearInterval(timer);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    el.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => el.remove(), 250);
    onChange?.();
  };

  const subjects = [...new Set([...planSubjects, ...SUBJECTS])];
  function draw() {
    const run = !!s, paused = !!s?.paused_at;
    el.innerHTML = `<div class="sw-in">
      <div class="sw-top">
        <span class="sw-today">오늘 순공 <b id="sw-total">${dur(doneSec + elapsedSec(s))}</b></span>
        <button type="button" class="sw-x" id="sw-x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="sw-mid">
        <p class="sw-state ${run ? (paused ? 'paused' : 'on') : ''}">${run ? (paused ? '일시정지' : `${esc(subject)} 공부 중`) : '과목을 고르고 시작하세요'}</p>
        <div class="sw-time" id="sw-time">${clock(elapsedSec(s))}</div>
        <div class="sw-subs">${subjects.map((x) => `<button type="button" data-sub="${esc(x)}" class="${x === subject ? 'on' : ''}"${run ? ' disabled' : ''}>${esc(x)}</button>`).join('')}</div>
      </div>
      <div class="sw-btns">
        ${run ? `<button type="button" class="sw-b ghost" id="sw-pause">${paused ? '계속' : '일시정지'}</button>
                 <button type="button" class="sw-b stop" id="sw-stop">종료</button>`
              : '<button type="button" class="sw-b go" id="sw-go">시작</button>'}
      </div>
    </div>`;
    el.classList.toggle('running', run && !paused);
  }
  const tick = () => {
    const t = $('#sw-time', el); if (t) t.textContent = clock(elapsedSec(s));
    const tt = $('#sw-total', el); if (tt) tt.textContent = dur(doneSec + elapsedSec(s));
    checkTick();
  };
  // 2시간 확인 팝업 (10분 안에 응답 없으면 2시간만 기록하고 종료)
  function checkTick() {
    const box = $('#sw-check', el);
    if (!s || s.paused_at || !needsCheck(s)) { box?.remove(); return; }
    if (isStale(s)) {
      box?.remove();
      act(async () => { const done = await autoEnd(s); doneSec += done.net_seconds || 0; s = null; toast('응답이 없어 2시간까지만 기록되었습니다'); });
      return;
    }
    const left = CHECK_SEC + GRACE_SEC - sinceCheck(s);
    const msg = `${pad(Math.floor(left / 60))}:${pad(left % 60)} 안에 응답이 없으면 2시간까지만 기록하고 종료합니다.`;
    if (box) { $('#sw-check-t', box).textContent = msg; return; }
    el.insertAdjacentHTML('beforeend', `<div class="sw-check" id="sw-check"><div class="sw-check-in">
      <h3>계속 공부 중인가요?</h3><p id="sw-check-t">${msg}</p>
      <div class="sw-check-b"><button type="button" class="sw-b stop" id="sw-stop">종료</button><button type="button" class="sw-b go" id="sw-ok">계속</button></div>
    </div></div>`);
  }
  draw();
  timer = setInterval(tick, 1000);

  const act = async (fn) => {
    if (busy) return; busy = true;
    try { await fn(); } catch (e) { toast('저장 실패: ' + e.message); }
    busy = false; draw();
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'sw-x') return close();
    if (b.id === 'sw-ok') { $('#sw-check', el)?.remove(); return act(async () => { s = await confirmSession(s); }); }
    if (b.dataset.sub && !s) { subject = b.dataset.sub; return draw(); }
    if (b.id === 'sw-go') return act(async () => { s = await startSession(student.id, subject); });
    if (b.id === 'sw-pause') return act(async () => { s = s.paused_at ? await resumeSession(s) : await pauseSession(s); });
    if (b.id === 'sw-stop') return $('#sw-check', el)?.remove(), act(async () => { const done = await stopSession(s); doneSec += done.net_seconds || 0; s = null; toast(`${dur(done.net_seconds || 0)} 기록되었습니다`); });
  });
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape' && el.isConnected) { document.removeEventListener('keydown', onKey); close(); } });
}
