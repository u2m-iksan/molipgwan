// 학생 · 가족 데이터 (선생님 전용)
import { sb, familyEmail } from '../sb.js';

export const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3'];
export const STATUSES = ['재원', '휴원', '퇴원'];
export const SUBJECTS = ['국어', '수학', '영어', '사회', '과학', '한국사', '기타'];
export const TRAITS = ['계획 어려움', '시작 늦음', '과다 계획', '쉽게 포기', '과목 회피', '꾸준함'];

/* ---------- 전화번호 ---------- */
export const digits = (s) => String(s || '').replace(/\D/g, '');
export function fmtPhone(s) {
  const d = digits(s);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}
export const validPhone = (s) => /^01\d{8,9}$/.test(digits(s));

function check(res) {
  if (res.error) throw res.error;
  return res.data;
}

/* ---------- 불러오기 ---------- */
// 반환: [{ id, name, grade, school, status, traits, trait_note, avoid_subject, family_id,
//          parent_phone, login_code, student_phone, siblings: [이름…] }]
export async function loadStudents() {
  const [students, fams, sps] = await Promise.all([
    sb.from('students').select('*').order('name').then(check),
    sb.from('family_private').select('family_id,parent_phone,login_code').then(check),
    sb.from('student_private').select('student_id,student_phone').then(check),
  ]);
  const famBy = new Map(fams.map((f) => [f.family_id, f]));
  const spBy = new Map(sps.map((p) => [p.student_id, p.student_phone]));
  return students.map((s) => ({
    ...s,
    parent_phone: famBy.get(s.family_id)?.parent_phone || '',
    login_code: famBy.get(s.family_id)?.login_code || '',
    student_phone: spBy.get(s.id) || '',
    siblings: students.filter((o) => o.family_id === s.family_id && o.id !== s.id).map((o) => o.name),
  }));
}

/* ---------- 가족 찾기/만들기 (학부모 번호 = 가족) ---------- */
async function familyForPhone(phone, labelName) {
  const p = fmtPhone(phone);
  const found = check(await sb.from('family_private').select('family_id').eq('parent_phone', p).limit(1));
  if (found.length) return found[0].family_id;

  const fam = check(await sb.from('families').insert({ label: `${labelName} 가족` }).select('id').single());
  const code = digits(p).slice(-4);
  check(await sb.from('family_private').insert({
    family_id: fam.id, parent_phone: p, login_code: code, login_email: familyEmail(code),
  }));
  return fam.id;
}

// 학생이 하나도 없는 가족 정리
async function dropFamilyIfEmpty(familyId) {
  const left = check(await sb.from('students').select('id').eq('family_id', familyId).limit(1));
  if (!left.length) check(await sb.from('families').delete().eq('id', familyId));
}

function studentRow(f) {
  return {
    name: f.name.trim(), grade: f.grade, school: (f.school || '').trim() || null, status: f.status || '재원',
    seat_no: String(f.seat_no || '').trim() || null,
    traits: f.traits || [], trait_note: (f.trait_note || '').trim() || null,
    avoid_subject: (f.traits || []).includes('과목 회피') ? (f.avoid_subject || null) : null,
    goal: (f.goal || '').trim() || null, strong_subjects: f.strong_subjects || [], weak_subjects: f.weak_subjects || [],
    habits: (f.habits || []).filter(Boolean),
    return_on: f.return_on || null, sat_arrive: f.sat_arrive || null,
  };
}

/* ---------- 등록 · 수정 · 삭제 ---------- */
export async function createStudent(f) {
  const family_id = await familyForPhone(f.parent_phone, f.name.trim());
  const s = check(await sb.from('students').insert({ ...studentRow(f), family_id }).select('id').single());
  if (digits(f.student_phone)) {
    check(await sb.from('student_private').insert({ student_id: s.id, student_phone: fmtPhone(f.student_phone) }));
  }
  return s.id;
}

export async function updateStudent(id, f, prev) {
  let family_id = prev.family_id;
  if (digits(f.parent_phone) !== digits(prev.parent_phone)) {
    family_id = await familyForPhone(f.parent_phone, f.name.trim());
  }
  check(await sb.from('students').update({ ...studentRow(f), family_id }).eq('id', id));
  check(await sb.from('student_private').upsert({ student_id: id, student_phone: digits(f.student_phone) ? fmtPhone(f.student_phone) : null }));
  if (family_id !== prev.family_id) await dropFamilyIfEmpty(prev.family_id);
}

export async function deleteStudent(s) {
  check(await sb.from('students').delete().eq('id', s.id));
  await dropFamilyIfEmpty(s.family_id);
}

/* ---------- 기존 시트에서 가져오기 ---------- */
// 시트에서 복사한 내용(탭 구분)을 읽어 학생 목록으로. 머리글 행의 열 이름으로 위치를 찾음.
const COLS = {
  name: ['이름', '학생명', '성명'],
  grade: ['학년'],
  school: ['학교'],
  student_phone: ['학생전화', '학생 전화', '학생연락처', '학생 휴대폰'],
  parent_phone: ['학부모전화', '학부모 전화', '학부모연락처', '학부모 휴대폰', '보호자전화'],
  status: ['재원여부', '재원 여부', '상태'],
  seat_no: ['자리번호', '자리 번호', '자리', '좌석', '좌석번호'],
};

export function parseSheet(text) {
  const rows = text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()));
  const hi = rows.findIndex((r) => r.some((c) => COLS.name.includes(c)) && r.some((c) => COLS.parent_phone.includes(c)));
  if (hi < 0) return { error: '머리글 행(이름, 학부모전화 등)을 찾을 수 없습니다. 시트의 첫 행까지 포함해 복사하세요.' };
  const head = rows[hi];
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) {
    // '재원여부'를 '상태'보다 우선 (기존 시트의 '상태'는 출결 상태)
    idx[k] = names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  }
  const items = rows.slice(hi + 1).map((r) => {
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] || '' : '');
    const st = get('status');
    const item = {
      name: get('name'), grade: get('grade'), school: get('school'), seat_no: get('seat_no'),
      student_phone: get('student_phone'), parent_phone: get('parent_phone'),
      status: STATUSES.includes(st) ? st : '재원',
    };
    item.problem = !item.name ? '이름 없음'
      : !GRADES.includes(item.grade) ? '학년 형식 오류'
      : !validPhone(item.parent_phone) ? '학부모 번호 오류' : '';
    return item;
  }).filter((it) => it.name || it.parent_phone);
  return { items };
}
