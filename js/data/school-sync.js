// 학사일정 앱(익산 U2M 학원 학사일정 · Apps Script)에서 시험 · 방학 가져오기 (SQL 28)
//  · 학사일정 앱 주소?json=1 → { schools, exams, vac: { neis, est, fixed } }
//  · 학생 정보의 학교(익산고)와 학사일정 앱의 학교(익산고등학교)를 맞춰서 학생 학교 것만
//  · 방학: 확정이 있으면 확정 → 없으면 고른 기준(나이스 등록 / 추정치) → 그것도 없으면 나머지 하나
//  · 가져온 일정은 source = 'sync' — 다시 가져오면 이것만 지우고 새로 넣음
import { sb } from '../sb.js';

const KEY = 'school_sync';
export const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwC-Bg0gqtitt4vhRXq4MtJBveajy496yeYDKbth6UKpEaOF5H8i1LlorgRUuW0jXh28w/exec';
const check = (r) => { if (r.error) throw r.error; return r.data; };

export async function getSync() {
  const { data } = await sb.from('app_settings').select('value').eq('key', KEY).maybeSingle();
  return { url: SYNC_URL, vac: 'neis', last: null, result: [], schools: [], custom: [], ...(data?.value || {}) };
}
async function saveSync(v) { check(await sb.from('app_settings').upsert({ key: KEY, value: v })); }
export async function setVacMode(vac) { const v = await getSync(); await saveSync({ ...v, vac }); }

// 익산고등학교 → 익산고 · 남성여자고등학교 → 남성여고 (띄어쓰기 무시)
export const schoolKey = (n) => String(n || '').replace(/\s+/g, '')
  .replace(/여자고등학교$/, '여고').replace(/여자중학교$/, '여중')
  .replace(/고등학교$/, '고').replace(/중학교$/, '중').replace(/초등학교$/, '초');

const SEASON = (s) => (s.endsWith('S') ? '여름방학' : '겨울방학');

export async function runSync() {
  const cfg = await getSync();
  let res;
  try { res = await fetch(cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'json=1'); }
  catch { throw new Error('학사일정 앱이 아직 예전 화면만 줘요 · doGet 수정 후 "새 버전"으로 배포했는지 확인'); }
  let data = null; try { data = await res.json(); } catch { /* html */ }
  if (!data) throw new Error('학사일정 앱이 아직 json 을 안 줍니다 (MolipSync 추가 · 새 버전 배포 확인)');
  if (!data.ok) throw new Error('학사일정 앱 오류: ' + (data.error || ''));

  // 학생 학교
  const { data: stu } = await sb.from('students').select('school,status').neq('status', '퇴원');
  const mine = [...new Set((stu || []).map((s) => (s.school || '').trim()).filter(Boolean))];
  const byKey = new Map(data.schools.map((s) => [schoolKey(s.n), s]));

  const rows = [], result = [], fixedSegs = [];
  for (const school of mine) {
    const sc = byKey.get(schoolKey(school));
    if (!sc) { result.push({ school, error: '학사일정 앱에 없음 (수집 체크 확인)' }); continue; }
    const of = (list) => (list || []).filter((x) => x.s === sc.c);
    const exams = of(data.exams);
    exams.forEach((e) => rows.push({ school, kind: '시험', title: e.t, start_date: e.a, end_date: e.b, source: 'sync' }));
    // 방학: 시즌마다 확정 → 고른 기준 → 다른 기준
    const neis = of(data.vac.neis), est = of(data.vac.est), fixed = of(data.vac.fixed);
    const seasons = [...new Set([...neis, ...est, ...fixed].map((v) => v.season))].sort();
    let nv = 0;
    for (const sea of seasons) {
      const fx = fixed.find((v) => v.season === sea);
      if (fx) {
        String(fx.segs).split(',').forEach((seg) => {
          const [a, b] = seg.split('~');
          if (a && b) { rows.push({ school, kind: '방학', title: `${SEASON(sea)} · 확정`, start_date: a, end_date: b, source: 'sync' }); fixedSegs.push({ school, a, b }); nv++; }
        });
        continue;
      }
      const first = cfg.vac === 'est' ? est : neis, second = cfg.vac === 'est' ? neis : est;
      const pick = first.filter((v) => v.season === sea).length ? first : second;
      const tag = pick === est ? '추정' : '나이스';
      pick.filter((v) => v.season === sea).forEach((v) => {
        rows.push({ school, kind: '방학', title: `${SEASON(sea)} · ${tag}`, start_date: v.a, end_date: v.b, source: 'sync' }); nv++;
      });
    }
    result.push({ school, full: sc.n, exams: exams.length, vac: nv });
  }

  const ok = result.filter((r) => !r.error).map((r) => r.school);
  if (ok.length) {
    const del = await sb.from('school_events').delete().eq('source', 'sync').in('school', ok);
    if (del.error) throw new Error(/source/.test(del.error.message) ? 'SQL 28을 먼저 실행해 주세요' : del.error.message);
    if (rows.length) check(await sb.from('school_events').insert(rows));
    // 방학 확정이 생기면: 그 기간과 겹치는 직접 입력 방학도 확정으로 정리 (지움)
    for (const f of fixedSegs) {
      await sb.from('school_events').delete().eq('school', f.school).eq('kind', '방학').neq('source', 'sync')
        .lte('start_date', f.b).gte('end_date', f.a);
    }
  }
  // 학교 목록 (학생 등록 때 고르기용): 학사일정 앱에서 수집 켜진 학교 전부
  const schools = data.schools.map((s) => ({ k: schoolKey(s.n), n: s.n })).sort((a, b) => a.k.localeCompare(b.k, 'ko'));
  await saveSync({ ...cfg, last: new Date().toISOString(), result, schools });
  return result;
}

// 선생님 앱 열 때 하루 한 번 (조용히)
let tried = false;
export async function autoSync() {
  if (tried) return; tried = true;
  try {
    const cfg = await getSync();
    if (cfg.last && Date.now() - new Date(cfg.last) < 20 * 3600e3) return;
    await runSync();
  } catch { /* 다음에 */ }
}

/* ---------- 학교 목록 (학생 등록 · 수정 때 고르기) ---------- */
// [{ k: '익산고', n: '익산고등학교', auto: true }] + 직접 추가한 학교 [{ k, n: k, auto: false }]
export async function schoolList() {
  const v = await getSync();
  const out = (v.schools || []).map((s) => ({ ...s, auto: true }));
  for (const c of v.custom || []) if (!out.some((s) => s.k === schoolKey(c))) out.push({ k: c, n: c, auto: false });
  return out.sort((a, b) => a.k.localeCompare(b.k, 'ko'));
}
// 목록에 없는 학교 → 직접 추가 (학사일정은 설정에서 따로 입력)
export async function addCustomSchool(name) {
  const k = schoolKey(name); if (!k) return;
  const v = await getSync();
  if ((v.schools || []).some((s) => s.k === k) || (v.custom || []).includes(k)) return;
  await saveSync({ ...v, custom: [...(v.custom || []), k] });
}
