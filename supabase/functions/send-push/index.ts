// Supabase Edge Function · send-push
//  push_queue 에 쌓인 알림을 꺼내 학부모 · 선생님 기기로 보냄 (Web Push)
//  · 알림 서명 키(VAPID)는 처음 실행 때 스스로 만들어 push_config 에 저장 — 키를 따로 넣을 필요 없음
//  · 누가 불러도 '쌓인 알림 보내기'만 하므로 안전 (JWT 확인 꺼도 됨)
//  · 응답: { ok, publicKey, sent }  (앱은 publicKey 로 기기를 구독)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// 서버 전용 키: 새 방식(sb_secret_…) 먼저, 없으면 예전 service_role — 대시보드가 자동으로 넣어 줌 (직접 넣을 것 없음)
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

async function vapid() {
  const { data, error } = await sb.from("push_config").select("value").eq("key", "vapid").maybeSingle();
  if (error) throw new Error(`push_config 읽기 실패: ${error.message} (SQL 21 실행 · 권한 확인)`);
  if (data?.value?.publicKey) return data.value as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  const { error: e2 } = await sb.from("push_config").upsert({ key: "vapid", value: keys });
  if (e2) throw new Error(`push_config 저장 실패: ${e2.message}`);
  const { data: again, error: e3 } = await sb.from("push_config").select("value").eq("key", "vapid").single();
  if (e3 || !again) throw new Error(`push_config 다시 읽기 실패: ${e3?.message || '없음'}`);
  return again.value as { publicKey: string; privateKey: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const k = await vapid();
    webpush.setVapidDetails("mailto:noreply@molipgwan.app", k.publicKey, k.privateKey);

    // 대기열 가져오기 → 내가 지운 것만 보냄 (동시에 여러 번 불려도 한 번만 감)
    const { data: q } = await sb.from("push_queue").select("id").order("id").limit(50);
    const ids = (q || []).map((r) => r.id);
    if (!ids.length) return json({ ok: true, publicKey: k.publicKey, sent: 0 });
    const { data: items } = await sb.from("push_queue").delete().in("id", ids).select("*");

    let sent = 0;
    for (const it of items || []) {
      let subs: { endpoint: string; p256dh: string; auth: string }[] = [];
      if (it.student_id) {
        // 학생 본인 기기 (등원 · 공부 시간 알림)
        const { data } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("student_id", it.student_id);
        subs = data || [];
      } else if (it.to_teachers) {
        const { data } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").like("email", "t-%");
        subs = data || [];
      } else if (it.family_id) {
        const { data: pa } = await sb.from("parent_accounts").select("email").eq("family_id", it.family_id);
        const emails = (pa || []).map((p) => p.email);
        if (emails.length) {
          const { data } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").in("email", emails);
          subs = data || [];
        }
      }
      const payload = JSON.stringify({ title: it.title, body: it.body, url: it.url });
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);   // 지워진 기기
        }
      }));
    }
    return json({ ok: true, publicKey: k.publicKey, sent });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
