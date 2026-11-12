// 로그인 후 첫 화면 — 지금은 자리만 잡아둠 (5~7단계에서 채움)
import { mount, $, esc, BRAND } from '../ui.js';

function topbar(label) {
  return `
    <header class="top"><div class="top-in">
      ${BRAND}
      <div class="spacer"></div>
      <span class="chip">${esc(label)}</span>
      <button type="button" class="chip muted" id="lo">로그아웃</button>
    </div></header>`;
}

export function renderTeacherHome({ me, onLogout }) {
  mount(`<div>${topbar(me.name + ' 선생님')}
    <main class="page"><div class="card empty"><b>선생님 화면</b>로그인 성공! 다음 단계에서 학생 등록·계획·현황 화면을 만들어요.</div></main></div>`);
  $('#lo').addEventListener('click', onLogout);
}

export function renderStudentHome({ student, onLogout }) {
  mount(`<div>${topbar(student.name)}
    <main class="page"><div class="card empty"><b>${esc(student.name)} · 오늘</b>로그인 성공! 오늘 할 일·스톱워치 화면은 6단계에서 만들어요.</div></main></div>`);
  $('#lo').addEventListener('click', onLogout);
}

export function renderParentHome({ students, onLogout }) {
  const names = students.map((s) => esc(s.name)).join(', ');
  mount(`<div>${topbar('학부모')}
    <main class="page"><div class="card empty"><b>학부모 · 주간 보고</b>${names || '자녀 정보 없음'} — 7단계에서 만들어요.</div></main></div>`);
  $('#lo').addEventListener('click', onLogout);
}

export function renderUnknown({ onLogout }) {
  mount(`<main class="auth"><div class="auth-card" style="text-align:center">${BRAND}
    <h1 style="margin-top:4px">등록되지 않은 계정</h1>
    <p class="desc">로그인은 됐지만 선생님 또는 가족으로 등록되어 있지 않아요.</p>
    <button class="btn btn-gray btn-block" id="lo" style="margin-top:20px">로그아웃</button></div></main>`);
  $('#lo').addEventListener('click', onLogout);
}
