// 상담 화면 왼쪽 "상담 참고사항" 패널
//  ① 계획 이행도 (최근 마감 계획)  ② 과목별 순공시간 (학생 스톱워치)  ③ 최근 중간고사 성적 · 성적 피드백
// 학생 화면(스톱워치·진행률)과 성적 입력(5-6)을 만들면 데이터가 채워진다.
import { $, esc, X } from '../ui.js';
import { sb } from '../sb.js';
import { today, addDays, short } from '../date.js';

const EXAM_ORDER = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'];
const check = (r) => { if (r.error) throw r.error; return r.data || []; };
const empty = (m) => `<div class="ep-empty">${m}</div>`;
const dur = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const md = (d) => short(d).replace(/\(.\)/, '');

export async function refPanel(el, stu, { onClose } = {}) {
  el.innerHTML = `
    <div class="ep-head"><h4>상담 참고사항</h4><button type="button" class="icon-btn sm ep-x" aria-label="접기">${X}</button></div>
    <div class="ep-body">
      <section class="ep-sec" data-s="rate"><h5>계획 이행도</h5>${empty('불러오는 중')}</section>
      <section class="ep-sec" data-s="time"><h5>과목별 순공시간</h5>${empty('불러오는 중')}</section>
      <section class="ep-sec" data-s="exam"><h5>최근 중간고사</h5>${empty('불러오는 중')}</section>
      <section class="ep-sec" data-s="fb"><h5>성적 피드백</h5>${empty('등록된 피드백이 없습니다.')}</section>
    </div>`;
  $('.ep-x', el).addEventListener('click', () => onClose?.());
  const fill = (s, html) => { const sec = $(`[data-s=${s}]`, el); sec.innerHTML = sec.querySelector('h5').outerHTML + html; };
  const safe = (s, fn) => fn().catch((e) => fill(s, empty('불러오기 실패: ' + esc(e.message))));

  // ① 계획 이행도: 최근 마감 계획 4개 (평균 + 과목별)
  safe('rate', async () => {
    const plans = check(await sb.from('plans').select('id,start_date,due_date,status').eq('student_id', stu.id)
      .eq('status', '마감').order('start_date', { ascending: false }).limit(4));
    if (!plans.length) return fill('rate', empty('마감된 계획이 없습니다.'));
    const items = check(await sb.from('plan_items').select('plan_id,subject,final_rate').in('plan_id', plans.map((p) => p.id)));
    fill('rate', `<ul class="ep-rates">${plans.map((p) => {
      const its = items.filter((i) => i.plan_id === p.id && i.final_rate != null);
      const avg = its.length ? Math.round(its.reduce((a, i) => a + i.final_rate, 0) / its.length) : null;
      const low = avg != null && avg <= 49 ? 'low' : '';
      return `<li>
        <div class="ep-row"><span class="ep-date">${md(p.start_date)} ~ ${p.due_date ? md(p.due_date) : ''}</span>
          <b class="${low}">${avg != null ? avg + '%' : '-'}</b></div>
        <span class="ep-bar"><i class="${low}" style="width:${avg ?? 0}%"></i></span>
        ${its.length ? `<p class="ep-subs">${its.map((i) => `${esc(i.subject)} <b class="${i.final_rate <= 49 ? 'low' : ''}">${i.final_rate}</b>`).join(' · ')}</p>` : ''}
      </li>`;
    }).join('')}</ul>`);
  });

  // ② 과목별 순공시간: 진행 중인 계획 기간 (없으면 최근 7일)
  safe('time', async () => {
    const open = check(await sb.from('plans').select('start_date').eq('student_id', stu.id).neq('status', '마감').limit(1))[0];
    const from = open?.start_date && open.start_date <= today() ? open.start_date : addDays(today(), -6);
    const rows = check(await sb.from('study_sessions').select('subject,net_seconds,study_date').eq('student_id', stu.id).gte('study_date', from));
    const by = new Map();
    for (const r of rows) if (r.net_seconds) by.set(r.subject, (by.get(r.subject) || 0) + r.net_seconds);
    const list = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const total = list.reduce((a, [, s]) => a + s, 0);
    const max = list[0]?.[1] || 1;
    fill('time', `<p class="ep-label">${md(from)} ~ 오늘${total ? ` · 합계 ${dur(total)}` : ''}</p>
      ${list.length ? `<ul class="ep-times">${list.map(([s, sec]) => `
        <li><span class="ep-sub">${esc(s)}</span><span class="ep-bar"><i style="width:${Math.round((sec / max) * 100)}%"></i></span><b>${dur(sec)}</b></li>`).join('')}</ul>`
        : empty('스톱워치 기록이 없습니다.')}`);
  });

  // ③ 최근 중간고사
  safe('exam', async () => {
    const exams = check(await sb.from('exams').select('*').eq('student_id', stu.id));
    const ex = exams.filter((e) => /중간$/.test(e.exam_type))
      .sort((a, b) => (b.school_year - a.school_year) || (EXAM_ORDER.indexOf(b.exam_type) - EXAM_ORDER.indexOf(a.exam_type)))[0];
    if (!ex) return fill('exam', empty('등록된 성적이 없습니다.'));
    const scores = check(await sb.from('exam_scores').select('*').eq('exam_id', ex.id));
    fill('exam', `<p class="ep-label">${esc(ex.school_year)} ${esc(ex.exam_type)} · ${esc(ex.grade)}</p>
      ${scores.length ? `<table class="ep-tbl"><thead><tr><th>과목</th><th>점수</th><th>등급</th></tr></thead><tbody>
        ${scores.map((s) => `<tr><td>${esc(s.subject)}${s.subject_detail ? `<small>${esc(s.subject_detail)}</small>` : ''}</td>
          <td>${s.raw_score ?? '-'}</td><td>${s.grade_level ?? s.achievement ?? '-'}</td></tr>`).join('')}
      </tbody></table>` : empty('입력된 과목이 없습니다.')}`);
  });
}
