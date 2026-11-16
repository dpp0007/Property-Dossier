// Fallback for the two DOB sections when BISweb is down or blocks the agent.
// TinyFish Fetch (live, ttl 0) reads NYC Open Data's official DOB datasets for the building's BIN.
// It is clearly labelled as a fallback, because Open Data can lag BISweb and does not include every DOB NOW filing.
import { fetchPages } from "./tinyfish";
import type { Place, Rec, SectionResult } from "./types";

const OD = "https://data.cityofnewyork.us/resource";
const q = (id: string, params: Record<string, string>) =>
  `${OD}/${id}.json?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%24/g, "$")}`).join("&")}`;
const page = (id: string) => `https://data.cityofnewyork.us/d/${id}`; // human-readable dataset page

const mdy = (s: string | undefined) => (s && /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s : null);
const ymd8 = (s: string | undefined) => (s && /^\d{8}$/.test(s) ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : null);
const iso = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : null);
const ts = (d: string | null) => (d ? Date.parse(d.replace(/(\d\d)\/(\d\d)\/(\d{4})/, "$3-$1-$2")) || 0 : 0);
const clean = (v: unknown) => (v == null || v === "" ? null : String(v).replace(/\s+/g, " ").trim());
const rows = (text: string | undefined): any[] => { const j = JSON.parse(text ?? ""); if (!Array.isArray(j)) throw new Error("not a row list"); return j; }; // throws on bad JSON -> caught below -> gap kept

export const hasFallback = (key: string) => key === "permits" || key === "dob_violations";

export async function fallback(key: string, p: Place, agentReason: string | null): Promise<SectionResult | null> {
  if (!p.bin || !hasFallback(key)) return null;
  const why = `TinyFish Agent could not read BISweb${agentReason ? ` (${agentReason.replace(/\s+/g, " ").slice(0, 160)})` : ""}. FALLBACK: read live by TinyFish Fetch from NYC Open Data, the city's official DOB data publication. It can lag BISweb.`;
  const base = { key, retrievedAt: new Date().toISOString(), runId: null, reason: null as string | null };
  try {
    if (key === "permits") {
      const legacy = q("ic3t-wcy2", { bin__: p.bin, $select: "job__,doc__,job_type,job_status_descrp,latest_action_date,job_description,pre__filing_date", $limit: "5000" });
      const now = q("w9ak-ipjd", { bin: p.bin, $select: "job_filing_number,filing_status,job_type,filing_date,job_description,current_status_date", $order: "filing_date DESC", $limit: "10" });
      const pages = await fetchPages([legacy, now], "html");
      if (!pages.has(legacy) || !pages.has(now)) return null; // a failed fetch is a gap, never "none found"
      const recs: (Rec & { t: number })[] = [];
      const capped = rows(pages.get(legacy)).length >= 5000; // legacy dates are text, so newest-first needs every row
      for (const r of rows(pages.get(legacy))) {
        const date = mdy(r.latest_action_date) ?? mdy(r.pre__filing_date);
        recs.push({ id: clean(r.job__), title: `Job filing, type ${clean(r.job_type) ?? "?"} (legacy BIS)`, date, status: clean(r.job_status_descrp),
          detail: clean(r.job_description)?.slice(0, 220) ?? null, url: legacy, quote: `"job__":"${r.job__}"`, verified: "yes", t: ts(date) });
      }
      for (const r of rows(pages.get(now))) {
        const date = iso(r.filing_date);
        recs.push({ id: clean(r.job_filing_number), title: `Job filing, type ${clean(r.job_type) ?? "?"} (DOB NOW)`, date, status: clean(r.filing_status),
          detail: clean(r.job_description)?.slice(0, 220) ?? null, url: now, quote: `"job_filing_number":"${r.job_filing_number}"`, verified: "yes", t: ts(date) });
      }
      recs.sort((a, b) => b.t - a.t);
      const top = recs.slice(0, 10).map(({ t, ...x }) => x);
      if (!top.length) return { ...base, status: "none_found", sourceUrl: page("ic3t-wcy2"), summary: why, reason: `No job filings for BIN ${p.bin} in the legacy or DOB NOW open datasets.`, records: [] };
      return { ...base, status: "found", sourceUrl: page("ic3t-wcy2"), summary: `${why} Showing the 10 most recent of ${recs.length} filings (legacy BIS and DOB NOW datasets, BIN ${p.bin})${capped ? ", but the legacy list hit the 5000-row cap so newer rows may be missing" : ""}. Rows sharing a job number are amendments of one job.`, records: top };
    }
    // OATH/ECB violations
    const list = q("6bgk-3dad", { bin: p.bin, $select: "ecb_violation_number,issue_date,severity,violation_type,ecb_violation_status,respondent_name,violation_description,penality_imposed,balance_due", $order: "issue_date DESC", $limit: "10" });
    const count = q("6bgk-3dad", { bin: p.bin, $select: "ecb_violation_status,count(*)", $group: "ecb_violation_status" });
    const pages = await fetchPages([list, count], "html");
    if (!pages.has(list) || !pages.has(count)) return null; // a failed fetch is a gap, never "none found"
    const counts = rows(pages.get(count));
    const total = counts.reduce((n, r) => n + Number(r.count ?? 0), 0);
    const active = counts.filter((r) => /ACTIVE/i.test(r.ecb_violation_status)).reduce((n, r) => n + Number(r.count ?? 0), 0);
    const recs: Rec[] = rows(pages.get(list)).map((r) => ({
      id: clean(r.ecb_violation_number), title: [clean(r.severity), clean(r.violation_type)].filter(Boolean).join(" · ") || "ECB violation", date: ymd8(r.issue_date),
      status: clean(r.ecb_violation_status), detail: [clean(r.violation_description), r.penality_imposed ? `penalty $${r.penality_imposed}` : null, r.balance_due ? `balance due $${r.balance_due}` : null, clean(r.respondent_name) && `respondent ${clean(r.respondent_name)}`].filter(Boolean).join(" · ").slice(0, 260) || null,
      url: list, quote: `"ecb_violation_number":"${r.ecb_violation_number}"`, verified: "yes" as const,
    }));
    if (!recs.length) return { ...base, status: "none_found", sourceUrl: page("6bgk-3dad"), summary: why, reason: `No OATH/ECB violations for BIN ${p.bin} in the open dataset.`, records: [] };
    return { ...base, status: "found", sourceUrl: page("6bgk-3dad"), summary: `${why} OATH/ECB only: ${total} violations on file for BIN ${p.bin}, ${active} with status ACTIVE. Showing the 10 most recent.`, records: recs };
  } catch {
    return null; // keep the original gap, never invent
  }
}
