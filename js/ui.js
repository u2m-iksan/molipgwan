// 작은 화면 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// #app 내용 교체 — 이전 화면은 뒤에서 사라지고(교차 페이드), 새 화면은 순서대로 떠오름
export function mount(html) {
  const app = document.getElementById('app');
  const old = app.firstElementChild;
  if (old && !old.classList.contains('splash') && !reducedMotion()) {
    const y = window.scrollY;
    old.classList.remove('enter');
    old.removeAttribute('id');
    old.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));  // 새 화면과 id 충돌 방지
    Object.assign(old.style, { position: 'fixed', left: '0', right: '0', top: `${-y}px`, zIndex: '0', pointerEvents: 'none' });
    old.classList.add('leave');
    document.body.appendChild(old);
    setTimeout(() => old.remove(), 160);
  }
  app.innerHTML = html;
  window.scrollTo(0, 0);
  app.firstElementChild?.classList.add('enter');
  return app;
}

// 짧게 클래스 붙였다 떼기 (누름 효과 등)
export function flash(el, cls, ms = 120) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const BRAND = '<div class="brand"><b>U2M</b><span>몰입관</span></div>';

export const ICON = {
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.5H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8.5L3 12z"/><path d="M11.5 9.5l5 5m0-5l-5 5"/></svg>',
  student: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z"/><path d="M11 19h2"/></svg>',
  teacher: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="11" rx="1.5"/><path d="M8 20l2.5-5M16 20l-2.5-5M8 8.5h5M8 11h8"/></svg>',
  parent:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.4c2.3-.4 4.3 1 4.9 3.6"/></svg>',
};

// 화면 아래 잠깐 뜨는 알림
export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

/* ---------- 패널(오른쪽) · 모달(가운데) 공통 ---------- */
export const X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export function sheet(inner, where = 'right') {
  const wrap = document.createElement('div');
  wrap.className = `overlay overlay-${where}`;
  wrap.innerHTML = `<div class="scrim" data-close></div>${inner}`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => wrap.classList.add('open'));
  const onKey = (e) => { if (e.key === 'Escape') wrap.close(); };
  wrap.close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    setTimeout(() => wrap.remove(), 250);
  };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) wrap.close(); });
  document.addEventListener('keydown', onKey);
  return wrap;
}
