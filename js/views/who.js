// "누구세요?" — 자녀 프로필 + 학부모
import { mount, $, $$, esc, ICON } from '../ui.js';

export function renderWho({ students, onPick, onLogout }) {
  const tiles = students.map((s, i) => `
    <button type="button" class="profile" data-pick="${esc(s.id)}">
      <span class="avatar av${i % 3}" aria-hidden="true">${esc(s.name.slice(-1))}</span>
      <b>${esc(s.name)}</b><small>${esc(s.grade)}</small>
    </button>`).join('');

  mount(`
    <main class="who">
      <h1>누구세요?</h1>
      <p class="desc">${students.length ? '이름을 눌러 들어가세요' : '등록된 학생이 없어요. 선생님께 알려주세요.'}</p>
      <div class="profiles">
        ${tiles}
        <button type="button" class="profile" data-pick="parent">
          <span class="avatar avp">${ICON.parent}</span>
          <b>학부모</b><small>${students.length > 1 ? '자녀 모두 보기' : '보고서 보기'}</small>
        </button>
      </div>
      <label class="remember"><input type="checkbox" id="remember" checked> 이 기기에서 기억하기</label>
      <div style="margin-top:20px"><button type="button" class="link" id="out">다른 번호로 로그인</button></div>
    </main>`);

  $$('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => onPick(b.dataset.pick, $('#remember').checked)));
  $('#out').addEventListener('click', onLogout);
}
