// 앱 시작점: 로그인 상태를 보고 알맞은 화면으로
//   로그아웃 상태: 역할 고르기 → (학생·학부모) 4자리 / (선생님) 아이디·비밀번호
//   가족 로그인 후: 학생 → 이름 고르기(1명이면 바로) / 학부모 → 번호 겹칠 때만 가족 고르기
import { whoAmI, signOut, setRole, getRole, savedPick, savePick } from './auth.js';
import { sb, isParentEmail } from './sb.js';
import { renderRole, renderFamilyLogin, renderTeacherLogin } from './views/login.js';
import { renderWho } from './views/who.js';
import { renderUnknown } from './views/home.js';
import { renderStudentHome } from './views/student.js';
import { renderParentHome } from './views/parent.js';
import { renderTeacher } from './teacher/shell.js';
import { inAppGate } from './views/inapp-gate.js';
import { FIXED_ROLE, PREVIEW } from './app-role.js';
import { esc } from './ui.js';

async function logout() {
  await signOut();
  route();
}

function showLogin() {
  // 역할별 링크: 고르기 없이 바로 그 로그인 ('처음으로' = 이 로그인 처음부터)
  if (FIXED_ROLE) {
    setRole(FIXED_ROLE);
    if (FIXED_ROLE === 'teacher') return renderTeacherLogin({ onDone: route, onBack: showLogin });
    return renderFamilyLogin({ role: FIXED_ROLE, onDone: route, onBack: showLogin });
  }
  renderRole({
    onPick: (role) => {
      setRole(role);
      if (role === 'teacher') renderTeacherLogin({ onDone: route, onBack: logout });
      else renderFamilyLogin({ role, onDone: route, onBack: logout });
    },
  });
}

// 학부모용: 자녀를 가족별로 묶기 (번호가 같은 가족이 여럿일 수 있음)
function groupFamilies(students) {
  const map = new Map();
  for (const s of students) {
    if (!map.has(s.family_id)) map.set(s.family_id, []);
    map.get(s.family_id).push(s);
  }
  return [...map.entries()].map(([id, kids]) => ({ id, kids }));
}

async function route() {
  let me;
  try { me = await whoAmI(); }
  catch {
    document.getElementById('app').innerHTML =
      '<div class="splash">연결 오류가 발생했습니다. 새로고침하세요.</div>';
    return;
  }

  if (!me) return showLogin();
  // 역할별 링크에 다른 역할 계정이 남아 있으면 그 링크의 로그인으로
  if (FIXED_ROLE === 'teacher' && me.role !== 'teacher') return logout();
  if (FIXED_ROLE && FIXED_ROLE !== 'teacher' && me.role === 'teacher') return logout();
  if (me.role === 'teacher') {
    const pv = location.hash.match(/^#\/as\/(s|p)\/([0-9a-f-]{36})/);
    if (pv) return renderPreview(pv[1], pv[2]);
    return renderTeacher({ me, onLogout: logout });
  }
  if (me.role !== 'family') return renderUnknown({ onLogout: logout });

  const { email, students } = me;
  // 학부모 계정(p…)은 항상 학부모 화면 · 학생 번호 계정으로 학부모 화면은 SQL 21 이후엔 다시 로그인(비밀번호 분리)
  let role = isParentEmail(email) ? 'parent' : FIXED_ROLE || getRole();
  if (FIXED_ROLE && role !== FIXED_ROLE) return logout();   // 학생 링크에 학부모 계정 등
  if (role === 'parent' && !isParentEmail(email)) {
    const { error } = await sb.rpc('parent_mode');
    if (!error) return logout();
  }
  if (role !== 'student' && role !== 'parent') return logout();   // 역할 정보가 없으면 처음부터
  const pick = savedPick(email);
  const choose = (id) => { savePick(email, id); route(); };

  if (role === 'student') {
    const stu = students.find((s) => s.id === pick) || (students.length === 1 ? students[0] : null);
    if (stu) return renderStudentHome({ student: stu, onLogout: logout });
    return renderWho({
      title: '학생 선택',
      items: students.map((s) => ({ id: s.id, initial: s.name.slice(-1), label: s.name, sub: s.grade })),
      onPick: choose, onLogout: logout,
    });
  }

  // 학부모
  const fams = groupFamilies(students);
  const fam = fams.find((f) => f.id === pick) || (fams.length === 1 ? fams[0] : null);
  if (fam) return renderParentHome({ students: fam.kids, onLogout: logout });
  renderWho({
    title: '자녀 선택',
    items: fams.map((f) => ({
      id: f.id, initial: f.kids[0].name.slice(-1),
      label: f.kids.map((k) => k.name).join(' · '),
      sub: f.kids.map((k) => k.grade).join(' · '),
    })),
    onPick: choose, onLogout: logout,
  });
}

/* 선생님: 학생 · 학부모 화면 그대로 열어보기 (#/as/s/학생id · #/as/p/가족id) */
async function renderPreview(kind, id) {
  const back = () => {
    let h = '';
    try { h = sessionStorage.getItem('molip-pv-back') || ''; } catch { /* */ }
    location.hash = /^#\/as\//.test(h) ? '' : h; location.reload();
  };
  const q = sb.from('students').select('*');
  const { data, error } = await (kind === 's' ? q.eq('id', id) : q.eq('family_id', id).neq('status', '퇴원').order('name'));
  if (error || !data?.length) { back(); return; }
  PREVIEW.on = true;
  if (kind === 's') await renderStudentHome({ student: data[0], onLogout: back });
  else await renderParentHome({ students: data, onLogout: back });
  document.body.classList.add('is-preview');
  document.body.insertAdjacentHTML('beforeend', `<div class="pv-bar" role="status"><span><b>${esc(data.map((s) => s.name).join(' · '))}</b> ${kind === 's' ? '학생' : '학부모'} 화면</span><button type="button" id="pv-x">선생님 화면으로</button></div>`);
  document.getElementById('pv-x').addEventListener('click', back);
}

if (!inAppGate()) route();   // 카톡 등 앱 안 브라우저면 크롬 · 사파리로 열게
