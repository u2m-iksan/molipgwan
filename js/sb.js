// Supabase 연결 + 로그인 이메일 규칙
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://pnefvpudosqdadwegrof.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RrxJqy32HMExcQb28ZJPRg_zJErWNXI'; // 공개용 키 (권한은 RLS가 결정)

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'molip-auth' },
});

// 다른 계정 만들기용 (내 로그인 상태는 그대로 두고 새 계정만 가입)
export const sbSide = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'molip-side' },
});

// 선생님: 아이디 kkb → t-kkb@molipgwan.app
export const teacherEmail = (id) => `t-${String(id).trim().toLowerCase()}@molipgwan.app`;

// 가족: 학부모 휴대폰 뒷 4자리(겹치면 8자리) → f1234@molipgwan.app
export const familyEmail = (code) => `f${code}@molipgwan.app`;
export const familyPassword = (code) => `molip-${code}-u2m`;

export const isTeacherEmail = (email) => /^t-/.test(email || '');
export const isFamilyEmail = (email) => /^(f\d{4}(\d{4})?|p\d{4}-[0-9a-f]{8})@/.test(email || '');
// 학부모 계정 (SQL 21): 번호 4자리 + 가족 → p1234-89f030d7@molipgwan.app · 비밀번호는 학부모가 정한 숫자 6자리
export const isParentEmail = (email) => /^p\d{4}-[0-9a-f]{8}@/.test(email || '');
export const parentEmail = (code, fid) => `p${code}-${String(fid).slice(0, 8)}@molipgwan.app`;
export const parentPassword = (pin) => `molip-p-${pin}-u2m`;
