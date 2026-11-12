// 로그인 화면: 가족(숫자 키패드) / 선생님(아이디·비밀번호)
import { mount, $, $$, BRAND, ICON } from '../ui.js';
import { signInFamily, signInTeacher, lockedFor } from '../auth.js';

/* ---------- 가족 로그인 ---------- */
export function renderFamilyLogin({ onDone, onTeacher }) {
  let len = 4, code = '', busy = false;

  mount(`
    <main class="auth">
      <div class="auth-card">
        ${BRAND}
        <h1>로그인</h1>
        <p class="desc" id="desc">학부모님 휴대폰 번호 <b>뒷 4자리</b>를 눌러주세요</p>
        <div class="dots" id="dots" aria-live="polite"></div>
        <p class="err" id="err" role="alert"></p>
        <div class="keypad" id="keypad">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
          <button type="button" class="k-sub" id="lenBtn">8자리</button>
          <button type="button" data-k="0">0</button>
          <button type="button" data-k="del" aria-label="지우기">${ICON.del}</button>
        </div>
        <div class="foot"><button type="button" class="link" id="toTeacher">선생님 로그인</button></div>
      </div>
    </main>`);

  const dots = $('#dots'), err = $('#err');

  function draw() {
    dots.className = 'dots' + (len === 8 ? ' eight' : '');
    dots.innerHTML = Array.from({ length: len }, (_, i) => `<i class="${i < code.length ? 'on' : ''}"></i>`).join('');
    $('#desc').innerHTML = len === 4
      ? '학부모님 휴대폰 번호 <b>뒷 4자리</b>를 눌러주세요'
      : '안내받은 <b>8자리</b>(가운데 4자리 + 뒷 4자리)를 눌러주세요';
    $('#lenBtn').textContent = len === 4 ? '8자리' : '4자리';
  }

  function fail(msg) {
    err.textContent = msg;
    code = ''; draw();
    dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
  }

  async function submit() {
    const m = lockedFor();
    if (m) return fail(`여러 번 틀려서 잠겼어요. ${m}분 뒤에 다시 시도해 주세요.`);
    busy = true; err.textContent = '확인 중…';
    const r = await signInFamily(code);
    busy = false;
    if (r.ok) { cleanup(); return onDone(); }
    if (r.locked) return fail('여러 번 틀려서 10분 동안 잠겼어요.');
    fail(len === 4 ? '번호가 맞지 않아요. 8자리를 받았다면 "8자리"를 눌러주세요.' : '번호가 맞지 않아요.');
  }

  function press(k) {
    if (busy) return;
    if (k === 'del') { code = code.slice(0, -1); err.textContent = ''; return draw(); }
    if (code.length >= len) return;
    code += k; err.textContent = ''; draw();
    if (code.length === len) submit();
  }

  $$('#keypad [data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
  $('#lenBtn').addEventListener('click', () => { len = len === 4 ? 8 : 4; code = ''; err.textContent = ''; draw(); });
  $('#toTeacher').addEventListener('click', () => { cleanup(); onTeacher(); });

  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
  function cleanup() { document.removeEventListener('keydown', onKey); }

  draw();
}

/* ---------- 선생님 로그인 ---------- */
export function renderTeacherLogin({ onDone, onFamily }) {
  mount(`
    <main class="auth">
      <form class="auth-card" id="f" novalidate>
        ${BRAND}
        <h1>선생님 로그인</h1>
        <p class="desc">선생님 아이디와 비밀번호를 입력해 주세요</p>
        <div class="field"><label for="tid">아이디</label>
          <div class="input"><input id="tid" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="예: kkb"></div></div>
        <div class="field"><label for="tpw">비밀번호</label>
          <div class="input"><input id="tpw" type="password" autocomplete="current-password"></div></div>
        <p class="err" id="err" role="alert"></p>
        <button class="btn btn-primary btn-block" id="go">로그인</button>
        <div class="foot"><button type="button" class="link" id="toFamily">학생·학부모 로그인</button></div>
      </form>
    </main>`);

  const err = $('#err'), go = $('#go');
  $('#tid').focus();
  $('#toFamily').addEventListener('click', onFamily);
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#tid').value.trim(), pw = $('#tpw').value;
    if (!id || !pw) { err.textContent = '아이디와 비밀번호를 모두 입력해 주세요.'; return; }
    const m = lockedFor();
    if (m) { err.textContent = `여러 번 틀려서 잠겼어요. ${m}분 뒤에 다시 시도해 주세요.`; return; }
    go.disabled = true; err.textContent = '';
    const r = await signInTeacher(id, pw);
    go.disabled = false;
    if (r.ok) return onDone();
    err.textContent = r.locked ? '여러 번 틀려서 10분 동안 잠겼어요.' : '아이디 또는 비밀번호가 맞지 않아요.';
    $('#tpw').value = ''; $('#tpw').focus();
  });
}
