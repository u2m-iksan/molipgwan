/**
 * 몰입관 앱으로 시험 · 방학 내보내기 (U2M 학사일정 앱)
 *
 * - 주소 뒤에 ?json=1 을 붙이면 학교별 시험 기간과 방학을 JSON으로 줘요. (보기 전용, 누구나)
 *   예: https://script.google.com/macros/s/…/exec?json=1
 * - 캘린더에서 고치기 · 숨기기 · 추가한 것(수정내역)도 반영해요.
 * - 방학은 세 가지를 같이 줘요: 나이스 등록(neis) / 추정치(est: 방학식 다음날 ~ 개학 전날) / 확정(fixed: 방학확정 시트)
 * - 수학시험일은 주지 않아요.
 *
 * 넣는 법
 *  1) Apps Script 편집기에서 파일 + → 스크립트 → 이름 'MolipSync' → 이 내용 붙여넣기 → 저장
 *  2) 캘린더 파일(doGet 있는 파일)의 doGet 맨 윗줄에 아래 한 줄 추가
 *       function doGet(e) {
 *         if (e && e.parameter && e.parameter.json) return molipJson_();
 *         … (원래 내용 그대로)
 *  3) 배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포  (주소는 그대로예요)
 */
function molipJson_() {
  let out;
  try { out = molipData_(); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function molipData_() {
  const { on, names } = onSchools_();
  let events = buildOrigEvents_(on);

  // 캘린더에서 고친 것 덮어쓰기 (edit: 원본 고침 / hide: 원본 숨김 / add: 직접 추가)
  const es = SpreadsheetApp.getActive().getSheetByName(CAL.EDIT_SHEET);
  if (es) {
    const byId = {};
    events.forEach(e => byId[e.i] = e);
    readTable_(es, EDIT_HEADER.length).forEach(r => {
      if (!r[0]) return;
      const type = String(r[1]), target = String(r[2] || '');
      const ev = { i: String(r[0]), s: String(r[3]), t: String(r[5]).trim(), a: ymd_(r[6]), b: ymd_(r[7]), c: Number(r[8]), g: String(r[9] || '') };
      if (type === 'hide') { if (byId[target]) byId[target].hidden = true; return; }
      if (type === 'edit' && byId[target]) { Object.assign(byId[target], { t: ev.t, a: ev.a, b: ev.b, c: ev.c, g: ev.g }); return; }
      if (type === 'add' || type === 'edit') { if (on[ev.s]) events.push(ev); }
    });
    events = events.filter(e => !e.hidden);
  }

  const season = (a) => {
    const y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7));
    if (m >= 6 && m <= 9) return y + 'S';
    return (m >= 3 ? y : y - 1) + 'W';
  };
  const dn = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
  const ds = (n) => Utilities.formatDate(new Date(n * 864e5), 'UTC', 'yyyy-MM-dd');

  // 시험: 같은 학교 · 같은 이름이 며칠 안에 이어지면 한 기간 (학년별로 나뉜 것도 합침)
  const exams = [];
  events.filter(e => e.c === 0).sort((x, y) => (x.s + x.t + x.a).localeCompare(y.s + y.t + y.a)).forEach(e => {
    const last = exams[exams.length - 1];
    if (last && last.s === e.s && last.t === e.t && dn(e.a) - dn(last.b) <= 4) { if (e.b > last.b) last.b = e.b; return; }
    exams.push({ s: e.s, t: e.t, a: e.a, b: e.b });
  });

  // 방학 · 나이스 등록
  const neis = events.filter(e => e.c === 1).map(e => ({ s: e.s, season: season(e.a), t: e.t, a: e.a, b: e.b }));

  // 방학 · 추정: 방학식(종업식) 다음날 ~ 그 뒤 첫 개학 전날
  const est = [];
  const bySchool = {};
  events.filter(e => e.c === 2).forEach(e => (bySchool[e.s] = bySchool[e.s] || []).push(e));
  Object.keys(bySchool).forEach(s => {
    const list = bySchool[s].sort((x, y) => x.a.localeCompare(y.a));
    const ends = list.filter(e => /방학식|종업식/.test(e.t));
    const starts = list.filter(e => /개학/.test(e.t));
    const seen = {};
    ends.forEach(e => {
      const st = starts.find(x => dn(x.a) > dn(e.a) && dn(x.a) - dn(e.a) <= 90);
      if (!st) return;
      const a = ds(dn(e.b) + 1), b = ds(dn(st.a) - 1), sea = season(a);
      if (b < a || seen[sea]) return;
      seen[sea] = true;
      est.push({ s, season: sea, a, b });
    });
  });

  // 방학 · 확정 (방학확정 시트)
  let fixed = [];
  try { fixed = JSON.parse(getVacations()).map(v => ({ s: v.s, season: v.season, segs: v.segs })); } catch (err) { fixed = []; }

  const schools = Object.keys(on).map(c => ({ c, n: names[c] || '' }));
  return { ok: true, at: new Date().toISOString(), schools, exams, vac: { neis, est, fixed } };
}
