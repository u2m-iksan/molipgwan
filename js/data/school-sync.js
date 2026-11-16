// 학사일정 앱(익산 U2M 학원 학사일정 · Apps Script)에서 방학 가져오기 (SQL 28) — 시험 기간은 안 가져옴
//  · 학사일정 앱 주소?json=1 → { schools, exams, vac: { neis, est, fixed } }
//  · 학사일정 앱에 등록된 학교 전부 (이름은 짧게 → 학생 정보의 학교와 맞음)
//  · 방학: 확정이 있으면 확정 → 없으면 고른 기준(나이스 등록 / 추정치) → 그것도 없으면 나머지 하나
//  · 가져온 일정은 source = 'sync' — 다시 가져오면 이것만 지우고 새로 넣음
import { sb } from '../sb.js';
import { SCHOOL_DAY } from './schedules.js';

const KEY = 'school_sync';
export const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwC-Bg0gqtitt4vhRXq4MtJBveajy496yeYDKbth6UKpEaOF5H8i1LlorgRUuW0jXh28w/exec';
const check = (r) => { if (r.error) throw r.error; return r.data; };

export async function getSync() {
  const { data } = await sb.from('app_settings').select('value').eq('key', KEY).maybeSingle();
  return { url: SYNC_URL, vac: 'neis', join: true, last: null, result: [], schools: [], custom: [], ...(data?.value || {}) };
}
async function saveSync(v) { check(await sb.from('app_settings').upsert({ key: KEY, value: v })); }
export async function setVacMode(vac) { const v = await getSync(); await saveSync({ ...v, vac }); }
export async function setJoin(join) { const v = await getSync(); await saveSync({ ...v, join }); }

// 익산고등학교 → 익산고 · 남성여자고등학교 → 남성여고 (띄어쓰기 무시)
export const schoolKey = (n) => String(n || '').replace(/\s+/g, '')
  .replace(/여자고등학교$/, '여고').replace(/여자중학교$/, '여중')
  .replace(/고등학교$/, '고').replace(/중학교$/, '중').replace(/초등학교$/, '초');

const SEASON = (s) => (s.endsWith('S') ? '여름방학' : '겨울방학');
const gapDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addD = (d, n) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

export async function runSync() {
  const cfg = await getSync();
  let res;
  try { res = await fetch(cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'json=1'); }
  catch { throw new Error('학사일정 앱이 아직 예전 화면만 줘요 · doGet 수정 후 "새 버전"으로 배포했는지 확인'); }
  let data = null; try { data = await res.json(); } catch { /* html */ }
  if (!data) throw new Error('학사일정 앱이 아직 json 을 안 줍니다 (MolipSync 추가 · 새 버전 배포 확인)');
  if (!data.ok) throw new Error('학사일정 앱 오류: ' + (data.error || ''));

  // 학사일정 앱에 있는 학교 전부 (이름은 짧게: 익산고등학교 → 익산고)
  const rows = [], result = [], fixedSegs = [];
  for (const sc of data.schools) {
    const school = schoolKey(sc.n);
    if (!school) continue;
    const of = (list) => (list || []).filter((x) => x.s === sc.c);
    // 방학: 시즌마다 확정 → 고른 기준 → 다른 기준
    const neis = of(data.vac.neis), est = of(data.vac.est), fixed = of(data.vac.fixed);
    const seasons = [...new Set([...neis, ...est, ...fixed].map((v) => v.season))].sort();
    const vr = [];   // 이 학교 방학 { sea, tag, a, b }
    for (const sea of seasons) {
      const fx = fixed.find((v) => v.season === sea);
      if (fx) {
        String(fx.segs).split(',').forEach((seg) => {
          const [a, b] = seg.split('~');
          if (a && b) { vr.push({ sea, tag: '확정', a, b }); fixedSegs.push({ school, a, b }); }
        });
        continue;
      }
      const first = cfg.vac === 'est' ? est : neis, second = cfg.vac === 'est' ? neis : est;
      const pick = first.filter((v) => v.season === sea).length ? first : second;
      const tag = pick === est ? '추정' : '나이스';
      pick.filter((v) => v.season === sea).forEach((v) => vr.push({ sea, tag, a: v.a, b: v.b }));
    }
    // 몰입관은 겨울방학 ~ 봄방학 사이 등교일도 방학으로 (사이 3주 이내면 하나로) — 학원 시간표가 중간에 학기용으로 안 바뀌게
    vr.sort((x, y) => x.a.localeCompare(y.a));
    const out = [];
    for (const v of vr) {
      const last = out[out.length - 1];
      if (cfg.join !== false && last && last.sea === v.sea && v.sea.endsWith('W') && gapDays(last.b, v.a) <= 21) {
        const from = addD(last.b, 1), to = addD(v.a, -1);
        if (from <= to) rows.push({ school, kind: '기타', title: SCHOOL_DAY, start_date: from, end_date: to, source: 'sync' });
        if (v.b > last.b) last.b = v.b;
        last.joined = true;
        if (v.tag === '확정') last.tag = '확정';
        continue;
      }
      out.push({ ...v });
    }
    out.forEach((v) => rows.push({ school, kind: '방학', title: `${v.joined ? '겨울·봄방학' : SEASON(v.sea)} · ${v.tag}`, start_date: v.a, end_date: v.b, source: 'sync' }));
    result.push({ school, full: sc.n, vac: out.length });
  }

  const ok = result.filter((r) => !r.error).map((r) => r.school);
  if (ok.length) {
    // 가져온 일정은 전부 새로 (예전에 가져온 시험도 같이 정리)
    const del = await sb.from('school_events').delete().eq('source', 'sync');
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
// 직접 추가한 학교 빼기 (잘못 넣은 이름 등)
export async function removeCustomSchool(name) {
  const v = await getSync();
  await saveSync({ ...v, custom: (v.custom || []).filter((c) => c !== name) });
}
// 목록에 없는 학교 → 직접 추가 (학사일정은 설정에서 따로 입력)
export async function addCustomSchool(name) {
  const k = schoolKey(name); if (!k) return;
  const v = await getSync();
  if ((v.schools || []).some((s) => s.k === k) || (v.custom || []).includes(k)) return;
  await saveSync({ ...v, custom: [...(v.custom || []), k] });
}
