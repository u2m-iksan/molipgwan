// 넷플릭스식 고르기 — 학생: "누구세요?" / 학부모: "누구의 학부모세요?" (번호가 겹칠 때만)
import { mount, $, $$, esc } from '../ui.js';

// items: [{ id, initial, label, sub }]
export function renderWho({ title, desc, items, onPick, onLogout }) {
  const tiles = items.map((it, i) => `
    <button type="button" class="profile" data-pick="${esc(it.id)}">
      <span class="avatar av${i % 3}" aria-hidden="true">${esc(it.initial)}</span>
      <b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
    </button>`).join('');

  mount(`
    <main class="who">
      <h1>${esc(title)}</h1>
      <p class="desc">${esc(items.length ? desc : '등록된 학생이 없어요. 선생님께 알려주세요.')}</p>
      <div class="profiles">${tiles}</div>
      <button type="button" class="link" id="out">← 처음으로</button>
    </main>`);

  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.pick)));
  $('#out').addEventListener('click', onLogout);
}
