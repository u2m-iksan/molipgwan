// 학부모 보고: 한 주 단위 상담 · 보고 현황
//  상태 = 상담 전 · 작성 중 · 공개(미전송) · 전송 완료 / 행 누르면 보고서 미리보기, 상담 화면으로 이동
import { $, $$, esc, sheet, X } from '../ui.js';
import { today, mondayOf, addDays, short, DOW, hm } from '../date.js';
import { loadWeekReports } from '../data/coaching.js';
import { mountReport, badgesOf } from '../views/report-card.js';

const md = (d) => short(d).replace(/\(.\)/, '');
const CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const STATE = {
  wait: ['상담 전', 'pill-gray'], miss: ['미상담', 'pill-red'], draft: ['작성 중', 'pill-orange'], pub: ['공개 · 미전송', 'pill-blue'], sent: ['전송 완료', 'pill-green'], none: ['보고 없음', 'pill-gray'],
};

export async function renderReports(body, { week } = {}) {
  const thisMon = mondayOf(today());
  const mon = week || thisMon;
  const st = { f: '전체' };
  body.innerHTML = `
    <div class="t-head"><h2>학부모 보고</h2>
      <div class="spacer"></div>
      <div class="wk-nav"><button type="button" class="icon-btn sm" id="rp-prev" aria-label="이전 주">${CHEV_L}</button>
        <span>${mon === thisMon ? '이번 주 ' : ''}${md(mon)} – ${md(addDays(mon, 6))}</span>
        <button type="button" class="icon-btn sm" id="rp-next" aria-label="다음 주"${mon >= thisMon ? ' disabled' : ''}>${CHEV_R}</button></div>
    </div>
    <div id="rp-sum" class="rp-sum"></div>
    <div class="t-tools"><div class="seg" id="rp-f"></div></div>
    <div class="card table-card"><div class="table-wrap" id="rp-tbl"><div class="empty">불러오는 중</div></div></div>`;
  $('#rp-prev').addEventListener('click', () => renderReports(body, { week: addDays(mon, -7) }));
  $('#rp-next').addEventListener('click', () => renderReports(body, { week: addDays(mon, 7) }));

  let d;
  try { d = await loadWeekReports(mon); }
  catch (e) { $('#rp-tbl').innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; return; }

  const rows = d.students.map((s) => {
    const c = d.coachings.get(s.id) || null, r = c ? d.reports.get(c.id) || null : null, slot = d.slots.get(s.id) || null;
    const on = c?.scheduled_on || (slot ? addDays(mon, slot.weekday - 1) : null);
    const state = !c ? (slot ? (on < today() ? 'miss' : 'wait') : 'none') : !r ? 'draft' : r.sent_at ? 'sent' : r.published_at ? 'pub' : 'draft';
    const rates = (r?.rates || []).filter((x) => x.rate != null);
    const avg = rates.length ? Math.round(rates.reduce((a, x) => a + x.rate, 0) / rates.length) : null;
    return { s, c, r, slot, on, state, avg };
  }).filter((x) => x.slot || x.c);
  const ORDER = { miss: 0, pub: 1, draft: 2, wait: 3, sent: 4, none: 5 };
  rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.on || '').localeCompare(b.on || '') || (Number(a.s.seat_no) || 999) - (Number(b.s.seat_no) || 999));

  const n = (k) => rows.filter((x) => x.state === k).length;
  $('#rp-sum').innerHTML = [['상담 대상', rows.length], ['상담 완료', rows.filter((x) => x.c).length], ['공개 · 미전송', n('pub')], ['전송 완료', n('sent')], ['학부모 읽음', rows.filter((x) => x.r?.read_at).length]]
    .map(([k, v], i) => `<div class="${i === 2 && v ? 'hot' : ''}"><span>${k}</span><b class="cu">${v}</b></div>`).join('');

  const FILTERS = [['전체', () => true], ['미전송', (x) => x.state === 'pub' || x.state === 'draft'], ['상담 전', (x) => x.state === 'wait' || x.state === 'miss'], ['전송 완료', (x) => x.state === 'sent']];
  const seg = $('#rp-f');
  seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.f = b.dataset.v; draw(); } });

  function draw() {
    seg.innerHTML = FILTERS.map(([k, fn]) => `<button type="button" data-v="${k}" class="${st.f === k ? 'on' : ''}">${k} <span>${rows.filter(fn).length}</span></button>`).join('');
    const list = rows.filter(FILTERS.find(([k]) => k === st.f)[1]);
    if (!list.length) { $('#rp-tbl').innerHTML = '<div class="empty">해당하는 학생이 없습니다.</div>'; return; }
    $('#rp-tbl').innerHTML = `<table class="tbl rp-tbl"><thead><tr>
        <th>자리</th><th>이름</th><th>상담일</th><th>구분</th><th>평균 이행도</th><th>배지</th><th>상태</th><th>학부모</th><th></th></tr></thead>
      <tbody>${list.map((x, i) => {
        const [lbl, cls] = STATE[x.state];
        const badges = x.r ? badgesOf(x.r) : [];
        return `<tr data-i="${rows.indexOf(x)}" class="${x.r ? 'click' : ''}">
          <td><span class="seat">${esc(x.s.seat_no || '-')}</span></td>
          <td><b>${esc(x.s.name)}</b> <small class="sub">${esc(x.s.grade || '')}</small></td>
          <td class="rp-n">${x.on ? `${md(x.on)}(${DOW[(new Date(x.on + 'T00:00:00Z').getUTCDay() || 7)]})` : '-'}${x.slot && !x.c ? ` <small class="sub">${hm(x.slot.start_time)}</small>` : ''}</td>
          <td>${x.c ? esc(x.c.kind || '') : '-'}</td>
          <td class="rp-n">${x.avg != null ? `<b class="${x.avg >= 90 ? 'g' : x.avg < 50 ? 'r' : ''}">${x.avg}%</b>` : '-'}</td>
          <td>${badges.length ? badges.map((b) => `<span class="rp-bd">${esc(b)}</span>`).join('') : '-'}</td>
          <td><span class="pill ${cls}">${lbl}</span></td>
          <td class="rp-n">${x.r?.published_at ? (x.r.read_at ? `<span class="rp-read">읽음 <small>${new Date(new Date(x.r.read_at).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ')}</small></span>` : '<span class="rp-unread">안 읽음</span>') : '-'}</td>
          <td class="act">${x.on ? `<a class="btn btn-gray btn-sm" href="#/consult?sid=${esc(x.s.id)}&on=${x.on}">${x.c ? '열기' : '상담'}</a>` : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
    $$('tr.click', $('#rp-tbl')).forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const x = rows[Number(tr.dataset.i)];
      const m = sheet(`<div class="modal modal-lg" role="dialog" aria-label="보고서">
        <div class="drawer-head"><h3>${esc(x.s.name)} <span class="h-sub">${md(x.on)} 보고서</span></h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
        <div class="drawer-body"><div id="rp-view"></div></div></div>`, 'center');
      mountReport($('#rp-view', m), x.r, x.s);
    }));
  }
  draw();
}
