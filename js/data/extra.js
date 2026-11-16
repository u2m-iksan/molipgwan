// 계획 말고 한 공부 (SQL 35) — 학생이 짧게 적음 · 이행도 % 에는 안 들어감
import { sb } from '../sb.js';
function check(res) { if (res.error) throw res.error; return res.data; }
import { today } from '../date.js';

// 표가 아직 없으면(SQL 35 전) 빈 목록
export async function loadExtra(ids, from, to = null) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return [];
  let q = sb.from('extra_study').select('*').in('student_id', list).gte('on_date', from);
  if (to) q = q.lte('on_date', to);
  let r; try { r = await q; } catch { return []; }
  if (r.error) return [];
  return (r.data || []).sort((a, b) => (a.on_date < b.on_date ? -1 : a.on_date > b.on_date ? 1 : (a.created_at < b.created_at ? -1 : 1)));
}
export async function addExtra({ student_id, subject, note }) {
  return check(await sb.from('extra_study').insert({ student_id, subject, note, on_date: today() }).select('*').single());
}
export async function removeExtra(id) { check(await sb.from('extra_study').delete().eq('id', id)); }
