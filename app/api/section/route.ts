import { SOURCES, SCHEMA, goal, parsePlace } from "@/lib/sources";
import { agentCancel, agentGet, agentStart, fetchPages } from "@/lib/tinyfish";
import { fallback } from "@/lib/fallback";
import { notices } from "@/lib/notices";
import type { Rec, SectionResult } from "@/lib/types";

export const maxDuration = 300;
const LIMIT_S = 480; // give up on a run after this long

// compare on letters+digits only, so markdown/JSON escaping, quotes and spacing never cause false mismatches
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => (v == null || v === "" || v === "null" ? null : String(v));

// POST: start a TinyFish Agent run for one source. Returns immediately with the run id.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const src = SOURCES.find((s) => s.key === body?.key);
  const place = parsePlace(body?.place);
  if (!src || !place) return Response.json({ error: "bad request" }, { status: 400 });
  if (src.direct) return Response.json({ done: await notices(place) }); // Search + Fetch, no browser run needed
  try {
    return Response.json({ runId: await agentStart(src.start(place), goal(src, place), SCHEMA) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

// PUT: poll the run. While running returns progress; when finished returns the verified SectionResult.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const src = SOURCES.find((s) => s.key === body?.key);
  const place = parsePlace(body?.place);
  const runId = String(body?.runId ?? "");
  if (!src || !place || !runId) return Response.json({ error: "bad request" }, { status: 400 });

  const start = src.start(place);
  const base = { key: src.key, sourceUrl: start, retrievedAt: new Date().toISOString(), runId };
  const gap = (reason: string): SectionResult => ({ ...base, status: "unavailable", reason, summary: null, records: [] });

  // A terminal gap on a DOB section gets one chance at the labelled Open Data fallback (read by TinyFish Fetch).
  const done = async (out: SectionResult) => Response.json(out.status === "unavailable" ? (await fallback(src.key, place, out.reason)) ?? out : out);

  try {
    const r = await agentGet(runId);
    if (!["COMPLETED", "FAILED", "CANCELLED"].includes(r.status)) {
      if (Number(body?.elapsed) > LIMIT_S) {
        await agentCancel(runId);
        return done(gap(`Timed out after ${LIMIT_S}s${r.status === "PENDING" ? " (still queued: too many concurrent TinyFish runs)" : ""}.`));
      }
      const steps: any[] = r.steps ?? [];
      return Response.json({ pending: true, status: r.status, steps: steps.length, action: steps.at(-1)?.action ?? null });
    }
    if (r.status !== "COMPLETED") return done(gap(r.error?.message ?? `Agent run ${r.status.toLowerCase()}`));

    let result = r.result;
    if (typeof result === "string") { try { result = JSON.parse(result); } catch {} }
    if (!result || typeof result !== "object") return done(gap("Agent returned no structured result"));

    let records: Rec[] = (Array.isArray(result.records) ? result.records : []).slice(0, 40).map((x: any) => ({
      id: str(x.id), title: str(x.title) ?? "(untitled)", date: str(x.date), status: str(x.status),
      detail: str(x.detail), url: str(x.url), quote: str(x.quote) ?? "", verified: "unchecked" as const,
    }));
    let status = ["found", "none_found", "unavailable"].includes(result.status) ? result.status : "unavailable";
    if (status === "found" && !records.length) status = "unavailable";
    const sourceUrl = str(result.source_url) ?? start;

    // TinyFish Fetch: independently re-read each cited page and confirm the agent's quote/id really appears there.
    const urls = [...new Set(records.map((x) => x.url ?? sourceUrl))].filter((u) => /^https?:\/\//.test(u)).slice(0, 8);
    if (records.length && urls.length) {
      const pages = await fetchPages(urls).catch(() => new Map<string, string>());
      records = records.map((x) => {
        const text = pages.get(x.url ?? sourceUrl);
        if (!text) return x;
        const hay = norm(text);
        const needles = [x.quote, x.id, x.detail].filter((n): n is string => !!n).map(norm).filter((n) => n.length >= 4);
        return { ...x, verified: needles.some((n) => hay.includes(n)) ? "yes" : "no" };
      });
    }
    const out: SectionResult = {
      ...base, sourceUrl, status, records,
      reason: str(result.reason) ?? (status === "unavailable" ? "The agent could not read records from the site." : null),
      summary: str(result.summary),
    };
    return done(out);
  } catch (e: any) {
    return Response.json({ pending: true, status: "RETRY", steps: 0, action: `poll error: ${e.message}`.slice(0, 120) });
  }
}
