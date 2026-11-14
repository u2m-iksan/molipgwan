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
  let s = 1, fitS = 1, m = 0;          // m = 화면보다 작을 때 가운데 정렬용 왼쪽 여백
  const H = () => page.offsetHeight;
  // 화면 좌표(스크롤 상자 기준) ↔ 보고서 원본 좌표
  const toContent = (px, py) => ({ x: (scroll.scrollLeft + px - PAD - m) / s, y: (scroll.scrollTop + py - PAD) / s });
  function layout(next) {
    s = clamp(next);
    page.style.transform = `scale(${s})`;
    const w = A4_W * s, h = H() * s;
    sizer.style.width = `${w + PAD * 2}px`; sizer.style.height = `${h + PAD * 2}px`;
    m = w + PAD * 2 < scroll.clientWidth ? (scroll.clientWidth - w - PAD * 2) / 2 : 0;
    sizer.style.marginLeft = `${m}px`;
    pct.textContent = `${Math.round(s * 100)}%`;
  }
  // 보고서의 점 c 가 화면의 (px, py) 에 오도록 확대 + 스크롤 (가운데 정렬 여백까지 계산해 튀지 않음)
  function zoomAt(next, c, px, py) {
    layout(next);
    scroll.scrollLeft = c.x * s + PAD + m - px;
    scroll.scrollTop = c.y * s + PAD - py;
  }
  function apply(next, fx, fy) {
    const rect = scroll.getBoundingClientRect();
    const px = fx ?? rect.width / 2, py = fy ?? 0;
    zoomAt(next, toContent(px, py), px, py);
  }
  const fit = () => { fitS = clamp((scroll.clientWidth - PAD * 2) / A4_W); layout(fitS); scroll.scrollTop = 0; scroll.scrollLeft = 0; };
  requestAnimationFrame(() => { fit(); v.classList.add('open'); });
  const ro = new ResizeObserver(() => { if (Math.abs(s - fitS) < 0.001) fit(); });
  ro.observe(scroll);

  // 버튼 확대·축소는 부드럽게 (0.18초 동안 나눠서)
  let anim = 0;
  function smoothTo(target, fx, fy) {
    cancelAnimationFrame(anim);
    const rect = scroll.getBoundingClientRect();
    const px = fx ?? rect.width / 2, py = fy ?? rect.height / 2;
    const c = toContent(px, py), s0 = s, s1 = clamp(target), t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 180), e = 1 - Math.pow(1 - k, 3);
      zoomAt(s0 + (s1 - s0) * e, c, px, py);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  v.querySelector('.rvw-tools').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.new != null) return openTab(r, student, name);
    const z = b.dataset.z;
    if (z === 'fit') { cancelAnimationFrame(anim); return fit(); }
    smoothTo(z === '+' ? s * 1.25 : s / 1.25);
  });
  // Ctrl/⌘ + 휠 (트랙패드 핀치 포함) — 한 번에 너무 크게 안 튀게 제한 + 프레임마다 한 번만
  let wheelQ = null;
  scroll.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    const rect = scroll.getBoundingClientRect(), d = Math.max(-40, Math.min(40, e.deltaY));
    if (!wheelQ) {
      wheelQ = { k: 1, px: e.clientX - rect.left, py: e.clientY - rect.top };
      requestAnimationFrame(() => { const q = wheelQ; wheelQ = null; apply(s * q.k, q.px, q.py); });
    }
    wheelQ.k *= Math.exp(-d * 0.01);
  }, { passive: false });

  // 두 손가락: 시작할 때 손가락 사이 보고서 지점을 기억 → 손가락이 움직여도 그 지점이 손가락 사이에 그대로 (확대+이동 같이)
  let pinch = null, pinchEnd = 0, raf = 0, pend = null;
  const mid = (t, rect) => ({ x: (t[0].clientX + t[1].clientX) / 2 - rect.left, y: (t[0].clientY + t[1].clientY) / 2 - rect.top });
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    cancelAnimationFrame(anim);
    const rect = scroll.getBoundingClientRect(), p0 = mid(e.touches, rect);
    pinch = { d: Math.max(10, dist(e.touches)), s, c: toContent(p0.x, p0.y) };
  }, { passive: true });
  scroll.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const rect = scroll.getBoundingClientRect(), p = mid(e.touches, rect);
    pend = { s: pinch.s * (dist(e.touches) / pinch.d), x: p.x, y: p.y };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pend && pinch) zoomAt(pend.s, pinch.c, pend.x, pend.y); });
  }, { passive: false });
  scroll.addEventListener('touchend', (e) => {
    if (pinch && e.touches.length < 2) { pinch = null; pinchEnd = Date.now(); }
  });

  // 두 번 탭: 맞춤 ↔ 2배 (한 손가락 · 거의 안 움직인 탭만 · 두 손가락 확대 직후는 무시 → 튕김 방지)
  let lastTap = 0, tapStart = null;
  scroll.addEventListener('touchstart', (e) => {
    tapStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true });
  scroll.addEventListener('touchend', (e) => {
    if (e.touches.length || e.changedTouches.length !== 1 || !tapStart) return;
    const t = e.changedTouches[0], now = Date.now();
    const moved = Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10 || now - tapStart.t > 250;
    tapStart = null;
    if (moved || now - pinchEnd < 400) { lastTap = 0; return; }
    if (now - lastTap < 300) {
      const rect = scroll.getBoundingClientRect();
      if (s > fitS * 1.2) { cancelAnimationFrame(anim); fit(); } else smoothTo(fitS * 2, t.clientX - rect.left, t.clientY - rect.top);
      lastTap = 0;
    } else lastTap = now;
  });

  // 닫기: X · Esc · 폰 뒤로가기
  let closed = false;
  function close(fromPop) {
    if (closed) return; closed = true;
    ro.disconnect(); cancelAnimationFrame(anim); removeEventListener('keydown', onKey); removeEventListener('popstate', onPop);
    if (!fromPop && history.state?.rvw) history.back();
    v.classList.remove('open');
    setTimeout(() => { v.remove(); if (!document.querySelector('.rvw')) document.documentElement.classList.remove('rvw-lock'); }, 260);
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); smoothTo(s * 1.25); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); smoothTo(s / 1.25); }
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
