// 학생: 알림을 켜야 앱을 쓸 수 있게 (강제 팝업 · 닫기 없음)
//  off → [알림 켜기] / 거부됨 → 설정에서 허용하는 법 + [다시 확인] / 아이폰 사파리 → 홈 화면에 추가하는 법
//  지원 안 되는 브라우저 · SQL 21 전이면 안 띄움
import { $, esc, toast } from '../ui.js';
import { pushState, enablePush } from '../push.js';
import { sb } from '../sb.js';

const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 19.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const isAndroid = () => /Android/.test(navigator.userAgent);

export async function pushGate(studentId) {
  const { error } = await sb.rpc('parent_mode');
  if (error) return;                                   // SQL 21 전
  const { data: { session } } = await sb.auth.getSession();
  const email = session?.user?.email; if (!email) return;
  let s = await pushState(studentId).catch(() => 'unsupported');
  if (s === 'on' || s === 'unsupported') return;

  const w = document.createElement('div');
  w.className = 'pgate'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', '알림 켜기');
  document.body.appendChild(w);
  document.documentElement.classList.add('pgate-lock');

  const body = () => {
    if (s === 'ios-install') return `
      <b class="pg-t">홈 화면에 추가해 주세요</b>
      <p class="pg-d">아이폰은 홈 화면 앱에서만 알림을 받을 수 있어요.</p>
      <ol class="pg-steps"><li>아래 <b>공유 버튼</b>(네모에 위 화살표)을 눌러요</li><li><b>홈 화면에 추가</b>를 눌러요</li><li>홈 화면의 <b>몰입관</b> 아이콘으로 다시 열어요</li></ol>`;
    if (s === 'denied') return `
      <b class="pg-t">알림이 꺼져 있어요</b>
      <p class="pg-d">등원 시간 · 공부 시간 알림을 받아야 앱을 쓸 수 있어요.</p>
      <ol class="pg-steps">${isAndroid()
        ? '<li>주소창 왼쪽 <b>자물쇠(설정) 아이콘</b> → <b>권한</b> → <b>알림 허용</b></li><li>또는 휴대폰 설정 → 앱 → Chrome → 알림 켜기</li>'
        : '<li>휴대폰 <b>설정</b> → <b>알림</b> → <b>몰입관</b></li><li><b>알림 허용</b>을 켜요</li>'}
        <li>돌아와서 아래 <b>다시 확인</b>을 눌러요</li></ol>
      <button type="button" class="btn btn-primary pg-btn" data-g="re">다시 확인</button>`;
    return `
      <b class="pg-t">알림을 켜 주세요</b>
      <p class="pg-d">등원 시간 · 스톱워치 1시간마다 · 이행도 입력 시간을 알려 드려요. 알림을 켜야 앱을 쓸 수 있어요.</p>
      <button type="button" class="btn btn-primary pg-btn" data-g="on">알림 켜기</button>`;
  };
  const draw = () => {
    w.innerHTML = `<div class="pg-card"><span class="pg-ic">${BELL}</span>${body()}<p class="pg-help">안 되면 선생님께 말해 주세요.</p></div>`;
    w.querySelector('[data-g="on"]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await enablePush(email, studentId); close(); toast('알림을 켰어요'); }
      catch (x) { s = await pushState(studentId).catch(() => s); if (s === 'off') toast(x.message, 'bad'); draw(); }
    });
    w.querySelector('[data-g="re"]')?.addEventListener('click', async () => {
      s = await pushState(studentId).catch(() => s);
      if (s === 'on') return close();
      if (s === 'off') { draw(); return; }
      toast('아직 알림이 꺼져 있어요', 'bad');
    });
  };
  const close = () => { w.classList.add('out'); document.documentElement.classList.remove('pgate-lock'); setTimeout(() => w.remove(), 220); };
  draw();
  requestAnimationFrame(() => w.classList.add('in'));
  // 설정에서 허용하고 돌아오면 자동으로 다시 확인
  document.addEventListener('visibilitychange', async function chk() {
    if (document.hidden || !w.isConnected) { if (!w.isConnected) document.removeEventListener('visibilitychange', chk); return; }
    const n = await pushState(studentId).catch(() => s);
    if (n === 'on') close(); else if (n !== s) { s = n; draw(); }
  });
}
