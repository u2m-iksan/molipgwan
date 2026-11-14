// 보고서 전송 (3단계 · 선택): 공개 → 안내 문자 복사 → 전송 완료 표시
//  상담 화면 3단계와 학부모 안내 탭(보고서 칸)에서 같이 씀
import { kickPush } from '../push.js';
import { $, esc, toast, flashDone, celebrate } from '../ui.js';
import { saveReport, noticeText } from '../data/coaching.js';

const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const stamp = (iso) => kst(iso).slice(5, 16).replace('-', '/').replace('T', ' ');

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select();
    try { const ok = document.execCommand('copy'); t.remove(); return ok; } catch { t.remove(); return false; }
  }
}

export const sendState = (r) => (!r ? 'none' : r.sent_at ? 'sent' : r.published_at ? 'pub' : 'draft');

// el 에 전송 칸을 그림. getReport(): 최신 보고서(작성 중 내용 포함), onChange(r): 저장된 뒤
export function mountSend(el, { report, student, getReport, beforePublish, onChange, compact = false }) {
  const r = report;
  function draw() {
    const s = sendState(r);
    const steps = [
      ['pub', '공개', r.published_at ? stamp(r.published_at) : ''],
      ['copy', '안내 문자 보내기', ''],
      ['sent', '전송 완료 표시', r.sent_at ? stamp(r.sent_at) : ''],
    ];
    const doneN = s === 'sent' ? 3 : s === 'pub' ? 1 : 0;
    el.innerHTML = `
      <div class="sd${compact ? ' compact' : ''}">
        <ol class="sd-flow">${steps.map(([k, label, at], i) => `<li class="${i < doneN ? 'done' : i === doneN ? 'cur' : ''}"><i>${i < doneN ? '✓' : i + 1}</i><span>${label}${at ? `<small>${at}</small>` : ''}</span></li>`).join('')}</ol>
        <div class="sd-msg"><div class="sd-msg-h"><span>학부모 안내 문자</span><button type="button" class="link-s" id="sd-copy">복사</button></div>
          <p>${esc(noticeText(student, r))}</p></div>
        ${r.published_at ? `<p class="sd-read">${r.read_at ? `<b class="ok">학부모 읽음</b> · ${stamp(r.read_at)}` : '<b>학부모 아직 안 읽음</b>'}</p>` : ''}
        <p class="err" id="sd-err" role="alert"></p>
        <div class="sd-acts">
          ${s === 'draft' ? '<button type="button" class="btn btn-primary btn-sm" id="sd-pub">공개하기</button>'
            : s === 'pub' ? '<button type="button" class="btn btn-primary btn-sm" id="sd-copy2">안내 문자 복사</button><button type="button" class="btn btn-gray btn-sm" id="sd-sent">전송 완료로 표시</button>'
              : '<button type="button" class="btn btn-gray btn-sm" id="sd-copy2">안내 문자 다시 복사</button>'}
        </div>
        ${s !== 'sent' ? '<p class="sd-hint">① 공개하면 학부모 앱에 보고서가 열립니다. ② 안내 문자를 복사해 카톡·문자로 보내고 ③ 전송 완료로 표시하세요.</p>' : ''}
      </div>`;
    const doCopy = async (b) => { if (await copyText(noticeText(student, r))) { flashDone(b); toast('안내 문자를 복사했습니다'); } else toast('복사 실패'); };
    $('#sd-copy', el).addEventListener('click', (e) => doCopy(e.currentTarget));
    $('#sd-copy2', el)?.addEventListener('click', (e) => doCopy(e.currentTarget));
    $('#sd-pub', el)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget, err = $('#sd-err', el); err.textContent = '';
      const cur = getReport ? getReport() : r;
      if (!cur.summary && !(cur.subject_feedback || []).length && !cur.is_absent) return (err.textContent = '2단계에서 피드백이나 총평을 먼저 작성하세요.');
      btn.disabled = true;
      try {
        const patch = { ...(beforePublish ? beforePublish() : {}), published_at: new Date().toISOString() };
        Object.assign(r, await saveReport(r.coaching_id, patch));
        kickPush();   // 학부모에게 '보고서 올라왔어요' 알림
        celebrate('', '', 950);
        draw(); onChange?.(r);
      } catch (x) { err.textContent = '공개 실패: ' + x.message; btn.disabled = false; }
    });
    $('#sd-sent', el)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { Object.assign(r, await saveReport(r.coaching_id, { sent_at: new Date().toISOString() })); celebrate('', '', 950); draw(); onChange?.(r); }
      catch (x) { $('#sd-err', el).textContent = '저장 실패: ' + x.message; btn.disabled = false; }
    });
  }
  draw();
  return { redraw: draw };
}
