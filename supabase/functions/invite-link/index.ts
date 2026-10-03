// VinyLog · Edge Function „invite-link”
// Tworzy link z zaproszeniem do VinyLog, który można wysłać czymkolwiek
// (WhatsApp, Messenger, SMS). Nie wysyła żadnego maila.
// Zapraszać nowe osoby może każdy zalogowany użytkownik VinyLog.
// Link dla adresu, który JUŻ ma konto (ustawienie nowego hasła), tworzy tylko
// administratorka z ADMIN_EMAILS — inaczej ktoś mógłby przejąć cudze konto.
//
// Wejście:    { email: "osoba@poczta.pl" }
// Link prowadzi do samej aplikacji (#zaproszenie=…), a nie do Supabase: podglądy linków
// w WhatsAppie, Messengerze czy SMS-ach „otwierają” adres i zużywały jednorazowy kod.
// Fragment po # nie trafia do serwera, a kod zużywa dopiero aplikacja w przeglądarce osoby.
//
// Odpowiedź:  { link, existing }  — existing = true, gdy konto już było (link ustawia nowe hasło; tylko admin)
//             albo { error: "exists" } (konto już jest, pyta nie-admin) albo inny { error }

import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_EMAILS = ["danusiowa@gmail.com"];
const APP_URL = "https://danusiowa.github.io/vinylog/";
const ALLOWED_ORIGINS = ["https://danusiowa.github.io"];

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Kto pyta? Każdy zalogowany użytkownik VinyLog.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json(req, { error: "unauthorized" }, 401);
  const isAdmin = ADMIN_EMAILS.includes((user.email ?? "").toLowerCase());

  let email = "";
  try { email = String((await req.json()).email ?? "").trim().toLowerCase(); } catch { /* puste */ }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "bad email" }, 400);

  // Nowa osoba: link z zaproszeniem (zakłada konto). Istniejące konto: link do ustawienia hasła.
  let res = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: APP_URL } });
  let existing = false;
  if (res.error && /already|registered|exists/i.test(res.error.message)) {
    if (!isAdmin) return json(req, { error: "exists" }, 409);
    existing = true;
    res = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL } });
  }
  const token = res.data?.properties?.hashed_token;
  if (res.error || !token) return json(req, { error: "generate failed" }, 500);

  const link = `${APP_URL}#zaproszenie=${encodeURIComponent(token)}&typ=${existing ? "recovery" : "invite"}`;
  return json(req, { link, existing });
});
