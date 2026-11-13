// #/consult?sid={학생ID}&on={상담 예정일}
import { esc } from '../ui.js';
import { sb } from '../sb.js';
import { renderConsult } from './consult.js';

export async function renderConsultPage(body) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const sid = q.get('sid'), on = q.get('on');
  const fail = (m) => { body.innerHTML = `<div class="card empty"><b>상담</b>${esc(m)}<br><a class="link-s" href="#/coaching">코칭으로</a></div>`; };
  if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(on || '')) return fail('잘못된 주소입니다.');
  body.innerHTML = '<div class="empty">불러오는 중</div>';
  const { data: stu, error } = await sb.from('students').select('id,name,grade,seat_no,status').eq('id', sid).maybeSingle();
  if (error) return fail('불러오기 실패: ' + error.message);
  if (!stu) return fail('학생을 찾을 수 없습니다.');
  window.scrollTo(0, 0);
  renderConsult(body, stu, on);
}
