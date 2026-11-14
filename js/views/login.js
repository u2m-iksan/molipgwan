// 로그인: ① 역할 고르기 → ② 학생·학부모는 4자리 키패드 / 선생님은 아이디·비밀번호
import { mount, $, $$, esc, BRAND, ICON, flash, wait, busyOverlay } from '../ui.js';
import { signInFamily, signInTeacher, lockedFor, parentLookup, signInParent, createParent } from '../auth.js';

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
        <h1>학습 관리 시스템</h1>
        <div class="roles">
          ${row('student', ICON.student)}
          ${row('parent', ICON.parent)}
          ${row('teacher', ICON.teacher)}
        </div>
      </div>
    </main>`);

  $$('[data-role]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.role)));
}

/* ---------- ② 학생·학부모: 키패드 ----------
   학생: 학부모 번호 뒷 4자리
   학부모(SQL 21): 뒷 4자리 → (번호 같은 가족이 여럿이면 자녀 고르기) → 학부모 비밀번호 6자리
                   처음엔 비밀번호 만들기(6자리 두 번) · SQL 21 전에는 예전처럼 4자리만 */
export function renderFamilyLogin({ role, onDone, onBack }) {
  let len = 4, code = '', busy = false, onComplete = null;

  mount(`
    <main class="auth">
      <div class="auth-card">
        ${BRAND}
        <h1 id="ttl">${ROLE_LABEL[role]} 로그인</h1>
        <p class="desc" id="desc">학부모 휴대폰 번호 뒷 4자리</p>
        <div class="dots" id="dots" aria-live="polite"></div>
        <p class="err" id="err" role="alert"></p>
        <div class="fam-pick" id="fam-pick" hidden></div>
        <div class="keypad" id="keypad">
          ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
          <span></span>
          <button type="button" data-k="0">0</button>
          <button type="button" data-k="del" aria-label="지우기">${ICON.del}</button>
        </div>
        <div class="foot"><button type="button" class="link" id="back">처음으로</button></div>
      </div>
    </main>`);

  const dots = $('#dots'), err = $('#err'), pickEl = $('#fam-pick'), pad = $('#keypad');
  let dotEls = [];
  // 한 단계 = 제목 · 설명 · 자릿수 · 다 누르면 할 일
  function step(o) {
    len = o.len; code = ''; onComplete = o.onComplete;
    $('#ttl').textContent = o.title; $('#desc').textContent = o.desc;
    dots.className = 'dots'; dots.innerHTML = '<i></i>'.repeat(len); dotEls = [...dots.children];
    pickEl.hidden = true; pad.hidden = false; dots.hidden = false;
    if (o.err) say(o.err); else say('');
    draw();
  }
  // 점은 다시 그리지 않고 클래스만 바꿔서, 새로 채워진 점만 톡 튀어나옴
  function draw() {
    dotEls.forEach((d, i) => d.classList.toggle('on', i < code.length));
  }
  function say(msg) {
    err.textContent = msg;
    err.classList.remove('show'); void err.offsetWidth; if (msg) err.classList.add('show');
  }
  function fail(msg) {
    dots.classList.remove('wait');
    say(msg);
    code = ''; draw();
    dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
  }
  // 다 누르면: 점이 물결치며 로딩(최소 0.7초) → 결과
  async function run(task) {
    busy = true;
    await wait(150);                      // 마지막 점이 채워지는 걸 보여준 뒤
    dots.classList.add('wait');
    const [r] = await Promise.all([task(), wait(700)]);
    busy = false;
    dots.classList.remove('wait');
    return r;
  }
  async function success() {
    cleanup();
    await mergeToCheck();
    onDone();
  }
  // 로그인 성공: 점들이 일렬로 가운데에 모여 하나가 되고 → 원이 커지고 → 안에 체크가 그려짐
  async function mergeToCheck() {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    dots.classList.remove('wait'); dots.classList.add('ok');
    const box = dots.getBoundingClientRect(), cx = box.left + box.width / 2;
    const moves = dotEls.map((d) => {
      const b = d.getBoundingClientRect();
      return d.animate([{ transform: 'none' }, { transform: `translateX(${cx - (b.left + b.width / 2)}px) scale(1.15)` }],
        { duration: still ? 1 : 420, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }).finished;
    });
    await Promise.all(moves);
    dots.classList.add('merged');
    dots.insertAdjacentHTML('beforeend', `<span class="dots-ck" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30"/><path d="M19 33l9 9 17-18"/></svg></span>`);
    err.textContent = '';
    requestAnimationFrame(() => dots.classList.add('grow'));
    await wait(still ? 300 : 1180);         // 원 커짐 → 체크 그림(~0.8초) → 0.4초 뒤 바로 다음 화면
  }

  /* ----- 학생 (또는 SQL 21 전 학부모): 4자리로 바로 ----- */
  const codeOnly = (c) => run(() => signInFamily(c)).then((r) => {
    if (r.ok) return success();
    fail(r.locked ? '로그인이 10분간 제한되었습니다.' : '번호가 일치하지 않습니다.');
  });

  /* ----- 학부모 ----- */
  function askCode(errMsg) {
    step({ title: `${ROLE_LABEL[role]} 로그인`, desc: '학부모 휴대폰 번호 뒷 4자리', len: 4, err: errMsg,
      onComplete: role === 'student' ? codeOnly : async (c) => {
        const fams = await run(() => parentLookup(c));
        if (fams === null) return codeOnly(c);   // SQL 21 전: 예전 방식
        if (fams.locked) return fail('로그인이 10분간 제한되었습니다.');
        if (fams.error) return fail('잠시 후 다시 시도하세요.');
        if (!fams.length) return fail('번호가 일치하지 않습니다.');
        if (fams.length === 1) return askPin(c, fams[0]);
        // 같은 번호를 쓰는 가족이 여럿 → 자녀 고르기
        $('#ttl').textContent = '자녀 선택'; $('#desc').textContent = '우리 아이를 골라 주세요';
        dots.hidden = true; pad.hidden = true; pickEl.hidden = false; say('');
        pickEl.innerHTML = fams.map((f, i) => `<button type="button" class="fam-opt" data-i="${i}"><b>${esc(f.kids)}</b><span class="chev" aria-hidden="true"></span></button>`).join('');
        $$('[data-i]', pickEl).forEach((b) => b.addEventListener('click', () => askPin(c, fams[Number(b.dataset.i)])));
      } });
  }
  function askPin(c, fam, errMsg) {
    if (!fam.has_pin) return makePin(c, fam);
    step({ title: '학부모 비밀번호', desc: '숫자 6자리', len: 6, err: errMsg,
      onComplete: async (pin) => {
        const r = await run(() => signInParent(c, fam.family_id, pin));
        if (r.ok) return success();
        fail(r.locked ? '로그인이 10분간 제한되었습니다.' : '비밀번호가 일치하지 않습니다. 잊으셨으면 선생님께 초기화를 요청하세요.');
      } });
  }
  function makePin(c, fam, errMsg) {
    step({ title: '학부모 비밀번호 만들기', desc: '처음 한 번만 · 자녀와 다른 숫자 6자리', len: 6, err: errMsg,
      onComplete: async (pin) => {
        if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return fail('너무 쉬운 번호예요. 다른 숫자로 해 주세요.');
        await wait(150);
        step({ title: '한 번 더 입력', desc: '방금 만든 비밀번호 6자리', len: 6,
          onComplete: async (pin2) => {
            if (pin2 !== pin) { await wait(150); return makePin(c, fam, '비밀번호가 서로 달라요. 다시 만들어 주세요.'); }
            const r = await run(() => createParent(c, fam.family_id, pin));
            if (r.ok) return success();
            fail(r.error?.message || '만들지 못했습니다.');
          } });
      } });
  }

  function press(k) {
    if (busy || pad.hidden) return;
    flash($(`#keypad [data-k="${k}"]`), 'tap');
    if (k === 'del') { code = code.slice(0, -1); say(''); return draw(); }
    if (code.length >= len) return;
    code += k; say(''); draw();
    if (code.length === len) {
      const m = lockedFor();
      if (m) return fail(`로그인이 제한되었습니다. ${m}분 후 다시 시도하세요.`);
      onComplete(code);
    }
  }

  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  function cleanup() { document.removeEventListener('keydown', onKey); }

  $$('#keypad [data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
  $('#back').addEventListener('click', () => { cleanup(); onBack(); });
  document.addEventListener('keydown', onKey);
  askCode();
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
    const ov = busyOverlay('로그인 중');
    const r = await signInTeacher(id, pw);
    go.disabled = false;
    if (r.ok) { await ov.done('로그인 완료', '', 1400); return onDone(); }
    await ov.close();
    err.textContent = r.locked ? '로그인이 10분간 제한되었습니다.' : '아이디 또는 비밀번호가 일치하지 않습니다.';
    $('#tpw').value = ''; $('#tpw').focus();
  });
}
