// Supabase Edge Function · neis-sync
//  나이스(NEIS)에서 학생들 학교의 학사일정을 가져와 school_events 에 채움
//  · 학교: 학생 정보의 학교 이름(예: 익산고) → 전북 학교 정식 이름(익산고등학교)으로 찾아 neis_schools 에 저장
//  · 가져오는 것: 방학 · 시험(중간·기말 고사) · 휴업(재량휴업 · 공휴일 등 평일 쉬는 날)
//  · 직접 입력한 일정(source = 'manual')은 건드리지 않음. 자동으로 가져온 것만 지우고 다시 채움
//  · 인증키는 neis_config 에 (설정 화면에서 입력) — 코드에는 없음
//  · 누가 불러도 '가져오기'만 하므로 JWT 확인 꺼도 됨. 응답: { ok, schools: [{ school, full_name, added, error }] }
import { createClient } from "npm:@supabase/supabase-js@2";

function secretKey() {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); if (k.default) return k.default as string; } catch { /* 없음 */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const HUB = "https://open.neis.go.kr/hub/";
type Row = Record<string, string>;

// 나이스 API 한 종류를 끝까지 (1000개씩)
async function neis(api: string, key: string, params: Record<string, string>): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ KEY: key, Type: "json", pIndex: String(page), pSize: "1000", ...params });
    const res = await fetch(HUB + api + "?" + q);
    const body = await res.json();
    if (body.RESULT) {   // 데이터 없음(INFO-200) 또는 오류
      if (body.RESULT.CODE === "INFO-200") break;
      throw new Error(`나이스: ${body.RESULT.MESSAGE} (${body.RESULT.CODE})`);
    }
    const part = body[api];
    const rows: Row[] = part?.[1]?.row || [];
    out.push(...rows);
    const total = Number(part?.[0]?.head?.[0]?.list_total_count || 0);
    if (out.length >= total || rows.length < 1000) break;
  }
  return out;
}

// 익산고 → 익산고등학교 · 익산중 → 익산중학교 · 남성여고 → 남성여자고등학교
function fullName(n: string) {
  n = n.replace(/\s+/g, "");
  if (/학교$/.test(n)) return n;
  if (/여고$/.test(n)) return n.slice(0, -2) + "여자고등학교";
  if (/여중$/.test(n)) return n.slice(0, -2) + "여자중학교";
  if (/고$/.test(n)) return n + "등학교";
  if (/중$/.test(n)) return n + "학교";
  if (/초$/.test(n)) return n + "등학교";
  return n;
}

async function findSchool(name: string, key: string, office: string) {
  const full = fullName(name);
  for (const q of [full, name]) {
    const rows = await neis("schoolInfo", key, { ATPT_OFCDC_SC_CODE: office, SCHUL_NM: q });
    if (!rows.length) continue;
    const exact = rows.filter((r) => r.SCHUL_NM === full);
    const local = (exact.length ? exact : rows).filter((r) => /익산/.test(r.ORG_RDNMA || "") || /익산/.test(r.LCTN_SC_NM || ""));
    const pick = exact.length === 1 ? exact[0] : local.length === 1 ? local[0] : rows.length === 1 ? rows[0] : null;
    if (pick) return { office: pick.ATPT_OFCDC_SC_CODE, code: pick.SD_SCHUL_CODE, full_name: pick.SCHUL_NM };
  }
  return null;
}

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const dayNum = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / 86400000);
const isWeekend = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 0 || w === 6; };

// 나이스 하루하루 행 → 방학 · 시험 · 휴업 기간으로 묶기
function toEvents(rows: Row[]) {
  type Ev = { kind: string; title: string; start: string; end: string };
  const days: { d: string; kind: string; title: string }[] = [];
  for (const r of rows) {
    const d = ymd(r.AA_YMD), nm = (r.EVENT_NM || "").trim(), off = r.SBTR_DD_SC_NM === "휴업일";
    if (!nm || /토요휴업/.test(nm)) continue;
    if (/방학/.test(nm) && !/방학식/.test(nm)) days.push({ d, kind: "방학", title: nm.replace(/\s+/g, " ") });
    else if (/고사|지필/.test(nm) && !/모의|연합|학력평가|수행/.test(nm)) days.push({ d, kind: "시험", title: nm.replace(/\s*\(?\d+일차\)?/g, "").trim() });
    else if (off && !isWeekend(d)) days.push({ d, kind: "휴업", title: nm });
  }
  days.sort((a, b) => a.d.localeCompare(b.d));
  // 방학 기간 안의 휴업은 빼기
  const vac = days.filter((x) => x.kind === "방학").map((x) => x.d);
  const list = days.filter((x) => x.kind !== "휴업" || !vac.includes(x.d));
  const out: Ev[] = [];
  for (const x of list) {
    // 같은 종류 · 같은 이름이 주말 · 연휴를 끼고 이어지면 한 기간으로
    const prev = [...out].reverse().find((e) => e.kind === x.kind);
    const gap = x.kind === "휴업" ? 1 : 4;
    if (prev && prev.title === x.title && dayNum(x.d) - dayNum(prev.end) <= gap) { prev.end = x.d; continue; }
    if (prev && prev.end === x.d) continue;   // 같은 날 중복
    out.push({ kind: x.kind, title: x.title, start: x.d, end: x.d });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { data: cfg, error } = await sb.from("neis_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(`neis_config 읽기 실패: ${error.message} (SQL 28 실행 확인)`);
    if (!cfg?.api_key) return json({ ok: false, error: "나이스 인증키가 없습니다. 설정에서 입력하세요." });
    const key = cfg.api_key as string, office = (cfg.office as string) || "P10";

    // 학년도: 3월 ~ 다음 해 2월
    const now = new Date(Date.now() + 9 * 3600e3);
    const y = now.getUTCMonth() + 1 <= 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const from = `${y}0301`, to = `${y + 1}0228`;

    const { data: stu } = await sb.from("students").select("school,status").neq("status", "퇴원");
    const names = [...new Set((stu || []).map((s) => (s.school || "").trim()).filter(Boolean))];
    const { data: known } = await sb.from("neis_schools").select("*");
    const map = new Map((known || []).map((k) => [k.school, k]));

    const result = [];
    for (const school of names) {
      try {
        let sc = map.get(school);
        if (!sc?.code) {
          const f = await findSchool(school, key, office);
          if (!f) { result.push({ school, error: "나이스에서 학교를 못 찾음" }); continue; }
          sc = { school, ...f };
          await sb.from("neis_schools").upsert({ ...sc, updated_at: new Date().toISOString() });
        }
        const rows = await neis("SchoolSchedule", key, { ATPT_OFCDC_SC_CODE: sc.office, SD_SCHUL_CODE: sc.code, AA_FROM_YMD: from, AA_TO_YMD: to });
        const evs = toEvents(rows);
        // 이번 학년도 자동 일정만 새로
        await sb.from("school_events").delete().eq("school", school).eq("source", "neis").gte("start_date", ymd(from)).lte("start_date", ymd(to));
        if (evs.length) {
          const { error: e2 } = await sb.from("school_events").insert(evs.map((e) => ({
            school, kind: e.kind, title: e.title, start_date: e.start, end_date: e.end, source: "neis",
          })));
          if (e2) throw new Error(e2.message);
        }
        result.push({ school, full_name: sc.full_name, added: evs.length });
      } catch (e) {
        result.push({ school, error: String((e as Error).message || e) });
      }
    }
    await sb.from("neis_config").update({ last_sync: new Date().toISOString(), last_result: result }).eq("id", 1);
    return json({ ok: true, schools: result });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
