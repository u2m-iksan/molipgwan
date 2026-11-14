// 푸시 알림 켜기 · 끄기 (학부모 계정 · 선생님)
//  · 안드로이드 크롬: 바로 가능 · 아이폰: '홈 화면에 추가'한 앱에서만 (iOS 16.4+)
//  · 알림 보내기는 Edge Function 'send-push' (SQL 21 + 함수 배포 필요). 없으면 조용히 '지원 안 함'
import { sb, SUPABASE_URL } from './sb.js';

const FN = `${SUPABASE_URL}/functions/v1/send-push`;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 쌓인 알림 보내기 요청 (메시지 보냄 · 보고서 공개 직후 등) — 실패해도 무시
export function kickPush() {
  try { fetch(FN, { method: 'POST', keepalive: true }).catch(() => {}); } catch { /* 없음 */ }
}

const b64 = (s) => {
  const p = '='.repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...r].map((c) => c.charCodeAt(0)));
};

// 'unsupported' | 'ios-install'(홈 화면 추가 필요) | 'denied' | 'off' | 'on'
//  한 기기에서 여러 계정(학부모 + 자녀 등)이 각각 켤 수 있음 → 이 계정 · 이 학생으로 등록돼 있는지까지 확인
export async function pushState(studentId = null) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  const { data } = await sb.from('push_subscriptions').select('endpoint').eq('endpoint', sub.endpoint).eq('student_key', studentId || '').limit(1);
  if (data) return data.length ? 'on' : 'off';
  return 'on';   // SQL 24 전
}

// studentId: 학생 기기 (학생 번호 계정은 형제가 같이 쓰므로 누구 기기인지 같이 저장)
export async function enablePush(email, studentId = null) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림이 허용되지 않았습니다. 기기 설정에서 허용해 주세요.');
  // 공개 키: DB에 있으면 그걸, 없으면 함수가 처음 만들면서 돌려줌
  let key = (await sb.rpc('push_public_key')).data;
  if (!key) {
    const r = await fetch(FN, { method: 'POST' }).then((x) => x.json()).catch(() => null);
    key = r?.publicKey;
  }
  if (!key) throw new Error('알림 서버가 아직 준비되지 않았습니다. (send-push 함수 배포 필요)');
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  const j = sub.toJSON();
  const row = { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email, ...(studentId ? { student_id: studentId } : {}) };
  let { error } = await sb.from('push_subscriptions').upsert({ ...row, student_key: studentId || '' }, { onConflict: 'endpoint,email,student_key' });
  if (error && /student_key|on conflict|ON CONFLICT/i.test(error.message || '')) ({ error } = await sb.from('push_subscriptions').upsert(row));   // SQL 24 전
  if (error) throw error;
}

// 이 계정 것만 끄기 (studentId 주면 그 학생 것만) — 같은 기기의 다른 계정 알림은 그대로
export async function disablePush(studentId) {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  let q = sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);   // 내 계정 줄만 지워짐 (권한)
  if (studentId !== undefined) q = q.eq('student_key', studentId || '');
  await q;
}

// 알림을 눌러 이미 열린 앱으로 왔을 때 그 화면으로
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.url) { const u = new URL(e.data.url); if (u.hash && u.hash !== location.hash) location.hash = u.hash; }
  });
}
