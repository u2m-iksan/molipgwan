// 로그인 · 로그아웃 · "누구세요?" 프로필 기억
import { sb, teacherEmail, familyEmail, familyPassword, isTeacherEmail, isFamilyEmail, parentEmail, parentPassword } from './sb.js';

const PROFILE_KEY = 'molip-profile';   // { role, email, pick }
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
// 가족 로그인. 계정이 아직 없으면(첫 로그인) 등록된 번호인지 확인 후 계정을 만들고 바로 로그인.
export async function signInFamily(code) {
  if (lockedFor()) return { ok: false, locked: true };
  const email = familyEmail(code), password = familyPassword(code);

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) { clearFails(); return { ok: true }; }

  const { data: exists } = await sb.rpc('family_code_exists', { code });
  if (!exists) { addFail(); return { ok: false, error }; }

  const { data, error: e2 } = await sb.auth.signUp({ email, password });
  if (e2 || !data.session) { return { ok: false, error: e2 || new Error('계정 생성 실패') }; }
  clearFails();
  return { ok: true };
}

/* ---------- 학부모 (SQL 21): 4자리 → 가족 → 학부모 비밀번호 6자리 ---------- */
// null = SQL 21 전(예전 방식으로) · [] = 없는 번호 · [{ family_id, kids, has_pin }]
export async function parentLookup(code) {
  if (lockedFor()) return { locked: true };
  const { data, error } = await sb.rpc('parent_lookup', { code });
  if (error) return error.code === 'PGRST202' || /parent_lookup/.test(error.message || '') ? null : { error };
  if (!data?.length) addFail();
  return data || [];
}
export async function signInParent(code, fid, pin) {
  if (lockedFor()) return { ok: false, locked: true };
  const { error } = await sb.auth.signInWithPassword({ email: parentEmail(code, fid), password: parentPassword(pin) });
  if (error) { addFail(); return { ok: false, error }; }
  clearFails();
  return { ok: true };
}
// 처음: 학부모 계정 만들고 그 가족에 연결
export async function createParent(code, fid, pin) {
  const email = parentEmail(code, fid), password = parentPassword(pin);
  let { data, error } = await sb.auth.signUp({ email, password });
  if (error && /already|registered|exists/i.test(error.message || '')) ({ data, error } = await sb.auth.signInWithPassword({ email, password }));
  if (error || !data?.session) return { ok: false, error: error || new Error('계정을 만들지 못했습니다.') };
  // 비밀번호도 같이 저장 → 선생님이 학생 목록에서 볼 수 있음 (SQL 22 · 전이면 예전 함수로)
  let { error: e2 } = await sb.rpc('claim_parent', { code, fid, pin });
  if (e2 && (e2.code === 'PGRST202' || /claim_parent/.test(e2.message || ''))) ({ error: e2 } = await sb.rpc('claim_parent', { code, fid }));
  if (e2) { await sb.auth.signOut(); return { ok: false, error: e2 }; }
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
  try { const { disablePush } = await import('./push.js'); await disablePush(); } catch { /* 없음 */ }
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
      .select('id,name,grade,school,status,family_id')
      .neq('status', '퇴원')
      .order('name');
    if (error) return { role: 'unknown', email };
    return { role: 'family', email, students: data || [] };
  }
  return { role: 'unknown', email };
}

/* ---------- 역할 + "누구세요?" 선택 기억 (로그아웃 전까지 이 기기에 유지) ---------- */
// { role: 'student'|'parent', email?, pick?: studentId | familyId }
function readProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}
export function setRole(role) { localStorage.setItem(PROFILE_KEY, JSON.stringify({ role })); }
export function getRole() { return readProfile().role || null; }
export function savedPick(email) {
  const p = readProfile();
  return p.email === email ? p.pick : null;
}
export function savePick(email, pick) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...readProfile(), email, pick }));
}
export function forgetPick() { localStorage.removeItem(PROFILE_KEY); }
