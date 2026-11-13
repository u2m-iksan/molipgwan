// 학습 문의 (선생님): 왼쪽 학생별 채팅방 목록 · 오른쪽 대화
//  안 읽은 학부모 메시지가 있는 방이 맨 위 · 학생 검색으로 새 대화 시작 · 대화 1개월 보관
import { $, $$, esc } from '../ui.js';
import { loadStudents } from '../data/students.js';
import { loadInbox, purgeOld, KEEP_DAYS } from '../data/chat.js';
import { mountThread } from '../views/chat-thread.js';

const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const when = (iso) => {
  const d = kst(iso), today = kst(new Date().toISOString()).slice(0, 10);
  return d.slice(0, 10) === today ? d.slice(11, 16) : `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
};

export async function renderChat(body, { me, onUnread } = {}) {
  const st = { list: [], inbox: new Map(), cur: null, q: '' };
  const token = {}; body._view = token;
  body.innerHTML = `
    <div class="t-head"><h2>학습 문의</h2><span class="count">학부모와 대화 · ${KEEP_DAYS}일 보관</span></div>
    <div class="ch">
      <aside class="card ch-side"><div class="search"><input id="ch-q" type="search" placeholder="학생 검색 · 새 대화" aria-label="학생 검색"></div><ul id="ch-list" class="ch-list"><li class="empty">불러오는 중</li></ul></aside>
      <section class="card ch-main" id="ch-main"><div class="ch-none">왼쪽에서 학생을 고르세요.</div></section>
    </div>`;
  purgeOld();
  try { st.list = (await loadStudents()).filter((s) => s.status !== '퇴원'); } catch (e) { $('#ch-list').innerHTML = `<li class="empty">불러오기 실패: ${esc(e.message)}</li>`; return; }

  async function loadBox() { try { st.inbox = await loadInbox(); } catch { /* 그대로 */ } }
  function drawList() {
    const q = st.q.toLowerCase();
    const rows = st.list.filter((s) => (q ? s.name.toLowerCase().includes(q) || String(s.seat_no || '') === q : st.inbox.has(s.id)));
    rows.sort((a, b) => {
      const A = st.inbox.get(a.id), B = st.inbox.get(b.id);
      return (B?.unread || 0) - (A?.unread || 0) || (B?.last.created_at || '').localeCompare(A?.last.created_at || '') || a.name.localeCompare(b.name, 'ko');
    });
    $('#ch-list').innerHTML = rows.length ? rows.map((s) => {
      const box = st.inbox.get(s.id);
      return `<li><button type="button" class="ch-item${st.cur?.id === s.id ? ' on' : ''}" data-id="${esc(s.id)}">
        <div class="ch-top"><b>${esc(s.name)}</b><small>${esc(s.grade || '')}</small>${box ? `<time>${when(box.last.created_at)}</time>` : ''}</div>
        <div class="ch-last"><span>${box ? `${box.last.sender === 'teacher' ? '나: ' : ''}${esc(box.last.body)}` : '대화 시작'}</span>${box?.unread ? `<i class="pa-n">${box.unread}</i>` : ''}</div>
      </button></li>`;
    }).join('') : `<li class="empty">${q ? '검색 결과가 없습니다.' : '최근 대화가 없습니다.<br>학생을 검색해 대화를 시작하세요.'}</li>`;
    $$('.ch-item').forEach((b) => b.addEventListener('click', () => open(st.list.find((s) => s.id === b.dataset.id))));
  }
  function open(s) {
    st.cur = s; drawList();
    body.classList.add('ch-open');
    const main = $('#ch-main');
    main.innerHTML = `<div class="ch-h"><button type="button" class="icon-btn ch-back" id="ch-back" aria-label="목록"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <b>${esc(s.name)}</b><small>${esc(s.grade || '')}${s.school ? ` · ${esc(s.school)}` : ''}</small></div><div class="ch-thread" id="ch-thread"></div>`;
    $('#ch-back').addEventListener('click', () => { body.classList.remove('ch-open'); st.cur = null; main.innerHTML = '<div class="ch-none">왼쪽에서 학생을 고르세요.</div>'; drawList(); });
    mountThread($('#ch-thread'), { student: s, me: 'teacher', meName: me?.name || '', onActivity: async () => { await loadBox(); drawList(); onUnread?.(); } });
  }
  $('#ch-q').addEventListener('input', (e) => { st.q = e.target.value.trim(); drawList(); });

  await loadBox(); drawList();
  const openId = new URLSearchParams(location.hash.split('?')[1] || '').get('sid');
  if (openId) { const s = st.list.find((x) => x.id === openId); if (s) open(s); }
  const t = setInterval(async () => { if (body._view !== token || !$('#ch-list')) return clearInterval(t); await loadBox(); drawList(); }, 15000);
}
