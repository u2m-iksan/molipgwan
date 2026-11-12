// 선생님 화면 틀: 상단바(메뉴) + 본문. 메뉴는 주소 #/xxx 로 이동.
import { mount, $, $$, esc, BRAND } from '../ui.js';
import { renderStudents } from './students.js';
import { renderCoaching } from './coaching.js';

const TABS = [
  { id: 'overview', label: '전체 현황' },
  { id: 'students', label: '학생 관리' },
  { id: 'plans', label: '주간 계획' },
  { id: 'coaching', label: '코칭' },
  { id: 'exams', label: '성적' },
  { id: 'reports', label: '학부모 보고' },
];
const READY = { students: renderStudents, coaching: renderCoaching };
const DEFAULT_TAB = 'students';

export function renderTeacher({ me, onLogout }) {
  const current = () => {
    const id = location.hash.replace(/^#\//, '').split('?')[0];
    return TABS.some((t) => t.id === id) ? id : DEFAULT_TAB;
  };

  mount(`
    <div class="t-app">
      <header class="top"><div class="top-in">
        ${BRAND}
        <nav class="t-nav" aria-label="선생님 메뉴">
          ${TABS.map((t) => `<a href="#/${t.id}" class="t-tab" data-tab="${t.id}">${t.label}</a>`).join('')}
        </nav>
        <div class="spacer"></div>
        <span class="chip">${esc(me.name)} 선생님</span>
        <button type="button" class="chip muted" id="lo">로그아웃</button>
      </div></header>
      <main class="page" id="t-body"></main>
    </div>`);

  $('#lo').addEventListener('click', () => { window.removeEventListener('hashchange', show); onLogout(); });

  function show() {
    const tab = current();
    $$('.t-tab').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    const body = $('#t-body');
    if (!body) return;
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    const view = READY[tab];
    if (view) view(body, { me });
    else body.innerHTML = `<div class="card empty"><b>${esc(TABS.find((t) => t.id === tab).label)}</b>준비 중입니다.</div>`;
  }

  window.addEventListener('hashchange', show);
  show();
}
