// 지난 계획 기록 (학생 · 학부모 공용): 마감된 계획 최근 8개 — 기간 · 평균 이행도 · 항목별 최종 이행률
//  최종 이행률 = 상담 때 선생님이 확정한 값, 없으면 마지막 진행률
import { $, $$, esc, sheet, X } from '../ui.js';
import { short } from '../date.js';
import { sb } from '../sb.js';

const check = (r) => { if (r.error) throw r.error; return r.data || []; };
const md = (d) => short(d).replace(/\(.\)/, '');
const tone = (v) => (v == null ? '' : v >= 80 ? 'g' : v >= 50 ? '' : 'r');

async function loadHistory(studentId) {
  const plans = check(await sb.from('plans').select('id,start_date,due_date,author_role,status').eq('student_id', studentId)
    .eq('status', '마감').order('start_date', { ascending: false }).limit(8));
  if (!plans.length) return [];
  const items = check(await sb.from('plan_items').select('id,plan_id,subject,subject_detail,title,final_rate,academy,sort_order').in('plan_id', plans.map((p) => p.id)));
  const need = items.filter((i) => i.final_rate == null).map((i) => i.id);
  const prog = need.length ? check(await sb.from('plan_progress').select('item_id,on_date,pct').in('item_id', need)) : [];
  const lastPct = new Map();
  for (const r of prog.sort((a, b) => (a.on_date < b.on_date ? -1 : 1))) lastPct.set(r.item_id, r.pct);
  return plans.map((p) => {
    const its = items.filter((i) => i.plan_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({ ...i, rate: i.final_rate ?? lastPct.get(i.id) ?? null }));
    const vals = its.map((i) => i.rate).filter((v) => v != null);
    return { ...p, its, avg: vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : null };
  });
}

export function openHistory(student) {
  const w = sheet(`<div class="modal hist" role="dialog" aria-label="지난 계획 기록">
    <div class="drawer-head"><h3>지난 계획 기록</h3><button type="button" class="icon-btn" data-close aria-label="닫기">${X}</button></div>
    <div class="drawer-body" id="hs-body"><div class="empty">불러오는 중</div></div></div>`, 'center');
  loadHistory(student.id).then((list) => {
    const body = $('#hs-body', w);
    if (!list.length) { body.innerHTML = '<div class="empty">아직 끝난 계획이 없습니다.</div>'; return; }
    body.innerHTML = list.map((p, k) => `
      <section class="hs-plan${k === 0 ? ' open' : ''}">
        <button type="button" class="hs-h" aria-expanded="${k === 0}">
          <span class="hs-per">${md(p.start_date)} – ${p.due_date ? md(p.due_date) : ''}</span>
          ${p.author_role === '학생' ? '<span class="pill pill-gray">직접 세운 계획</span>' : ''}
          <span class="spacer"></span>
          <b class="hs-avg ${tone(p.avg)}">${p.avg != null ? `${p.avg}<i>%</i>` : '-'}</b>
          <em class="hs-chev" aria-hidden="true">›</em></button>
        <ul class="hs-its">${p.its.map((i) => `<li>
          <span class="hs-sub">${esc(i.subject)}${i.subject_detail ? `<small>${esc(i.subject_detail)}</small>` : ''}</span>
          <span class="hs-tt">${esc(i.title)}</span>
          <b class="hs-rate ${tone(i.rate)}">${i.rate != null ? `${i.rate}%` : '-'}</b></li>`).join('') || '<li class="hs-none">항목 없음</li>'}</ul>
      </section>`).join('') + '<p class="hint">최근 8개 계획까지 보입니다. 이행률은 상담 때 확정한 값입니다.</p>';
    $$('.hs-h', body).forEach((b) => b.addEventListener('click', () => {
      const s = b.closest('.hs-plan'); s.classList.toggle('open'); b.setAttribute('aria-expanded', s.classList.contains('open'));
    }));
  }).catch((e) => { $('#hs-body', w).innerHTML = `<div class="empty">불러오기 실패: ${esc(e.message)}</div>`; });
  return w;
}
