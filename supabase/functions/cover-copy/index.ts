// VinyLog · Edge Function „cover-copy”
// Pobiera okładkę spod podanego linku i zapisuje jej kopię w koszyku „covers”
// w folderze zalogowanej osoby. Dzięki temu okładka nie znika, gdy źródło
// (Discogs, sklep, inna strona) usunie albo przeniesie obrazek.
//
// Wejście:    { url: "https://…" }
// Odpowiedź:  { url: "<publiczny link do kopii>" } albo { error }

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://danusiowa.github.io"];
const MAX_BYTES = 10 * 1024 * 1024;   // większe pliki odrzucamy; mniejsze aplikacja zmniejsza do 800 px
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Tylko zalogowani w VinyLog.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json(req, { error: "unauthorized" }, 401);

  let src: URL;
  try { src = new URL(String((await req.json()).url ?? "")); } catch { return json(req, { error: "bad url" }, 400); }
  if (src.protocol !== "https:" && src.protocol !== "http:") return json(req, { error: "bad url" }, 400);
  // Kopia z naszego własnego magazynu nie ma sensu.
  if (src.href.startsWith(`${SUPABASE_URL}/storage/`)) return json(req, { url: src.href });

  let r: Response;
  try {
    r = await fetch(src.href, {
      headers: { "User-Agent": "VinyLog/1.0 +https://danusiowa.github.io/vinylog/", Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch { return json(req, { error: "fetch failed" }, 502); }
  if (!r.ok) return json(req, { error: `source ${r.status}` }, 502);

  const type = (r.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json(req, { error: "not an image" }, 415);
  if (Number(r.headers.get("Content-Length") ?? 0) > MAX_BYTES) return json(req, { error: "too big" }, 413);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return json(req, { error: "too big" }, 413);

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("covers").upload(path, bytes, { contentType: type, cacheControl: "31536000" });
  if (error) return json(req, { error: "upload failed" }, 500);

  return json(req, { url: `${SUPABASE_URL}/storage/v1/object/public/covers/${path}` });
});
