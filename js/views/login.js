// 로그인: ① 역할 고르기 → ② 학생·학부모는 4자리 키패드 / 선생님은 아이디·비밀번호
import { mount, $, $$, BRAND, ICON } from '../ui.js';
import { signInFamily, signInTeacher, lockedFor } from '../auth.js';

const ROLE_LABEL = { student: '학생', parent: '학부모', teacher: '선생님' };

/* ---------- ① 역할 고르기 ---------- */
export function renderRole({ onPick }) {
  const row = (role, icon) => `
    <button type="button" class="role" data-role="${role}">
      <span class="role-ic">${icon}</span>
      <span class="role-tx"><b>${ROLE_LABEL[role]}</b></span>
      <span class="chev" aria-hidden="true"></span>
    </button>`;

  mount(`
    <main class="auth">
      <div class="auth-card">
        ${BRAND}
        <h1>로그인</h1>
        <div class="roles">
          ${row('student', ICON.student)}
          ${row('parent', ICON.parent)}
          ${row('teacher', ICON.teacher)}
        </div>
      </div>
    </main>`);

  $$('[data-role]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.role)));
}

/* ---------- ② 학생·학부모: 4자리 키패드 ---------- */
export function renderFamilyLogin({ role, onDone, onBack }) {
  const LEN = 4;
  let code = '', busy = false;

  mount(`
    <main class="auth">
      <div class="auth-card">
        ${BRAND}
        <h1>${ROLE_LABEL[role]} 로그인</h1>
        <p class="desc">학부모 휴대폰 번호 뒷 4자리</p>
        <div class="dots" id="dots" aria-live="polite"></div>
        <p class="err" id="err" role="alert"></p>
        <div class="keypad" id="keypad">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
          <span></span>
          <button type="button" data-k="0">0</button>
          <button type="button" data-k="del" aria-label="지우기">${ICON.del}</button>
        </div>
        <div class="foot"><button type="button" class="link" id="back">처음으로</button></div>
      </div>
    </main>`);

  const dots = $('#dots'), err = $('#err');

  function draw() {
    dots.innerHTML = Array.from({ length: LEN }, (_, i) => `<i class="${i < code.length ? 'on' : ''}"></i>`).join('');
  }
  function fail(msg) {
    err.textContent = msg;
    code = ''; draw();
    dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
  }
  async function submit() {
    const m = lockedFor();
    if (m) return fail(`로그인이 제한되었습니다. ${m}분 후 다시 시도하세요.`);
    busy = true; err.textContent = '확인 중…';
    const r = await signInFamily(code);
    busy = false;
    if (r.ok) { cleanup(); return onDone(); }
    if (r.locked) return fail('로그인이 10분간 제한되었습니다.');
    fail('번호가 일치하지 않습니다.');
  }
  function press(k) {
    if (busy) return;
    if (k === 'del') { code = code.slice(0, -1); err.textContent = ''; return draw(); }
    if (code.length >= LEN) return;
    code += k; err.textContent = ''; draw();
    if (code.length === LEN) submit();
  }

  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  function cleanup() { document.removeEventListener('keydown', onKey); }

  $$('#keypad [data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
  $('#back').addEventListener('click', () => { cleanup(); onBack(); });
  document.addEventListener('keydown', onKey);
  draw();
}

/* ---------- ② 선생님: 아이디 · 비밀번호 ---------- */
export function renderTeacherLogin({ onDone, onBack }) {
  mount(`
    <main class="auth">
      <form class="auth-card" id="f" novalidate>
        ${BRAND}
        <h1>선생님 로그인</h1>
        <div class="field"><label for="tid">아이디</label>
          <div class="input"><input id="tid" autocomplete="username" autocapitalize="off" spellcheck="false"></div></div>
        <div class="field"><label for="tpw">비밀번호</label>
          <div class="input"><input id="tpw" type="password" autocomplete="current-password"></div></div>
        <p class="err" id="err" role="alert"></p>
        <button class="btn btn-primary btn-block" id="go">로그인</button>
        <div class="foot"><button type="button" class="link" id="back">처음으로</button></div>
      </form>
    </main>`);

  const err = $('#err'), go = $('#go');
  $('#tid').focus();
  $('#back').addEventListener('click', onBack);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#tid').value.trim(), pw = $('#tpw').value;
    if (!id || !pw) { err.textContent = '아이디와 비밀번호를 입력하세요.'; return; }
    const m = lockedFor();
    if (m) { err.textContent = `로그인이 제한되었습니다. ${m}분 후 다시 시도하세요.`; return; }
    go.disabled = true; err.textContent = '';
    const r = await signInTeacher(id, pw);
    go.disabled = false;
    if (r.ok) return onDone();
    err.textContent = r.locked ? '로그인이 10분간 제한되었습니다.' : '아이디 또는 비밀번호가 일치하지 않습니다.';
    $('#tpw').value = ''; $('#tpw').focus();
  });
}
