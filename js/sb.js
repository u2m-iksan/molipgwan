// Supabase 연결 + 로그인 이메일 규칙
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pnefvpudosqdadwegrof.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RrxJqy32HMExcQb28ZJPRg_zJErWNXI'; // 공개용 키 (권한은 RLS가 결정)

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'molip-auth' },
});

// 선생님: 아이디 kkb → t-kkb@molipgwan.app
export const teacherEmail = (id) => `t-${String(id).trim().toLowerCase()}@molipgwan.app`;

// 가족: 학부모 휴대폰 뒷 4자리(겹치면 8자리) → f1234@molipgwan.app
export const familyEmail = (code) => `f${code}@molipgwan.app`;
export const familyPassword = (code) => `molip-${code}-u2m`;

export const isTeacherEmail = (email) => /^t-/.test(email || '');
export const isFamilyEmail = (email) => /^f\d{4}(\d{4})?@/.test(email || '');
