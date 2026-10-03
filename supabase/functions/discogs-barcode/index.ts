// VinyLog · Edge Function „discogs-barcode”
// Szuka płyty w Discogs po kodzie kreskowym. Token Discogs jest sekretem
// DISCOGS_TOKEN w Supabase, więc nigdy nie trafia do przeglądarki ani do repo.
// Wpuszcza tylko zalogowanych użytkowników VinyLog.
//
// Odpowiedź: { found: true, artist, title, image_url, source_url } albo { found: false }

import { createClient } from "npm:@supabase/supabase-js@2";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

// "Fleetwood Mac - Rumours" → artysta i tytuł; "Nirvana (2)" → "Nirvana"
function splitTitle(full: string) {
  const i = full.indexOf(" - ");
  const artist = i > -1 ? full.slice(0, i) : "";
  const title = i > -1 ? full.slice(i + 3) : full;
  return { artist: artist.replace(/\s*\(\d+\)$/, "").replace(/\*$/, "").trim(), title: title.trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  // Tylko zalogowani w VinyLog.
  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user } } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json(req, { error: "unauthorized" }, 401);

  const token = Deno.env.get("DISCOGS_TOKEN");
  if (!token) return json(req, { error: "missing DISCOGS_TOKEN" }, 500);

  let code = "";
  try { code = String((await req.json()).barcode ?? "").replace(/\D/g, ""); } catch { /* puste */ }
  if (code.length < 8 || code.length > 14) return json(req, { error: "bad barcode" }, 400);

  // Warianty 12/13 cyfr (UPC ↔ EAN z wiodącym zerem).
  const variants = [code];
  if (code.length === 12) variants.push("0" + code);
  if (code.length === 13 && code.startsWith("0")) variants.push(code.slice(1));

  for (const v of variants) {
    const url = `https://api.discogs.com/database/search?type=release&barcode=${v}&per_page=25`;
    const r = await fetch(url, {
      headers: { Authorization: `Discogs token=${token}`, "User-Agent": "VinyLog/1.0 +https://danusiowa.github.io/vinylog/" },
    });
    if (!r.ok) return json(req, { error: `discogs ${r.status}` }, 502);
    const { results = [] } = await r.json();
    if (!results.length) continue;

    const isVinyl = (x: { format?: string[] }) => (x.format ?? []).some((f) => /vinyl|LP/i.test(f));
    const rel = results.find(isVinyl) ?? results[0];
    const { artist, title } = splitTitle(rel.title ?? "");
    const img = rel.cover_image && !/spacer\.gif/.test(rel.cover_image) ? rel.cover_image : null;
    return json(req, {
      found: true,
      artist: artist || "Nieznany wykonawca",
      title: title || "Bez tytułu",
      image_url: img,
      source_url: `https://www.discogs.com/release/${rel.id}`,
    });
  }
  return json(req, { found: false });
});
