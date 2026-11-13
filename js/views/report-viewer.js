// 보고서 자세히 보기 — PDF 보듯이: 화면 전체 새 창, 자유롭게 확대·축소·스크롤
//  · 처음엔 폭에 맞춤  · − / + / 맞춤 버튼  · 두 손가락 벌리기·오므리기  · Ctrl(⌘)+휠
//  · 폰 뒤로가기 / Esc / X 로 닫기  · PC는 [새 탭]으로 브라우저 창에 따로 열기
import { esc, X, toast } from '../ui.js';
import { reportCard, A4_W } from './report-card.js';

const MIN = 0.3, MAX = 3;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

export function openReportViewer(r, student, title = '') {
  const name = title || `${student.name} 학생 보고서`;
  const wide = matchMedia('(pointer:fine)').matches && innerWidth > 900;
  const v = document.createElement('div');
  v.className = 'rvw';
  v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', name);
  v.innerHTML = `
    <header class="rvw-bar">
      <button type="button" class="rvw-x" aria-label="닫기">${X}</button>
      <b>${esc(name)}</b>
      <div class="rvw-tools">
        <button type="button" data-z="-" aria-label="축소">−</button>
        <span class="rvw-pct" aria-live="polite">100%</span>
        <button type="button" data-z="+" aria-label="확대">+</button>
        <button type="button" data-z="fit" class="rvw-fit">맞춤</button>
        ${wide ? '<button type="button" class="rvw-fit" data-new>새 탭</button>' : ''}
      </div>
    </header>
    <div class="rvw-scroll"><div class="rvw-sizer"><div class="rvw-page wr-scale">${reportCard(r, student)}</div></div></div>`;
  document.body.appendChild(v);
  document.documentElement.classList.add('rvw-lock');

  const scroll = v.querySelector('.rvw-scroll'), sizer = v.querySelector('.rvw-sizer'), page = v.querySelector('.rvw-page'), pct = v.querySelector('.rvw-pct');
  const PAD = 16;
  let s = 1, fitS = 1;
  const H = () => page.offsetHeight;
  function apply(next, fx, fy) {
    // fx, fy: 화면(스크롤 상자) 안의 기준점 → 확대 후에도 같은 자리에 오게
    const rect = scroll.getBoundingClientRect();
    const px = fx ?? rect.width / 2, py = fy ?? 0;
    const cx = (scroll.scrollLeft + px - PAD) / s, cy = (scroll.scrollTop + py - PAD) / s;
    s = clamp(next);
    page.style.transform = `scale(${s})`;
    const w = A4_W * s, h = H() * s;
    sizer.style.width = `${w + PAD * 2}px`; sizer.style.height = `${h + PAD * 2}px`;
    // 화면보다 작으면 가운데
    sizer.style.marginLeft = w + PAD * 2 < scroll.clientWidth ? `${(scroll.clientWidth - w - PAD * 2) / 2}px` : '0';
    scroll.scrollLeft = cx * s + PAD - px; scroll.scrollTop = cy * s + PAD - py;
    pct.textContent = `${Math.round(s * 100)}%`;
  }
  const fit = () => { fitS = clamp((scroll.clientWidth - PAD * 2) / A4_W); apply(fitS); scroll.scrollTop = 0; scroll.scrollLeft = 0; };
  requestAnimationFrame(() => { fit(); v.classList.add('open'); });
  const ro = new ResizeObserver(() => { if (Math.abs(s - fitS) < 0.001) fit(); });
  ro.observe(scroll);

  v.querySelector('.rvw-tools').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.new != null) return openTab(r, student, name);
    const z = b.dataset.z;
    if (z === 'fit') return fit();
    apply(z === '+' ? s * 1.25 : s / 1.25);
  });
  // Ctrl/⌘ + 휠 (트랙패드 핀치 포함)
  scroll.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = scroll.getBoundingClientRect();
    apply(s * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  // 두 손가락 확대/축소
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    const rect = scroll.getBoundingClientRect();
    pinch = { d: dist(e.touches), s, x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top };
  }, { passive: true });
  scroll.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    apply(pinch.s * (dist(e.touches) / pinch.d), pinch.x, pinch.y);
  }, { passive: false });
  scroll.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
  // 두 번 탭: 맞춤 ↔ 2배
  let lastTap = 0;
  scroll.addEventListener('touchend', (e) => {
    if (e.touches.length || e.changedTouches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap < 280) {
      const rect = scroll.getBoundingClientRect(), t = e.changedTouches[0];
      if (s > fitS * 1.2) fit(); else apply(fitS * 2, t.clientX - rect.left, t.clientY - rect.top);
      lastTap = 0;
    } else lastTap = now;
  });

  // 닫기: X · Esc · 폰 뒤로가기
  let closed = false;
  function close(fromPop) {
    if (closed) return; closed = true;
    ro.disconnect(); removeEventListener('keydown', onKey); removeEventListener('popstate', onPop);
    if (!fromPop && history.state?.rvw) history.back();
    v.classList.remove('open');
    setTimeout(() => { v.remove(); if (!document.querySelector('.rvw')) document.documentElement.classList.remove('rvw-lock'); }, 260);
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); apply(s * 1.25); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); apply(s / 1.25); }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); fit(); }
  };
  const onPop = () => close(true);
  history.pushState({ ...(history.state || {}), rvw: 1 }, '');
  addEventListener('keydown', onKey); addEventListener('popstate', onPop);
  v.querySelector('.rvw-x').addEventListener('click', () => close());
  return { close };
}

// PC: 브라우저 새 탭에 보고서만 (브라우저 확대·인쇄·PDF 저장 그대로 사용)
function openTab(r, student, name) {
  const base = new URL('.', location.href).href;
  const css = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => `<link rel="stylesheet" href="${new URL(l.getAttribute('href'), base).href}">`).join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=${A4_W + 32}">
    <title>${esc(name)}</title>${css}
    <style>html,body{background:#E9ECEF!important}body{margin:0;padding:24px 0}.rvw-page{position:static!important;width:${A4_W}px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08);border-radius:4px;overflow:hidden}@media print{body{padding:0;background:#fff!important}.rvw-page{box-shadow:none}}</style></head>
    <body><div class="rvw-page wr-scale">${reportCard(r, student)}</div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!w) toast('팝업이 막혀 새 탭을 열 수 없습니다');
}
