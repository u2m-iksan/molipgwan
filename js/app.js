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

async function logout() {
  await signOut();
  route();
}

function showLogin() {
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
  if (me.role === 'teacher') return renderTeacher({ me, onLogout: logout });
  if (me.role !== 'family') return renderUnknown({ onLogout: logout });

  const { email, students } = me;
  // 학부모 계정(p…)은 항상 학부모 화면 · 학생 번호 계정으로 학부모 화면은 SQL 21 이후엔 다시 로그인(비밀번호 분리)
  let role = isParentEmail(email) ? 'parent' : getRole();
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

route();
