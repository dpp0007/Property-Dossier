// Runs the full dossier for 3 addresses against the local dev server and saves JSON + Markdown per address.
// usage: node demo/run-demo.mjs   (dev server must be running on :3000)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = path.dirname(fileURLToPath(import.meta.url));
const ADDRESSES = ["350 5th Ave, Manhattan", "1 Metrotech Center, Brooklyn", "30-30 Thomson Ave, Queens"];
const SECTIONS = [
  ["permits", "Building permits & job filings", "NYC Dept. of Buildings (BISweb)"],
  ["dob_violations", "OATH/ECB violations (DOB)", "NYC Dept. of Buildings (BISweb)"],
  ["hpd", "Housing maintenance violations", "NYC Housing Preservation & Development"],
  ["zoning", "Zoning & land use", "NYC Dept. of City Planning (ZoLa)"],
  ["tax", "Property tax & assessment", "NYC Dept. of Finance"],
  ["flood", "FEMA flood zone", "FEMA National Flood Hazard Layer"],
  ["schools", "Zoned schools", "NYC Dept. of Education"],
];

const call = async (m, p, b) => (await fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined })).json();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const log = (...a) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${a.join(" ")}`; console.log(l); fs.appendFileSync(path.join(OUT, "run.log"), l + "\n"); };

const runs = []; // {place, results}
for (const text of ADDRESSES) {
  const { places } = await call("GET", `/api/geocode?q=${encodeURIComponent(text)}`);
  if (!places?.length) { log("NO GEOCODE", text); continue; }
  const place = places[0];
  // resume: keep sections that already succeeded, re-run only gaps and missing ones
  let results = {};
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(OUT, slug(place.address) + ".json"), "utf8"));
    for (const s of prev.sections) if (s.result && s.result.status !== "unavailable") results[s.key] = s.result;
  } catch {}
  runs.push({ text, place, results });
  log("geocoded", text, "->", place.address, place.bbl);
}

function save(run) {
  const { place, results } = run;
  const vals = Object.values(results);
  const coverage = {
    total: SECTIONS.length,
    found: vals.filter((r) => r.status === "found").length,
    none: vals.filter((r) => r.status === "none_found").length,
    gaps: vals.filter((r) => r.status === "unavailable").length,
    pending: SECTIONS.length - vals.length,
  };
  const base = path.join(OUT, slug(place.address));
  fs.writeFileSync(base + ".json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    disclaimer: "Retrieved live from official sources by TinyFish. Gaps are flagged, never guessed. Verify against the linked source before relying on it.",
    property: place, coverage,
    sections: SECTIONS.map(([key, title, org]) => ({ key, title, official_source: org, result: results[key] ?? null })),
  }, null, 2));
  const L = [`# Property Dossier: ${place.address}`, "", `BBL ${place.bbl}${place.bin ? ` · BIN ${place.bin}` : ""} · generated ${new Date().toLocaleString()}`,
    `Coverage: ${coverage.found} sources with records, ${coverage.none} confirmed none on file, ${coverage.gaps} gaps (not retrieved)${coverage.pending ? `, ${coverage.pending} not run` : ""}.`, ""];
  for (const [key, title, org] of SECTIONS) {
    const r = results[key];
    L.push(`## ${title}`, `Source: [${org}](${r?.sourceUrl ?? ""})`);
    if (!r) { L.push("_Not retrieved._", ""); continue; }
    if (r.status === "unavailable") L.push(`**GAP, not retrieved:** ${r.reason ?? "unknown"}`);
    else if (r.status === "none_found") L.push(`No records on file at the source${r.reason ? ` (${r.reason})` : ""}.`);
    if (r.summary) L.push(`> ${r.summary}`);
    for (const x of r.records) {
      const meta = [x.id && `#${x.id}`, x.date, x.status].filter(Boolean).join(" · ");
      const chk = x.verified === "yes" ? "✓ re-verified" : x.verified === "no" ? "⚠ not re-confirmed" : "agent-read only";
      L.push(`- **${x.title}**${meta ? ` (${meta})` : ""}${x.detail ? `: ${x.detail}` : ""} [source](${x.url ?? r.sourceUrl}) _${chk}_`);
    }
    L.push("");
  }
  fs.writeFileSync(base + ".md", L.join("\n"));
}

async function section(run, key) {
  const t0 = Date.now();
  const { runId, error } = await call("POST", "/api/section", { key, place: run.place });
  if (!runId) return { key, status: "unavailable", reason: error ?? "start failed", summary: null, sourceUrl: "", records: [], retrievedAt: new Date().toISOString(), runId: null };
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const j = await call("PUT", "/api/section", { key, place: run.place, runId, elapsed: (Date.now() - t0) / 1000 });
    if (!j.pending) return j;
  }
}

const queue = runs.flatMap((run) => SECTIONS.filter(([key]) => !run.results[key]).map(([key]) => ({ run, key })));
log("queued", queue.length, "section run(s)");
async function worker() {
  for (let t; (t = queue.shift()); ) {
    const t0 = Date.now();
    log("start", t.run.place.address, t.key);
    let r;
    try { r = await section(t.run, t.key); } catch (e) { r = { key: t.key, status: "unavailable", reason: String(e.message ?? e), summary: null, sourceUrl: "", records: [], retrievedAt: new Date().toISOString(), runId: null }; }
    t.run.results[t.key] = r;
    save(t.run);
    log("done ", t.run.place.address, t.key, r.status, `${r.records?.length ?? 0} records`, `${Math.round((Date.now() - t0) / 1000)}s`, r.reason ? `| ${String(r.reason).slice(0, 100)}` : "");
  }
}
await Promise.all([worker(), worker()]);
log("ALL DONE");
