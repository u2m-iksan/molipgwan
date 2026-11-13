// 채팅방 (학부모 앱 · 선생님 채팅 탭 공용)
//  내 말풍선 오른쪽 / 상대 왼쪽 · 보고서는 썸네일 말풍선(누르면 크게) · 날짜 구분선
//  읽음: 내 메시지 옆 "1"(안 읽음) / "읽음" · 8초마다 새 메시지 확인
//  학부모: 학원비 등 운영 문의로 보이면 카카오 채널 안내
import { $, $$, esc, toast } from '../ui.js';
import { short } from '../date.js';
import { mountReport, BADGES, BADGE_ORDER, badgesOf } from './report-card.js';
import { openReportViewer } from './report-viewer.js';
import { loadThread, sendMessage, markRead, markReportRead, isOpsQuestion, KEEP_DAYS } from '../data/chat.js';

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
              ${mine ? '' : `<span class="ct-meta">${!r.read_at ? '<em class="new">N</em>' : ''}<time>${timeOf(it.at)}</time></span>`}</div></div></div>`;
      }
      const m = it.m, mine = m.sender === me;
      const who = m.sender === 'teacher' ? (m.author ? `${esc(m.author)} 선생님` : '선생님') : '학부모';
      return `${sep}<div class="ct-row ${mine ? 'mine' : ''}${m.pending ? ' pending' : ''}" data-id="${m.pending ? 'tmp' : `m${esc(m.id)}`}">
        ${mine ? '' : `<div class="ct-av ${m.sender === 'parent' ? 'par' : ''}">${m.sender === 'parent' ? '부모' : 'U2M'}</div>`}
        <div class="ct-col">${mine ? '' : `<span class="ct-from">${who}</span>`}
          <div class="ct-b-wrap">${mine ? `<span class="ct-meta">${m.read_at ? '<em class="rd">읽음</em>' : '<em class="ur">1</em>'}<time>${timeOf(m.created_at)}</time></span>` : ''}
            <div class="ct-b">${esc(m.body)}</div>
            ${mine ? '' : `<span class="ct-meta"><time>${timeOf(m.created_at)}</time></span>`}</div></div></div>`;
    }).join('');
    $$('.ct-rep', list).forEach((b) => {
      const r = items[Number(b.dataset.r)].r;
      mountReport($('.msg-thumb-in', b), r, student);
      b.addEventListener('click', () => {
        openReportViewer(r, student, `${short(r.period_end || r.published_at.slice(0, 10))} 보고서`);
        if (me === 'parent' && !r.read_at) { r.read_at = new Date().toISOString(); markReportRead(r.id).then(() => onActivity?.()).catch(() => {}); draw(); }
      });
    });
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
      const s = JSON.stringify(next.map((x) => [x.type, x.m?.id || x.r?.id, x.m?.read_at || x.r?.read_at]));
      if (s === sig && !first) return;
      sig = s; items = next; draw(first || keep);
    } catch (e) { if (first) list.innerHTML = `<div class="ct-empty">불러오기 실패: ${esc(e.message)}</div>`; }
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
