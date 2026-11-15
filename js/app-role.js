// 역할별 링크 (/s/ 학생 · /p/ 학부모 · /t/ 선생님)
//  각 폴더의 index.html 이 window.MOLIP_ROLE · MOLIP_ROOT 를 정함 → 역할 고르기 없이 바로 그 로그인
//  로그인 정보 · 저장값도 역할별로 따로 (같은 폰에서 학부모 앱 · 학생 앱 동시에 로그인)
export const FIXED_ROLE = window.MOLIP_ROLE || null;
export const ROOT = window.MOLIP_ROOT || './';
export const KEY_SUFFIX = FIXED_ROLE ? '-' + FIXED_ROLE : '';
