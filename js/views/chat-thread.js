// 채팅방 (학부모 앱 · 선생님 채팅 탭 공용)
//  내 말풍선 오른쪽 / 상대 왼쪽 · 보고서는 썸네일 말풍선(누르면 크게) · 날짜 구분선
//  읽음: 내 메시지 옆 "1"(안 읽음) / "읽음" · 8초마다 새 메시지 확인
//  내 말풍선 누르기 → 수정 · 삭제 (선생님은 흔적 없음, 학부모는 '수정됨' · '삭제된 메시지')
//  선생님: 보고서 옆 ⋯ → 채팅에서 삭제(공개 취소)
//  학부모: 학원비 등 운영 문의로 보이면 카카오 채널 안내
import { $, $$, esc, toast, sheet, X } from '../ui.js';
import { short } from '../date.js';
import { mountReport, BADGES, BADGE_ORDER, badgesOf } from './report-card.js';
import { openReportViewer } from './report-viewer.js';
import { loadThread, sendMessage, markRead, markReportRead, isOpsQuestion, KEEP_DAYS, editMessage, deleteMessage, unpublishReport } from '../data/chat.js';

const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>';
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const dayOf = (iso) => kst(iso).slice(0, 10);
const timeOf = (iso) => { const t = kst(iso).slice(11, 16); const h = Number(t.slice(0, 2)); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${t.slice(3)}`; };

export function mountThread(el, { student, me, meName = '', kakao = '', onActivity }) {
  const token = {}; el._thread = token;
  el.classList.add('ct');
  el.innerHTML = `
    <div class="ct-list" id="ct-list"><div class="ct-empty">불러오는 중</div></div>
    ${me === 'parent' ? `<p class="ct-note">학습 관련 문의 창구입니다. 대화와 보고서는 ${KEEP_DAYS}일 동안 보관됩니다.
      학원비 · 수강 등 운영 문의는 ${kakao ? `<a href="${esc(kakao)}" target="_blank" rel="noopener">몰입관 카카오톡 채널</a>` : '몰입관 카카오톡 채널'}로 부탁드립니다.</p>` : ''}
    <div class="ct-ops" id="ct-ops" hidden>학원비 · 수강 관련 문의는 ${kakao ? `<a href="${esc(kakao)}" target="_blank" rel="noopener">카카오톡 채널</a>` : '카카오톡 채널'}로 보내 주세요. 이 창은 학습 문의 전용입니다.</div>
    <form class="ct-input" id="ct-form" autocomplete="off">
      <textarea id="ct-text" rows="1" maxlength="1000" placeholder="${me === 'parent' ? '학습 관련 궁금한 점을 남겨 주세요' : '답장 입력'}"></textarea>
      <button type="submit" class="ct-send" id="ct-send" aria-label="보내기" disabled>${SEND}</button>
    </form>`;
  const list = $('#ct-list', el), ta = $('#ct-text', el), btn = $('#ct-send', el);
  let items = [], sig = '', busy = false;

  const alive = () => el._thread === token && document.body.contains(el);
  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;

  let seen = null;   // 이미 그린 말풍선 id (새로 생긴 것만 톡 등장)
  function draw(stick) {
    if (!items.length) { list.innerHTML = `<div class="ct-empty">${me === 'parent' ? '아직 대화가 없습니다.<br>학습 관련 궁금한 점을 남겨 주시면 선생님이 답변드립니다.' : '아직 대화가 없습니다.'}</div>`; return; }
    let lastDay = '';
    list.innerHTML = items.map((it, i) => {
      const d = dayOf(it.at);
      const sep = d !== lastDay ? `<div class="ct-day"><span>${short(d)}</span></div>` : ''; lastDay = d;
      if (it.type === 'report') {
        const r = it.r, got = BADGE_ORDER.filter((k) => BADGES[k] && badgesOf(r).includes(k));
        const mine = me === 'teacher';
        return `${sep}<div class="ct-row ${mine ? 'mine' : ''}" data-id="r${esc(r.id)}">
          ${mine ? '' : '<div class="ct-av">U2M</div>'}
          <div class="ct-col">${mine ? '' : '<span class="ct-from">몰입관</span>'}
            <div class="ct-b-wrap">${mine ? `<span class="ct-meta">${r.read_at ? '<em class="rd">읽음</em>' : '<em class="ur">1</em>'}<time>${timeOf(it.at)}</time></span>` : ''}
              <button type="button" class="ct-rep" data-r="${i}">
                <p>${esc(student.name)} 학생 ${r.stats?.is_new ? '신규생 상담 보고서' : '주간 보고서'}${got.length ? `<span class="msg-badges">${got.map((k) => `<i>${BADGES[k].icon}</i>`).join('')}</span>` : ''}</p>
                <div class="msg-thumb"><div class="msg-thumb-in"></div></div>
                <span class="ct-rep-go">보고서 보기 ›</span>
              </button>
              ${mine ? '' : `<span class="ct-meta">${!r.read_at ? '<em class="new">N</em>' : ''}<time>${timeOf(it.at)}</time></span>`}</div>
            ${mine ? `<button type="button" class="ct-more" data-rm="${i}" aria-label="보고서 메뉴">⋯</button>` : ''}</div></div>`;
      }
      const m = it.m, mine = m.sender === me;
      const who = m.sender === 'teacher' ? (m.author ? `${esc(m.author)} 선생님` : '선생님') : '학부모';
      return `${sep}<div class="ct-row ${mine ? 'mine' : ''}${m.pending ? ' pending' : ''}" data-id="${m.pending ? 'tmp' : `m${esc(m.id)}`}">
        ${mine ? '' : `<div class="ct-av ${m.sender === 'parent' ? 'par' : ''}">${m.sender === 'parent' ? '부모' : 'U2M'}</div>`}
        <div class="ct-col">${mine ? '' : `<span class="ct-from">${who}</span>`}
          <div class="ct-b-wrap">${mine ? `<span class="ct-meta">${m.deleted_at ? '' : m.read_at ? '<em class="rd">읽음</em>' : '<em class="ur">1</em>'}${m.edited_at && !m.deleted_at ? '<em class="ed">수정됨</em>' : ''}<time>${timeOf(m.created_at)}</time></span>` : ''}
            ${m.deleted_at ? `<div class="ct-b del">삭제된 메시지입니다.</div>`
              : mine && !m.pending ? `<button type="button" class="ct-b ct-b-btn" data-m="${i}" aria-label="메시지 수정 · 삭제">${esc(m.body)}</button>`
              : `<div class="ct-b">${esc(m.body)}</div>`}
            ${mine ? '' : `<span class="ct-meta">${m.edited_at && !m.deleted_at ? '<em class="ed">수정됨</em>' : ''}<time>${timeOf(m.created_at)}</time></span>`}</div></div></div>`;
    }).join('');
    $$('.ct-rep', list).forEach((b) => {
      const r = items[Number(b.dataset.r)].r;
      mountReport($('.msg-thumb-in', b), r, student);
      b.addEventListener('click', () => {
        openReportViewer(r, student, `${short(r.period_end || r.published_at.slice(0, 10))} 보고서`);
        if (me === 'parent' && !r.read_at) { r.read_at = new Date().toISOString(); markReportRead(r.id).then(() => onActivity?.()).catch(() => {}); draw(); }
      });
    });
    $$('[data-m]', list).forEach((b) => b.addEventListener('click', () => openMsgMenu(items[Number(b.dataset.m)].m)));
    $$('[data-rm]', list).forEach((b) => b.addEventListener('click', () => openRepMenu(items[Number(b.dataset.rm)].r)));
    // 새 말풍선만 등장 애니메이션 (처음 그릴 때 · 다시 그릴 때 기존 것은 그대로)
    const rows = $$('.ct-row', list);
    if (seen) rows.forEach((row) => { if (!seen.has(row.dataset.id) && !(row.dataset.id !== 'tmp' && seen.has('tmp') && row.classList.contains('mine'))) row.classList.add('ct-new'); });
    seen = new Set(rows.map((r) => r.dataset.id));
    if (stick) {
      if (rows.some((r) => r.classList.contains('ct-new'))) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      else list.scrollTop = list.scrollHeight;
    }
  }

  async function refresh(first = false) {
    if (!alive()) return;
    try {
      const keep = atBottom();
      const next = await loadThread(student.id);
      // 상대 메시지 읽음 처리
      const other = me === 'parent' ? 'teacher' : 'parent';
      if (next.some((x) => x.type === 'msg' && x.m.sender === other && !x.m.read_at)) {
        await markRead(student.id, me).catch(() => {});
        next.forEach((x) => { if (x.type === 'msg' && x.m.sender === other && !x.m.read_at) x.m.read_at = new Date().toISOString(); });
        onActivity?.();
      }
      // 학부모: 대화방에 보고서가 보이면 읽은 것으로 (자세히 안 눌러도)
      if (me === 'parent') {
        const unreadReps = next.filter((x) => x.type === 'report' && x.r && !x.r.read_at);
        if (unreadReps.length) {
          await Promise.all(unreadReps.map((x) => markReportRead(x.r.id).catch(() => {})));
          unreadReps.forEach((x) => { x.r.read_at = new Date().toISOString(); });
          onActivity?.();
        }
      }
      const s = JSON.stringify(next.map((x) => [x.type, x.m?.id || x.r?.id, x.m?.read_at || x.r?.read_at, x.m?.body, x.m?.edited_at, x.m?.deleted_at]));
      if (s === sig && !first) return;
      sig = s; items = next; draw(first || keep);
    } catch (e) { if (first) list.innerHTML = `<div class="ct-empty">불러오기 실패: ${esc(e.message)}</div>`; }
  }

  /* ---------- 내 메시지 수정 · 삭제 ---------- */
  function menuSheet(title, bodyHtml) {
    return sheet(`<div class="modal modal-s ct-menu" role="dialog" aria-label="${esc(title)}">
      <div class="drawer-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
      <div class="drawer-body">${bodyHtml}</div></div>`, 'center');
  }
  const after = async () => { sig = ''; await refresh(); onActivity?.(); };
  function openMsgMenu(m) {
    const note = me === 'parent' ? '수정하면 \'수정됨\', 삭제하면 \'삭제된 메시지입니다\'로 표시됩니다.' : '수정 · 삭제해도 기록이 남지 않습니다.';
    const w = menuSheet('내 메시지', `
      <div class="ct-menu-view" id="cm-main">
        <p class="ct-menu-quote">${esc(m.body)}</p>
        <div class="ct-menu-acts">
          <button type="button" class="btn btn-gray" id="cm-edit">수정</button>
          <button type="button" class="btn btn-danger-soft" id="cm-del">삭제</button></div>
        <p class="hint">${note}</p></div>
      <div class="ct-menu-view" id="cm-ed" hidden>
        <textarea class="textarea" id="cm-text" rows="4" maxlength="1000">${esc(m.body)}</textarea>
        <p class="err" id="cm-err" role="alert"></p>
        <div class="ct-menu-acts"><button type="button" class="btn btn-gray" data-close>취소</button>
          <button type="button" class="btn btn-primary" id="cm-save">저장</button></div></div>
      <div class="ct-menu-view" id="cm-cf" hidden>
        <p class="ct-menu-ask">이 메시지를 삭제할까요?</p>
        <p class="hint">${me === 'parent' ? '대화방에는 \'삭제된 메시지입니다\'로 남습니다.' : '상대 화면에서도 완전히 사라집니다.'}</p>
        <p class="err" id="cm-err2" role="alert"></p>
        <div class="ct-menu-acts"><button type="button" class="btn btn-gray" data-close>취소</button>
          <button type="button" class="btn btn-danger" id="cm-yes">삭제</button></div></div>`);
    const show = (id) => $$('.ct-menu-view', w).forEach((v) => { v.hidden = v.id !== id; });
    $('#cm-edit', w).addEventListener('click', () => { show('cm-ed'); const t = $('#cm-text', w); t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    $('#cm-del', w).addEventListener('click', () => show('cm-cf'));
    $('#cm-save', w).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const v = $('#cm-text', w).value.trim();
      if (!v) return ($('#cm-err', w).textContent = '내용을 입력하세요.');
      if (v === m.body) return w.close();
      btn.disabled = true;
      try { await editMessage(m.id, v); w.close(); toast('수정했습니다'); await after(); }
      catch (x) { btn.disabled = false; $('#cm-err', w).textContent = '수정 실패: ' + x.message; }
    });
    $('#cm-yes', w).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await deleteMessage(m.id); w.close(); toast('삭제했습니다'); await after(); }
      catch (x) { btn.disabled = false; $('#cm-err2', w).textContent = '삭제 실패: ' + x.message; }
    });
  }
  function openRepMenu(r) {
    const w = menuSheet('보고서', `
      <p class="ct-menu-ask">채팅에서 이 보고서를 내릴까요?</p>
      <p class="hint">학부모 화면에서 사라집니다. 보고서 내용은 코칭 기록에 그대로 남아 있어, 상담 화면이나 학부모 안내 탭에서 다시 공개할 수 있습니다.</p>
      <p class="err" id="cm-err" role="alert"></p>
      <div class="ct-menu-acts"><button type="button" class="btn btn-gray" data-close>취소</button>
        <button type="button" class="btn btn-danger" id="cm-yes">채팅에서 삭제</button></div>`);
    $('#cm-yes', w).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await unpublishReport(r.id); w.close(); toast('채팅에서 내렸습니다'); await after(); }
      catch (x) { btn.disabled = false; $('#cm-err', w).textContent = '실패: ' + x.message; }
    });
  }

  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => {
    fit(); btn.disabled = !ta.value.trim();
    if (me === 'parent') $('#ct-ops', el).hidden = !isOpsQuestion(ta.value);
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && innerWidth > 820) { e.preventDefault(); $('#ct-form', el).requestSubmit(); } });
  $('#ct-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body || busy) return;
    busy = true; btn.disabled = true;
    // 바로 말풍선을 띄우고(전송 중 흐리게), 저장되면 실제 것으로 바뀜
    const tmp = { type: 'msg', at: new Date().toISOString(), m: { id: 'tmp', sender: me, author: meName, body, created_at: new Date().toISOString(), read_at: null, pending: true } };
    items = [...items, tmp]; draw(true);
    ta.value = ''; fit(); $('#ct-ops', el).hidden = true;
    try {
      await sendMessage(student.id, me, body, me === 'teacher' ? meName : null);
      sig = ''; await refresh(); list.scrollTop = list.scrollHeight; onActivity?.();
    } catch (x) {
      items = items.filter((x2) => x2 !== tmp); draw(true);
      ta.value = body; fit();
      toast('보내기 실패: ' + x.message);
    }
    busy = false; btn.disabled = !ta.value.trim();
  });

  refresh(true);
  const t = setInterval(() => { if (!alive()) return clearInterval(t); refresh(); }, 8000);
  return { refresh };
}
