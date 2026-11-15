// 학교 고르기: 학사일정 앱에서 불러온 학교 + 직접 추가한 학교에서 검색 · 선택, 없으면 새로 추가
//  input 하나에 붙여 씀. 값은 짧은 이름(익산고) — 학사일정 앱의 정식 이름(익산고등학교)으로도 검색됨
import { esc } from '../ui.js';
import { schoolList, schoolKey } from '../data/school-sync.js';

export function mountSchoolPicker(input) {
  let list = [], open = false, idx = -1;
  const wrap = input.closest('.input');
  wrap.classList.add('sp-wrap');
  const box = document.createElement('div');
  box.className = 'sp-box'; box.hidden = true; box.setAttribute('role', 'listbox');
  wrap.append(box);
  schoolList().then((l) => { list = l; if (open) draw(); }).catch(() => {});

  const matches = () => {
    const q = input.value.trim().replace(/\s+/g, '');
    const hit = q ? list.filter((s) => s.k.includes(q) || s.n.replace(/\s+/g, '').includes(q)) : list;
    return hit.slice(0, 30);
  };
  function draw() {
    const q = input.value.trim(), hit = matches();
    const exact = q && list.some((s) => s.k === schoolKey(q));
    const add = q && !exact ? `<button type="button" class="sp-opt sp-add" data-v="${esc(schoolKey(q))}"><b>+ '${esc(schoolKey(q))}' 새 학교로 추가</b><small>학사일정은 설정에서 따로 입력</small></button>` : '';
    box.innerHTML = hit.map((s, i) => `<button type="button" class="sp-opt${i === idx ? ' on' : ''}" data-v="${esc(s.k)}" role="option">
        <b>${esc(s.k)}</b><small>${s.auto ? esc(s.n) : '직접 추가'}</small>${s.auto ? '<i>학사일정</i>' : ''}</button>`).join('')
      + add + (!hit.length && !add ? `<p class="sp-none">${list.length ? '검색 결과 없음' : '학교 목록이 없어요 · 설정 → 학사일정 가져오기'}</p>` : '');
    box.hidden = false;
  }
  const show = () => { open = true; idx = -1; draw(); };
  const hide = () => { open = false; box.hidden = true; };
  const pick = (v) => { input.value = v; hide(); input.dispatchEvent(new Event('change', { bubbles: true })); };

  input.addEventListener('focus', show);
  input.addEventListener('input', () => { idx = -1; show(); });
  input.addEventListener('blur', () => setTimeout(hide, 150));
  input.addEventListener('keydown', (e) => {
    if (!open) return;
    const opts = [...box.querySelectorAll('.sp-opt')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('on', i === idx)); opts[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && idx >= 0 && opts[idx]) { e.preventDefault(); pick(opts[idx].dataset.v); }
    else if (e.key === 'Escape') hide();
  });
  box.addEventListener('mousedown', (e) => e.preventDefault());   // 고르기 전에 blur 로 닫히지 않게
  box.addEventListener('click', (e) => { const b = e.target.closest('.sp-opt'); if (b) pick(b.dataset.v); });
}
