// 앱 시작점: 로그인 상태를 보고 알맞은 화면으로
//   로그아웃 상태: 역할 고르기 → (학생·학부모) 4자리 / (선생님) 아이디·비밀번호
//   가족 로그인 후: 학생 → 이름 고르기(1명이면 바로) / 학부모 → 번호 겹칠 때만 가족 고르기
import { whoAmI, signOut, setRole, getRole, savedPick, savePick } from './auth.js';
import { renderRole, renderFamilyLogin, renderTeacherLogin } from './views/login.js';
import { renderWho } from './views/who.js';
import { renderTeacherHome, renderStudentHome, renderParentHome, renderUnknown } from './views/home.js';

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
      '<div class="splash">연결에 문제가 있어요. 인터넷을 확인하고 새로고침해 주세요.</div>';
    return;
  }

  if (!me) return showLogin();
  if (me.role === 'teacher') return renderTeacherHome({ me, onLogout: logout });
  if (me.role !== 'family') return renderUnknown({ onLogout: logout });

  const role = getRole();
  if (role !== 'student' && role !== 'parent') return logout();   // 역할 정보가 없으면 처음부터
  const { email, students } = me;
  const pick = savedPick(email);
  const choose = (id) => { savePick(email, id); route(); };

  if (role === 'student') {
    const stu = students.find((s) => s.id === pick) || (students.length === 1 ? students[0] : null);
    if (stu) return renderStudentHome({ student: stu, onLogout: logout });
    return renderWho({
      title: '누구세요?', desc: '내 이름을 눌러주세요',
      items: students.map((s) => ({ id: s.id, initial: s.name.slice(-1), label: s.name, sub: s.grade })),
      onPick: choose, onLogout: logout,
    });
  }

  // 학부모
  const fams = groupFamilies(students);
  const fam = fams.find((f) => f.id === pick) || (fams.length === 1 ? fams[0] : null);
  if (fam) return renderParentHome({ students: fam.kids, onLogout: logout });
  renderWho({
    title: '누구의 학부모세요?', desc: '자녀 이름을 확인하고 눌러주세요',
    items: fams.map((f) => ({
      id: f.id, initial: f.kids[0].name.slice(-1),
      label: f.kids.map((k) => k.name).join(' · '),
      sub: f.kids.map((k) => k.grade).join(' · '),
    })),
    onPick: choose, onLogout: logout,
  });
}

route();
