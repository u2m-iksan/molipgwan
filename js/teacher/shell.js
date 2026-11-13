// 선생님 화면 틀: 상단바(메뉴) + 본문. 메뉴는 주소 #/xxx 로 이동.
import { mount, $, $$, esc, BRAND } from '../ui.js';
import { renderCoaching } from './coaching.js';
import { renderConsultPage } from './consult-page.js';
import { openBoard } from './board.js';
import { openLive } from './live.js';
import { renderExams } from './exams.js';
import { renderOverview } from './overview.js';
import { renderSettings } from './settings.js';
import { renderPlans } from './plans.js';
import { renderReports } from './reports.js';
import { renderChat } from './chat.js';
import { countTeacherUnread } from '../data/chat.js';

const TABS = [
  { id: 'overview', label: '전체 현황' },
  { id: 'plans', label: '주간 계획' },
  { id: 'coaching', label: '코칭' },
  { id: 'exams', label: '성적' },
  { id: 'reports', label: '학부모 보고' },
  { id: 'chat', label: '학습 문의' },
  { id: 'settings', label: '설정' },
];
const READY = { students: renderOverview, coaching: renderCoaching, consult: renderConsultPage, exams: renderExams, overview: renderOverview, settings: renderSettings, plans: renderPlans, reports: renderReports, chat: renderChat };
const PARENT = { consult: 'coaching', students: 'overview' };   // 하위 화면 → 메뉴 강조
const DEFAULT_TAB = 'overview';

export function renderTeacher({ me, onLogout }) {
  const current = () => {
    const id = location.hash.replace(/^#\//, '').split('?')[0];
    return TABS.some((t) => t.id === id) || READY[id] ? id : DEFAULT_TAB;
  };

  mount(`
    <div class="t-app">
      <header class="top"><div class="top-in">
        ${BRAND}
        <nav class="t-nav" aria-label="선생님 메뉴">
          ${TABS.map((t) => `<a href="#/${t.id}" class="t-tab" data-tab="${t.id}">${t.label}</a>`).join('')}
        </nav>
        <div class="spacer"></div>
        <button type="button" class="t-board" id="board" aria-label="전자칠판" title="전자칠판"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/></svg></button>
        <button type="button" class="t-board" id="live" aria-label="현황판" title="현황판"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg></button>
        <span class="chip t-me">${esc(me.name)} 선생님</span>
        <button type="button" class="chip muted" id="lo">로그아웃</button>
      </div></header>
      <main class="page" id="t-body"></main>
    </div>`);

  $('#board').addEventListener('click', () => openBoard());
  $('#live').addEventListener('click', () => openLive());
  $('#lo').addEventListener('click', () => { window.removeEventListener('hashchange', show); onLogout(); });

  function show() {
    const tab = current();
    $$('.t-tab').forEach((a) => a.classList.toggle('on', a.dataset.tab === (PARENT[tab] || tab)));
    document.body.classList.toggle('has-foot', tab === 'consult');
    const body = $('#t-body');
    if (!body) return;
    body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    const view = READY[tab];
    body.classList.remove('ch-open');
    if (view) view(body, { me, onUnread: paintUnread });
    else body.innerHTML = `<div class="card empty"><b>${esc(TABS.find((t) => t.id === tab).label)}</b>준비 중입니다.</div>`;
  }

  // 학습 문의 안 읽은 수 (메뉴 옆 빨간 숫자, 30초마다)
  async function paintUnread() {
    const a = document.querySelector('.t-tab[data-tab="chat"]'); if (!a) return;
    let n = 0; try { n = await countTeacherUnread(); } catch { return; }
    a.innerHTML = `학습 문의${n ? `<i class="pa-n">${n > 99 ? '99+' : n}</i>` : ''}`;
  }
  const ut = setInterval(() => { if (!document.querySelector('.t-app')) return clearInterval(ut); paintUnread(); }, 30000);
  paintUnread();

  window.addEventListener('hashchange', show);
  show();
}
