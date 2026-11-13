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

// 화면 아래 잠깐 뜨는 알림 — 성공 · 실패는 문구로 알아서 아이콘 (type으로 직접 지정 가능)
const T_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const T_BAD = '<svg viewBox="0 0 24 24"><path d="M12 6v7M12 17.5v.5"/></svg>';
export function toast(msg, type) {
  document.querySelectorAll('.toast').forEach((o) => o.remove());   // 겹치지 않게 이전 알림 제거
  const kind = type || (/한 번 더|누르면/.test(msg) ? '' : /실패|오류|없습니다|확인하세요|입력하세요|선택하세요/.test(msg) ? 'bad'
    : /[했왔됐였]습니다|되었습니다|저장|추가|삭제|변경|복사|완료|보냈|가져왔/.test(msg) ? 'ok' : '');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  t.innerHTML = `${kind ? `<span class="ti">${kind === 'ok' ? T_OK : T_BAD}</span>` : ''}<span></span>`;
  t.lastChild.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 3200 : 2200);
}

/* 자동 저장 상태 (차분하게): 저장 중 → 저장됨 · 시각 / 실패 */
export function saveState(el) {
  const set = (cls, html) => { if (!el) return; el.className = `save-st ${cls}`; el.innerHTML = html; };
  const hm = () => new Date().toTimeString().slice(0, 5);
  return {
    saving: (t = '저장 중') => set('ing', `<i></i>${t}`),
    saved: (t = '저장됨') => set('ok', `<i></i>${t} · ${hm()}`),
    failed: (t = '저장 실패') => set('bad', `<i></i>${t}`),
    clear: () => set('', ''),
  };
}

