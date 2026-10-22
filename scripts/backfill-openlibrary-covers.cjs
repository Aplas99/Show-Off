/* global __dirname */
// One-off: finds cached ISBN products with no image, checks Open Library for a
// cover, and writes UPDATE statements for the confirmed ones. Only reads with
// the anon key; run the generated SQL in the Supabase SQL editor.
//
//   node scripts/backfill-openlibrary-covers.cjs [out.sql]
//
// Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_ANON_KEY from the environment or .env.
const fs = require("node:fs");
const path = require("node:path");

const envFile = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_ANON_KEY;
if (!supabaseUrl || !anonKey) throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_ANON_KEY");
const outFile = path.resolve(process.argv[2] || "openlibrary-cover-backfill.sql");

// Open Library allows 100 cover-by-ISBN requests per 5 minutes per IP.
const DELAY_MS = 3100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same URL the catalog proxy stores (lib/productCatalog.ts openLibraryCoverUrl).
const coverUrl = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

async function fetchCandidates() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const url = new URL(`${supabaseUrl}/rest/v1/products`);
    url.search = new URLSearchParams({ select: "ean,data", ean: "gte.9780000000000", and: "(ean.lte.9799999999999)", order: "ean" }).toString();
    const response = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Range: `${from}-${from + 999}` },
    });
    if (!response.ok) throw new Error(`products read failed: ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.filter((row) => !(Array.isArray(row.data?.images) && row.data.images.length > 0));
}

async function hasCover(isbn) {
  const response = await fetch(coverUrl(isbn), { method: "HEAD", redirect: "manual" });
  // An existing cover redirects to the archive.org CDN; a missing one is 404.
  return response.ok || (response.status >= 300 && response.status < 400);
}

(async () => {
  const candidates = await fetchCandidates();
  console.log(`${candidates.length} cached ISBN product(s) have no image.`);
  const found = [];
  for (const [index, row] of candidates.entries()) {
    const isbn = String(row.ean);
    if (index > 0) await sleep(DELAY_MS);
    const ok = await hasCover(isbn).catch(() => false);
    console.log(`${ok ? "cover   " : "no cover"} ${isbn} ${row.data?.title ?? ""}`);
    if (ok) found.push(isbn);
  }
  const statements = found.map((isbn) =>
    // products.data is json, not jsonb.
    `update public.products set data = jsonb_set(data::jsonb, '{images}', jsonb_build_array('${coverUrl(isbn)}'))::json\n` +
    `  where ean = ${isbn} and coalesce(jsonb_array_length(data::jsonb->'images'), 0) = 0;`);
  fs.writeFileSync(outFile, [
    "-- Open Library cover backfill for cached ISBN products without an image.",
    `-- Generated ${new Date().toISOString()} by scripts/backfill-openlibrary-covers.cjs.`,
    "-- Each update re-checks that the product is still imageless.",
    "begin;",
    ...statements,
    "commit;",
    "",
  ].join("\n"));
  console.log(`${found.length} cover(s) found. SQL written to ${outFile}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
