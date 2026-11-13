// 상담 화면 왼쪽 성적 패널: 가장 최근 중간고사 성적 + 성적 피드백
// 성적 입력(5-6) 화면을 만들면 피드백 영역을 채운다.
import { $, esc, X } from '../ui.js';
import { sb } from '../sb.js';

const ORDER = ['1학기 중간', '1학기 기말', '2학기 중간', '2학기 기말'];

export async function examPanel(el, stu, { onClose } = {}) {
  el.innerHTML = `
    <div class="ep-head"><h4>성적</h4><button type="button" class="icon-btn sm ep-x" aria-label="성적 접기">${X}</button></div>
    <div class="ep-body"><div class="ep-empty">불러오는 중</div></div>`;
  $(".ep-x", el).addEventListener('click', () => onClose?.());

  const body = $(".ep-body", el);
  try {
    const { data: exams, error } = await sb.from('exams').select('*').eq('student_id', stu.id);
    if (error) throw error;
    const mids = (exams || []).filter((e) => /중간$/.test(e.exam_type))
      .sort((a, b) => (b.school_year - a.school_year) || (ORDER.indexOf(b.exam_type) - ORDER.indexOf(a.exam_type)));
    const ex = mids[0];
    let scores = [];
    if (ex) {
      const r = await sb.from('exam_scores').select('*').eq('exam_id', ex.id);
      if (r.error) throw r.error;
      scores = r.data || [];
    }
    body.innerHTML = `
      <section class="ep-sec">
        <h5>최근 중간고사</h5>
        ${ex ? `<p class="ep-label">${esc(ex.school_year)} ${esc(ex.exam_type)} · ${esc(ex.grade)}</p>
          ${scores.length ? `<table class="ep-tbl"><thead><tr><th>과목</th><th>점수</th><th>등급</th></tr></thead><tbody>
            ${scores.map((s) => `<tr><td>${esc(s.subject)}${s.subject_detail ? `<small>${esc(s.subject_detail)}</small>` : ''}</td>
              <td>${s.raw_score ?? '-'}</td><td>${s.grade_level ?? s.achievement ?? '-'}</td></tr>`).join('')}
          </tbody></table>` : '<div class="ep-empty">입력된 과목이 없습니다.</div>'}`
        : '<div class="ep-empty">등록된 성적이 없습니다.</div>'}
      </section>
      <section class="ep-sec">
        <h5>성적 피드백</h5>
        <div class="ep-empty">등록된 피드백이 없습니다.</div>
      </section>`;
  } catch (e) {
    body.innerHTML = `<div class="ep-empty">불러오기 실패: ${esc(e.message)}</div>`;
  }
}
