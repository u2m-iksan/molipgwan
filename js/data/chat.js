// 학습 문의 채팅 (학부모 ↔ 선생님): 채팅방 = 학생 1명, 보고서도 같은 방에 표시
//  보관 1개월 (학부모에게는 1개월 지난 메시지·보고서 안 보임, 메시지는 앱 열 때 정리)
//  읽음: 상대가 방을 열면 read_at
import { sb } from '../sb.js';

const check = (r) => { if (r.error) throw r.error; return r.data; };
export const KEEP_DAYS = 30;
const since = () => new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();

// 학원 운영 문의(학원비 등)로 보이는 말 → 카카오 채널 안내
export const OPS_WORDS = ['학원비', '수강료', '교육비', '원비', '결제', '납부', '입금', '환불', '카드', '영수증', '계좌', '할인', '등록비', '교재비', '셔틀', '차량', '휴원', '퇴원', '수강 신청'];
export const isOpsQuestion = (t) => OPS_WORDS.some((w) => String(t || '').replace(/\s/g, '').includes(w.replace(/\s/g, '')));

export async function getKakao() {
  const r = check(await sb.from('app_settings').select('value').eq('key', 'kakao').maybeSingle());
  return r?.value?.url || '';
}
export async function saveKakao(url) {
  check(await sb.from('app_settings').upsert({ key: 'kakao', value: { url } }));
}

export function purgeOld() { return sb.rpc('purge_old_messages').then(() => {}, () => {}); }

// 한 방의 메시지 + 보고서 (시간순)
export async function loadThread(studentId) {
  const [msgs, reps] = await Promise.all([
    sb.from('messages').select('*').eq('student_id', studentId).gte('created_at', since()).order('created_at').then(check),
    sb.from('reports').select('*').eq('student_id', studentId).not('published_at', 'is', null).gte('published_at', since()).then(check),
  ]);
  const items = [
    ...msgs.map((m) => ({ type: 'msg', at: m.created_at, m })),
    ...reps.map((r) => ({ type: 'report', at: r.published_at, r })),
  ];
  return items.sort((a, b) => (a.at < b.at ? -1 : 1));
}

export async function sendMessage(studentId, sender, body, author = null) {
  return check(await sb.from('messages').insert({ student_id: studentId, sender, body: body.trim(), ...(author ? { author } : {}) }).select('*').single());
}

// 방을 열었을 때: 상대가 보낸 안 읽은 메시지 읽음 처리
export async function markRead(studentId, me) {
  const other = me === 'parent' ? 'teacher' : 'parent';
  check(await sb.from('messages').update({ read_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('sender', other).is('read_at', null));
}
export async function markReportRead(id) {
  const { error } = await sb.rpc('mark_report_read', { rid: id });
  if (error) throw error;
}

// 학부모: 자녀별 안 읽은 수 (선생님 메시지 + 안 읽은 보고서)
export async function loadParentUnread(ids) {
  const [msgs, reps] = await Promise.all([
    sb.from('messages').select('student_id').in('student_id', ids).eq('sender', 'teacher').is('read_at', null).gte('created_at', since()).then(check),
    sb.from('reports').select('student_id').in('student_id', ids).not('published_at', 'is', null).is('read_at', null).gte('published_at', since()).then(check),
  ]);
  const m = new Map();
  for (const r of [...msgs, ...reps]) m.set(r.student_id, (m.get(r.student_id) || 0) + 1);
  return m;
}

// 선생님: 방 목록 (최근 1개월 메시지가 있는 학생) + 안 읽은 수
export async function loadInbox() {
  const rows = check(await sb.from('messages').select('student_id,sender,body,created_at,read_at').gte('created_at', since()).order('created_at', { ascending: false }));
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.student_id)) m.set(r.student_id, { last: r, unread: 0 });
    if (r.sender === 'parent' && !r.read_at) m.get(r.student_id).unread++;
  }
  return m;
}
export async function countTeacherUnread() {
  return check(await sb.from('messages').select('id').eq('sender', 'parent').is('read_at', null).gte('created_at', since())).length;
}
