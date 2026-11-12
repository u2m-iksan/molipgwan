// 작은 화면 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// #app 내용 교체 (+ 살짝 떠오르는 등장)
export function mount(html) {
  const app = document.getElementById('app');
  app.innerHTML = html;
  app.firstElementChild?.classList.add('enter');
  return app;
}

export const BRAND = '<div class="brand"><b>U2M</b><span>몰입관</span></div>';

export const ICON = {
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.5H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8.5L3 12z"/><path d="M11.5 9.5l5 5m0-5l-5 5"/></svg>',
  parent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.4c2.3-.4 4.3 1 4.9 3.6"/></svg>',
};
