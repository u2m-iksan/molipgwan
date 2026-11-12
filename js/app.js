// 앱 시작점: 로그인 상태를 보고 알맞은 화면으로
import { whoAmI, signOut, savedPick, savePick, forgetPick } from './auth.js';
import { renderFamilyLogin, renderTeacherLogin } from './views/login.js';
import { renderWho } from './views/who.js';
import { renderTeacherHome, renderStudentHome, renderParentHome, renderUnknown } from './views/home.js';

const LOGIN_MODE_KEY = 'molip-login-mode'; // 마지막에 쓴 로그인 화면 (선생님 기기는 선생님 화면부터)

async function logout() {
  await signOut();
  route();
}

function showLogin() {
  const mode = localStorage.getItem(LOGIN_MODE_KEY) || 'family';
  const toTeacher = () => { localStorage.setItem(LOGIN_MODE_KEY, 'teacher'); showLogin(); };
  const toFamily = () => { localStorage.setItem(LOGIN_MODE_KEY, 'family'); showLogin(); };
  if (mode === 'teacher') renderTeacherLogin({ onDone: route, onFamily: toFamily });
  else renderFamilyLogin({ onDone: route, onTeacher: toTeacher });
}

async function route() {
  let me;
  try { me = await whoAmI(); }
  catch (e) {
    document.getElementById('app').innerHTML =
      '<div class="splash">연결에 문제가 있어요. 인터넷을 확인하고 새로고침해 주세요.</div>';
    return;
  }

  if (!me) return showLogin();
  if (me.role === 'teacher') return renderTeacherHome({ me, onLogout: logout });
  if (me.role !== 'family') return renderUnknown({ onLogout: logout });

  // 가족 계정: 누구세요?
  const students = me.students;
  const switchProfile = () => { forgetPick(); route(); };
  const pick = savedPick(me.email);

  if (pick === 'parent') return renderParentHome({ students, onSwitch: switchProfile, onLogout: logout });
  const stu = students.find((s) => s.id === pick);
  if (stu) return renderStudentHome({ student: stu, onSwitch: switchProfile, onLogout: logout });

  renderWho({
    students,
    onPick: (p, remember) => { savePick(me.email, p, remember); route(); },
    onLogout: logout,
  });
}

route();
