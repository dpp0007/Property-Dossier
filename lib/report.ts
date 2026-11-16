import { SOURCES } from "./sources";
import type { Place, SectionResult } from "./types";

export type Results = Record<string, SectionResult | undefined>;

export const coverage = (res: Results) => {
  const v = Object.values(res).filter(Boolean) as SectionResult[];
  return {
    total: SOURCES.length,
    found: v.filter((x) => x.status === "found").length,
    none: v.filter((x) => x.status === "none_found").length,
    gaps: v.filter((x) => x.status === "unavailable").length,
  };
};

/** Rows sharing a job number are amendments / status updates of ONE job, not separate permits. */
export function permitNote(r?: SectionResult | null) {
  if (!r || r.status !== "found" || !r.records.length) return null;
  const n = r.records.length;
  const jobs = new Set(r.records.map((x) => x.id).filter(Boolean)).size;
  const same = jobs && jobs < n ? ` These ${n} rows cover only ${jobs} distinct job number${jobs === 1 ? "" : "s"}: rows with the same number are amendments or status updates of one job, not separate permits.` : "";
  return `${n} filing rows from the first page of DOB BISweb.${same} Newer filings may exist only in DOB NOW, which is not covered here, so this list may be incomplete.`;
}

export function toJson(place: Place, res: Results) {
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: "Retrieved live from official sources by TinyFish. Gaps are flagged, never guessed. Verify against the linked source before relying on it.",
    property: place,
    coverage: coverage(res),
    sections: SOURCES.map((s) => ({ key: s.key, ...(s.key === "permits" && permitNote(res[s.key]) ? { note: permitNote(res[s.key]) } : {}), title: s.title, official_source: s.org, official_home: s.home, result: res[s.key] ?? null })),
  };
}

export function toMarkdown(place: Place, res: Results) {
  const c = coverage(res);
  const L = [
    `# Property Dossier: ${place.address}`,
    "",
    `BBL ${place.bbl}${place.bin ? ` · BIN ${place.bin}` : ""} · generated ${new Date().toLocaleString()}`,
    `Coverage: ${c.found} sources with records, ${c.none} confirmed none on file, ${c.gaps} gaps (not retrieved).`,
    "",
  ];
  for (const s of SOURCES) {
    const r = res[s.key];
    L.push(`## ${s.title}`, `Source: [${s.org}](${r?.sourceUrl ?? s.home})`);
    if (!r) {
      L.push("_Not retrieved._", "");
      continue;
    }
    if (r.status === "unavailable") L.push(`**GAP, not retrieved:** ${r.reason ?? "unknown"}`);
    else if (r.status === "none_found") L.push(`No records on file at the source${r.reason ? ` (${r.reason})` : ""}.`);
    if (r.summary) L.push(`> ${r.summary}`);
    if (s.key === "permits") { const pn = permitNote(r); if (pn) L.push(`**Note:** ${pn}`); }
    for (const x of r.records) {
      const meta = [x.id && `#${x.id}`, x.date, x.status].filter(Boolean).join(" · ");
      const chk = x.verified === "yes" ? "✓ re-verified" : x.verified === "no" ? "⚠ not re-confirmed" : "agent-read only";
      L.push(`- **${x.title}**${meta ? ` (${meta})` : ""}${x.detail ? `: ${x.detail}` : ""} [source](${x.url ?? r.sourceUrl}) _${chk}_`);
    }
    L.push("");
  }
  return L.join("\n");
}
