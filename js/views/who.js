// 넷플릭스식 고르기 — 학생 선택 / 자녀 선택(번호가 겹칠 때만)
import { mount, $, $$, esc } from '../ui.js';

// items: [{ id, initial, label, sub }]
export function renderWho({ title, items, onPick, onLogout }) {
  const tiles = items.map((it, i) => `
    <button type="button" class="profile" data-pick="${esc(it.id)}">
      <span class="avatar av${i % 3}" aria-hidden="true">${esc(it.initial)}</span>
      <b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
    </button>`).join('');

  mount(`
    <main class="who">
      <h1>${esc(title)}</h1>
      ${items.length ? '' : '<p class="desc">등록된 학생이 없습니다.</p>'}
      <div class="profiles">${tiles}</div>
      <button type="button" class="link" id="out">처음으로</button>
    </main>`);

  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.pick)));
  $('#out').addEventListener('click', onLogout);
}
