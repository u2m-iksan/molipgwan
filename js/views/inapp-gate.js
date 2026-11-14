// 카톡 · 네이버 · 인스타 등 앱 안 브라우저로 열면 막고 크롬(안드로이드) · 사파리(아이폰)로 열게
//  (앱 안 브라우저는 알림 · 홈 화면 추가가 안 됨) · 카카오톡은 바로 바깥 브라우저로 넘김
import { mount, BRAND } from '../ui.js';

const UA = navigator.userAgent;
const isAndroid = /Android/i.test(UA);
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|BAND\/|Snapchat|; wv\)/i;

export function inAppGate() {
  if (!IN_APP.test(UA) || !(isAndroid || isIOS)) return false;
  const url = location.href;
  const chrome = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
  mount(`
    <main class="auth">
      <div class="auth-card iag">
        ${BRAND}
        <h1>${isAndroid ? '크롬으로' : '사파리로'} 열어 주세요</h1>
        <p class="desc">카톡 · 네이버 같은 앱 안에서는 알림과 로그인 유지가 안 돼요.</p>
        ${isAndroid ? `<a class="btn btn-primary iag-btn" href="${chrome}">크롬으로 열기</a>` : ''}
        <ol class="pg-steps">${isAndroid
          ? '<li>버튼이 안 되면 오른쪽 위 <b>⋮</b> 메뉴</li><li><b>다른 브라우저로 열기</b> → <b>Chrome</b></li>'
          : '<li>오른쪽 아래(또는 위) <b>⋯ / 공유</b> 메뉴</li><li><b>Safari로 열기</b>(기본 브라우저로 열기)</li><li>사파리에서 <b>공유 → 홈 화면에 추가</b>하면 더 편해요</li>'}</ol>
        <button type="button" class="btn btn-gray iag-btn" id="iag-copy">주소 복사</button>
      </div>
    </main>`);
  document.getElementById('iag-copy').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(url); e.currentTarget.textContent = '복사됨 · 브라우저 주소창에 붙여넣기'; }
    catch { prompt('이 주소를 복사해서 브라우저에 붙여넣으세요', url); }
  });
  // 카카오톡: 안내를 먼저 그린 뒤 바깥 브라우저로 바로 넘김 (안드로이드 → 기본 브라우저 · 아이폰 → 사파리)
  if (/KAKAOTALK/i.test(UA)) setTimeout(() => { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); }, 300);
  return true;
}
