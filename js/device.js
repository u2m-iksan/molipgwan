// 기기 이름표 + 선생님이 원격으로 로그아웃시키기 (SQL 25 · 학생용)
//  학생 앱엔 로그아웃 버튼이 없음 → 선생님이 학생 정보 창에서 기기별로 풀어줌
import { sb } from './sb.js';

const KEY = 'molip-device';
export function deviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) { id = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem(KEY, id); }
  return id;
}
export function deviceLabel() {
  const u = navigator.userAgent;
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android 폰' : 'Android 태블릿') : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : '기기';
  const br = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? '삼성 인터넷' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? '홈 화면 앱' : br;
  return [os, app].filter(Boolean).join(' · ');
}

// 살아 있음 기록 + 선생님이 로그아웃 요청했는지 → true 면 로그아웃해야 함
export async function heartbeat(email, studentId) {
  const id = deviceId();
  const { error } = await sb.from('devices').upsert({ id, email, student_id: studentId, label: deviceLabel(), last_seen: new Date().toISOString() });
  if (error) return false;   // SQL 25 전
  const { data } = await sb.from('devices').select('kick').eq('id', id).maybeSingle();
  if (data?.kick) { await sb.from('devices').delete().eq('id', id); return true; }
  return false;
}

// 선생님: 그 학생 기기 목록 · 로그아웃시키기
export async function studentDevices(studentId) {
  const { data, error } = await sb.from('devices').select('*').eq('student_id', studentId).order('last_seen', { ascending: false });
  return error ? null : data || [];
}
export async function kickDevice(id) {
  const { error } = await sb.from('devices').update({ kick: true }).eq('id', id);
  if (error) throw error;
}