/* 지운 줄이 접히며 사라짐 (끝나면 resolve) */
export function fadeOut(el) {
  if (!el || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const h = el.offsetHeight;
  el.style.overflow = 'hidden'; el.style.pointerEvents = 'none';
  return el.animate([{ opacity: 1, height: h + 'px' }, { opacity: 0, height: '0px', paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0 }],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.catch(() => {});
}

/* 새로 추가한 줄이 살짝 떠오르며 등장 */
export function popIn(el) {
  if (!el) return;
  if (reducedMotion()) { el.scrollIntoView({ block: 'nearest' }); return; }
  el.classList.remove('fx-in'); void el.offsetWidth; el.classList.add('fx-in');
  el.addEventListener('animationend', () => el.classList.remove('fx-in'), { once: true });
  requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

/* 버튼이 잠깐 '완료' 상태로 바뀜 (복사 등) */
export function flashDone(btn, label = '복사됨') {
  if (!btn) return;
  if (!btn._orig) btn._orig = btn.innerHTML;
  btn.classList.add('is-done');
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>${label}`;
  clearTimeout(btn._doneT);
  btn._doneT = setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = btn._orig; btn._orig = null; }, 1600);
}

/* 진행 막대: 처음 등장할 때만 왼쪽에서 한 번에 채움 (다시 그릴 때는 그대로) */
const BARS = '.sb-track,.wk-bar,.wr-bar,.ep-bar,.bd-bar';
export function revealBars(root, base = 0) {
  if (!root?.querySelectorAll || reducedMotion()) return;
  const list = root.matches?.(BARS) ? [root] : [...root.querySelectorAll(BARS)];
  list.forEach((b, i) => {
    // 덮개는 '채워진 끝'까지만 → 짧은 막대도 같은 속도감으로 쭉 차오름
    const r = b.getBoundingClientRect();
    const end = Math.max(0, ...[...b.children].map((c) => c.getBoundingClientRect().right - r.left));
    if (!r.width || !end) return;
    b.style.setProperty('--bar-w', `${Math.min(100, (end / r.width) * 100 + 0.5)}%`);
    b.style.setProperty('--bar-d', `${base + Math.min(i, 10) * 35}ms`);
    b.classList.add('bar-in');
    b.addEventListener('animationend', () => { b.classList.remove('bar-in'); b.style.removeProperty('--bar-d'); b.style.removeProperty('--bar-w'); }, { once: true });
  });
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
  revealBars(wrap, 280);
  dragToClose(wrap);
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

/* 손가락으로 끌어서 닫기: 폰 바텀시트는 아래로, 오른쪽 패널은 오른쪽으로 (안쪽 스크롤이 맨 위일 때만) */
function dragToClose(wrap) {
  if (!matchMedia('(pointer:coarse)').matches) return;
  const panel = wrap.querySelector('.modal,.drawer'); if (!panel) return;
  const scrim = wrap.querySelector('.scrim');
  let sx = 0, sy = 0, axis = null, d = 0, t0 = 0, on = false, mode = null;
  const scrollParent = (el) => { for (let n = el; n && n !== panel.parentNode; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n; return null; };
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input,textarea,select,[contenteditable]')) return;
    const sheetMode = wrap.classList.contains('overlay-center') && innerWidth <= 640;
    const drawerMode = panel.classList.contains('drawer') && !panel.classList.contains('drawer-left');
    mode = sheetMode ? 'down' : drawerMode ? 'right' : null; if (!mode) return;
    const sp = scrollParent(e.target);
    if (mode === 'down' && sp && sp.scrollTop > 0) { mode = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; axis = null; d = 0; t0 = performance.now(); on = true;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!on || !mode) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!axis) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'; }
    if ((mode === 'down' && axis !== 'y') || (mode === 'right' && axis !== 'x')) { on = false; return; }
    d = Math.max(0, mode === 'down' ? dy : dx);
    if (d <= 0) return;
    e.preventDefault();
    panel.style.transition = 'none';
    panel.style.transform = mode === 'down' ? `translateY(${d}px)` : `translateX(${d}px)`;
    if (scrim) { scrim.style.transition = 'none'; scrim.style.opacity = String(Math.max(0, 1 - d / (mode === 'down' ? panel.offsetHeight : panel.offsetWidth))); }
  }, { passive: false });
  const end = () => {
    if (!on) return; on = false;
    const size = mode === 'down' ? panel.offsetHeight : panel.offsetWidth;
    const v = d / Math.max(1, performance.now() - t0);
    panel.style.transition = ''; panel.style.transform = '';
    if (scrim) { scrim.style.transition = ''; scrim.style.opacity = ''; }
    if (d > Math.min(140, size * 0.3) || (v > 0.6 && d > 30)) {
      const close = wrap.querySelector('[data-close]:not(.scrim)') || null;
      if (close) close.click(); else wrap.close();
    }
  };
  panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
}

/* =============================================================
   공통 인터랙션 (화면 코드와 상관없이 전체에 적용)
   ① 불러오는 중 → 스켈레톤, 내용으로 바뀌면 살짝 떠오르며 등장
   ② 세그먼트 선택 표시가 미끄러지듯 이동
   ③ 저장 버튼: 누른 뒤 잠기면 자동으로 "저장 중" 원
   ④ 폰: 표 → 카드 (머리글 이름을 칸에 붙임)
   ⑤ 폰: 키보드가 올라와도 입력 칸이 가려지지 않게
   ⑥ 숫자 카운트업 (.cu)
   ============================================================= */
(() => {
  if (typeof MutationObserver === 'undefined') return;
  const motion = !reducedMotion();
  const isLoader = (n) => n.nodeType === 1 && /불러오는 중/.test(n.textContent || '') && (n.textContent || '').trim().length < 20;

  // ② 세그먼트 · 선생님 메뉴: 선택 표시가 미끄러지듯 이동
  const SEG = '.seg,.t-nav';
  const segRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => es.forEach((e) => syncSeg(e.target, true))) : null;
  const seen = new WeakSet();
  function syncSeg(seg, instant) {
    const on = seg.querySelector(':scope > button.on, :scope > a.on');
    let ind = seg.querySelector(':scope > .seg-ind');
    if (!on || !on.offsetWidth) { if (ind) { ind.remove(); seg.classList.remove('has-ind'); } return; }
    const fresh = !ind;
    if (fresh) { ind = document.createElement('i'); ind.className = 'seg-ind'; seg.prepend(ind); seg.classList.add('has-ind'); }
    if (fresh || instant || !motion) ind.style.transition = 'none';
    ind.style.width = `${on.offsetWidth}px`; ind.style.height = `${on.offsetHeight}px`;
    ind.style.transform = `translate(${on.offsetLeft}px,${on.offsetTop}px)`;
    if (fresh || instant || !motion) { void ind.offsetWidth; ind.style.transition = ''; }
    if (segRO && !seen.has(seg)) { seen.add(seg); segRO.observe(seg); }
  }

  // ④ 표 → 카드
  function cardify(tbl) {
    if (tbl.classList.contains('tbl-s') || tbl.classList.contains('tt')) return;
    const heads = [...tbl.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    tbl.classList.add('cardify');
    tbl.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || ''); }));
  }

  // ⑥ 카운트업
  function countUp(el) {
    if (!motion || el.dataset.cu === '1') return;
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
    if (!tn) return;
    const m = tn.nodeValue.match(/^(\D*)(\d+)(.*)$/s); if (!m) return;
    const to = Number(m[2]); if (!to) return;
    el.dataset.cu = '1';
    const t0 = performance.now(), D = 600;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      tn.nodeValue = `${m[1]}${Math.round(to * e)}${m[3]}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let segQ = new Set(), raf = 0;
  const flush = () => { raf = 0; segQ.forEach((g) => syncSeg(g)); segQ = new Set(); };
  const queueSeg = (g) => { segQ.add(g); if (!raf) raf = requestAnimationFrame(flush); };

  function scan(root) {
    if (root.nodeType !== 1) return;
    // 자리표시 칸 자체에만 (감싸는 상자에는 붙이지 않음)
    const SK = '.empty,.pa-empty,.sa-empty,.ct-empty,.ch-none,li.empty';
    if (root.matches?.(SK) && isLoader(root)) root.classList.add('is-skel');
    root.querySelectorAll?.(SK).forEach((n) => { if (isLoader(n) && !n.querySelector(SK)) n.classList.add('is-skel'); });
    if (root.matches?.(SEG)) queueSeg(root);
    root.querySelectorAll?.(SEG).forEach(queueSeg);
    if (root.matches?.('table.tbl')) cardify(root);
    root.querySelectorAll?.('table.tbl').forEach(cardify);
    if (root.closest?.('table.tbl')) cardify(root.closest('table.tbl'));
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') { const g = m.target.closest?.(SEG); if (g) queueSeg(g); continue; }
      const g = m.target.closest?.(SEG); if (g) queueSeg(g);
      if (m.target.classList?.contains('is-skel') && !isLoader(m.target)) m.target.classList.remove('is-skel');
      m.addedNodes.forEach(scan);
      // ① 불러오는 중 자리가 내용으로 바뀌면 살짝 떠오르며 등장 + 숫자 카운트업
      if (motion && [...m.removedNodes].some(isLoader)) {
        let i = 0;
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1 || isLoader(n)) continue;
          n.classList.add('fx-in');
          n.style.animationDelay = `${Math.min(i++, 8) * 40}ms`;
          n.addEventListener('animationend', () => { n.classList.remove('fx-in'); n.style.animationDelay = ''; }, { once: true });
          n.querySelectorAll?.('.cu').forEach(countUp);
          if (n.matches?.('.cu')) countUp(n);
          revealBars(n, 260 + Math.min(i, 8) * 40);
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => document.querySelectorAll(SEG).forEach((g) => syncSeg(g, true)));
  document.fonts?.ready.then(() => document.querySelectorAll(SEG).forEach((g) => syncSeg(g, true)));

  // ③ 저장 중 표시: 버튼을 누른 직후 그 버튼이 잠기면(disabled) 원이 돌고, 풀리면 사라짐
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.btn');
    if (!b || b.disabled) return;
    setTimeout(() => {
      if (!b.disabled || !b.isConnected) return;
      b.classList.add('is-busy');
      const mo = new MutationObserver(() => { if (!b.disabled) { b.classList.remove('is-busy'); mo.disconnect(); } });
      mo.observe(b, { attributes: true, attributeFilter: ['disabled'] });
      setTimeout(() => { b.classList.remove('is-busy'); mo.disconnect(); }, 20000);
    }, 0);
  }, true);

  // ⑤ 폰: 입력 칸에 들어가면 키보드 위로 보이게
  if (matchMedia('(pointer:coarse)').matches) {
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select')) return;
      setTimeout(() => {
        const r = el.getBoundingClientRect(), vh = window.visualViewport?.height || innerHeight;
        if (r.bottom > vh - 16 || r.top < 60) el.scrollIntoView({ block: 'center', behavior: motion ? 'smooth' : 'auto' });
      }, 320);
    });
  }

  // ⑥ 긴 글 칸(.textarea)은 내용만큼 자동으로 늘어남 → 잘린 문장 없이 한눈에
  const grow = (t) => {
    if (!t.isConnected || !t.classList.contains('textarea') || !t.offsetParent) return;
    const min = t._minH || (t._minH = t.offsetHeight);
    t.style.height = 'auto';
    const h = Math.min(Math.max(t.scrollHeight + 2, min), 420);
    t.style.height = h + 'px';
    t.style.overflowY = t.scrollHeight + 2 > 420 ? 'auto' : 'hidden';
  };
  document.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') grow(e.target); });
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (this.classList.contains('textarea')) requestAnimationFrame(() => grow(this)); },
    configurable: true,
  });
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const list = n.matches('textarea.textarea') ? [n] : n.querySelectorAll('textarea.textarea');
      if (list.length) requestAnimationFrame(() => list.forEach(grow));
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ⑦ 누름 효과: 누를 수 있는 모든 것이 '살짝 들어갔다 톡 돌아옴' (빠른 탭에도 보이게 최소 시간 유지)
  //    크기에 따라 들어가는 정도 다르게 (작은 아이콘은 확실히, 넓은 줄은 아주 살짝)
  if (motion && Element.prototype.animate) {
    const TAP = 'button,a[href],[role=button],[role=tab],[data-close],summary,label.chip,label.check,.chip-t,.stu,.ov-card,.pa-kid,.ch-item,.ct-rep,.sum-wk,.role,.profile,[data-sid],[data-wk]';
    const NO = 'input,textarea,select,[contenteditable],.no-press';
    const pick = (t) => {
      if (!t?.closest || t.closest(NO)) return null;
      let el = t.closest(TAP);
      if (!el) { // 그 밖에 손가락 모양 커서인 칸 (표 줄 등)
        for (let n = t; n && n !== document.body; n = n.parentElement) { if (getComputedStyle(n).cursor === 'pointer') { el = n; break; } }
      }
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > innerWidth * innerHeight * 0.45) return null;   // 화면 대부분을 차지하는 상자는 제외
      return el;
    };
    const depth = (el) => {
      const r = el.getBoundingClientRect(), m = Math.max(r.width, r.height);
      return m < 48 ? 0.9 : m < 120 ? 0.94 : m < 300 ? 0.965 : m < 600 ? 0.98 : 0.99;
    };
    let cur = null, t0 = 0, sx = 0, sy = 0;
    const release = () => {
      if (!cur) return;
      const el = cur; cur = null;
      const wait = Math.max(0, 90 - (performance.now() - t0));
      setTimeout(() => {
        el._pa?.cancel();
        el._pa = el.animate([{ scale: String(el._ps) }, { scale: '1' }], { duration: 340, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      }, wait);
    };
    document.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      release();
      const el = pick(e.target); if (!el) return;
      cur = el; t0 = performance.now(); sx = e.clientX; sy = e.clientY;
      el._ps = depth(el);
      el._pa?.cancel();
      el._pa = el.animate([{ scale: '1' }, { scale: String(el._ps) }], { duration: 110, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    }, { passive: true, capture: true });
    document.addEventListener('pointermove', (e) => { if (cur && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) release(); }, { passive: true });
    ['pointerup', 'pointercancel', 'dragstart', 'blur'].forEach((ev) => addEventListener(ev, release, { passive: true, capture: true }));
    document.addEventListener('scroll', release, { passive: true, capture: true });
    // 키보드(Enter · Space)로 눌러도 같은 느낌
    document.addEventListener('keydown', (e) => {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      const el = pick(e.target); if (!el || el !== e.target) return;
      el._pa?.cancel();
      const d = depth(el);
      el._pa = el.animate([{ scale: '1' }, { scale: String(d), offset: 0.3 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    });
  }
})();
