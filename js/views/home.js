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

export function renderStudentHome({ student, onLogout }) {
  mount(`<div>${topbar(student.name)}
    <main class="page"><div class="card empty"><b>${esc(student.name)}</b>준비 중입니다.</div></main></div>`);
  $('#lo').addEventListener('click', onLogout);
}

export function renderParentHome({ students, onLogout }) {
  const names = students.map((s) => esc(s.name)).join(', ');
  mount(`<div>${topbar('학부모')}
    <main class="page"><div class="card empty"><b>학부모</b>${names || '자녀 정보 없음'} · 준비 중입니다.</div></main></div>`);
  $('#lo').addEventListener('click', onLogout);
}

export function renderUnknown({ onLogout }) {
  mount(`<main class="auth"><div class="auth-card" style="text-align:center">${BRAND}
    <h1 style="margin-top:4px">등록되지 않은 계정입니다</h1>
    <button class="btn btn-gray btn-block" id="lo" style="margin-top:20px">로그아웃</button></div></main>`);
  $('#lo').addEventListener('click', onLogout);
}
