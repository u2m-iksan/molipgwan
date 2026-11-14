// 푸시 알림 켜기 카드
//  학부모 홈: 꺼져 있을 때만 보이는 카드 (닫으면 이 기기에서 다시 안 보임) · 선생님 설정: 켜기/끄기
import { $, esc, toast } from '../ui.js';
import { pushState, enablePush, disablePush } from '../push.js';
import { sb } from '../sb.js';

const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 19.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const HIDE_KEY = 'molip-push-hide';   // + 학생은 학생별
const TEXT = {
  parent: '선생님 답장 · 주간 보고서가 오면 바로 알려드려요',
  teacher: '학부모 문의가 오면 이 기기로 알려드려요',
  student: '등원 시간 · 공부 1시간마다 알려드려요',
};

export async function mountPushCard(el, who, studentId = null) {
  if (!el) return;
  const { data: { session } } = await sb.auth.getSession();
  const email = session?.user?.email;
  if (!email) return;
  // SQL 21 전이면 안 보임
  const { error } = await sb.rpc('parent_mode');
  if (error) { el.innerHTML = ''; el.closest('.set-sec')?.remove(); return; }
  const draw = async () => {
    const s = await pushState().catch(() => 'unsupported');
    if (who !== 'teacher' && (s === 'on' || s === 'unsupported' || s === 'denied' || localStorage.getItem(HIDE_KEY + (studentId || '')))) { el.innerHTML = ''; return; }
    const msg = s === 'ios-install' ? '아이폰은 공유 버튼 → <b>홈 화면에 추가</b> 후 그 아이콘으로 열면 알림을 받을 수 있어요'
      : s === 'denied' ? '알림이 차단돼 있어요. 기기 설정에서 이 앱의 알림을 허용해 주세요'
      : s === 'unsupported' ? '이 브라우저는 알림을 지원하지 않아요'
      : esc(TEXT[who]);
    const btn = s === 'off' ? '<button type="button" class="btn btn-primary btn-sm" data-push="on">켜기</button>'
      : s === 'on' ? '<button type="button" class="btn btn-gray btn-sm" data-push="off">끄기</button>' : '';
    el.innerHTML = `<div class="push-card${s === 'on' ? ' on' : ''}">
        <span class="push-ic">${BELL}</span>
        <span class="push-tx"><b>${s === 'on' ? '알림 켜짐' : '알림 받기'}</b><small>${msg}</small></span>
        ${btn}${who !== 'teacher' ? '<button type="button" class="push-x" data-push="hide" aria-label="닫기">×</button>' : ''}
      </div>`;
    el.querySelectorAll('[data-push]').forEach((b) => b.addEventListener('click', async () => {
      const v = b.dataset.push;
      if (v === 'hide') { localStorage.setItem(HIDE_KEY + (studentId || ''), '1'); el.innerHTML = ''; return; }
      b.disabled = true;
      try {
        if (v === 'on') { await enablePush(email, studentId); toast('알림을 켰어요'); }
        else { await disablePush(); toast('알림을 껐어요'); }
      } catch (x) { toast(x.message, 'bad'); }
      draw();
    }));
  };
  draw();
}
