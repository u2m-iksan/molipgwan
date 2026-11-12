// 로그인 · 로그아웃 · "누구세요?" 프로필 기억
import { sb, teacherEmail, familyEmail, familyPassword, isTeacherEmail, isFamilyEmail } from './sb.js';

const PROFILE_KEY = 'molip-profile';   // { email, pick: 'parent' | studentId }
const LOCK_KEY = 'molip-lock';         // { fails, until }
const MAX_FAILS = 5, LOCK_MS = 10 * 60 * 1000;

/* ---------- 오답 잠금 (기기 기준, 가볍게) ---------- */
function readLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 }; }
  catch { return { fails: 0, until: 0 }; }
}
export function lockedFor() {
  const l = readLock();
  return l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 60000) : 0;
}
function addFail() {
  const l = readLock();
  l.fails += 1;
  if (l.fails >= MAX_FAILS) { l.until = Date.now() + LOCK_MS; l.fails = 0; }
  localStorage.setItem(LOCK_KEY, JSON.stringify(l));
}
function clearFails() { localStorage.removeItem(LOCK_KEY); }

/* ---------- 로그인 ---------- */
export async function signInFamily(code) {
  if (lockedFor()) return { ok: false, locked: true };
  const { error } = await sb.auth.signInWithPassword({ email: familyEmail(code), password: familyPassword(code) });
  if (error) { addFail(); return { ok: false, error }; }
  clearFails();
  return { ok: true };
}

export async function signInTeacher(id, password) {
  if (lockedFor()) return { ok: false, locked: true };
  const { error } = await sb.auth.signInWithPassword({ email: teacherEmail(id), password });
  if (error) { addFail(); return { ok: false, error }; }
  clearFails();
  return { ok: true };
}

export async function signOut() {
  forgetPick();
  await sb.auth.signOut();
}

/* ---------- 지금 누구인지 ---------- */
// 반환: null(로그인 안 됨) | {role:'teacher', name, email} | {role:'family', email, students:[...]}
export async function whoAmI() {
  const { data: { session } } = await sb.auth.getSession();
  const email = session?.user?.email;
  if (!email) return null;

  if (isTeacherEmail(email)) {
    const { data, error } = await sb.from('teachers').select('name').eq('email', email).maybeSingle();
    if (error || !data) return { role: 'unknown', email };
    return { role: 'teacher', email, name: data.name };
  }

  if (isFamilyEmail(email)) {
    const { data, error } = await sb.from('students')
      .select('id,name,grade,school,status')
      .neq('status', '퇴원')
      .order('name');
    if (error) return { role: 'unknown', email };
    return { role: 'family', email, students: data || [] };
  }
  return { role: 'unknown', email };
}

/* ---------- 누구세요? 선택 기억 ---------- */
// 기억하기 체크 → localStorage(계속), 아니면 sessionStorage(이 탭 동안만)
export function savedPick(email) {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const p = JSON.parse(store.getItem(PROFILE_KEY));
      if (p && p.email === email) return p.pick;
    } catch { /* 무시 */ }
  }
  return null;
}
export function savePick(email, pick, remember) {
  const v = JSON.stringify({ email, pick });
  sessionStorage.setItem(PROFILE_KEY, v);
  if (remember) localStorage.setItem(PROFILE_KEY, v);
  else localStorage.removeItem(PROFILE_KEY);
}
export function forgetPick() {
  localStorage.removeItem(PROFILE_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
}
