"use client";
import { useEffect, useRef, useState } from "react";
import { SOURCES } from "@/lib/sources";
import PipelineHero from "@/components/PipelineHero";
import { coverage, permitNote, toJson, toMarkdown, type Results } from "@/lib/report";
import type { Place, Rec, SectionResult } from "@/lib/types";

const EXAMPLES = ["350 5th Ave, Manhattan", "1 Metrotech Center, Brooklyn", "30-30 Thomson Ave, Queens"];
const CACHE = "dossier:v1:";
const SHOW = 4; // records shown before "show all"

const api = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j;
};

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

type Tone = "ok" | "warn" | "bad" | "info" | "gap" | "wait";
type Glance = { value: string; tone: Tone };
const ICON: Record<Tone, string> = { ok: "✓", warn: "!", bad: "!", info: "i", gap: "?", wait: "…" };
const RANK: Record<Tone, number> = { bad: 0, warn: 1, gap: 2, info: 3, ok: 4, wait: 5 };

// One plain-language finding per source, derived only from what the source returned.
function glance(key: string, r?: SectionResult): Glance {
  if (!r) return { value: "Still reading…", tone: "wait" };
  if (r.status === "unavailable") return { value: "Could not be read. Check the official site manually.", tone: "gap" };
  const rec = (re: RegExp) => r.records.find((x) => re.test(x.title))?.detail ?? null;
  const n = r.records.length;
  if (key === "hpd") return r.status === "none_found" ? { value: "No housing violations on file.", tone: "ok" } : { value: `${n} housing violations listed. Review them.`, tone: "warn" };
  if (key === "dob_violations") {
    const open = r.summary?.match(/Open[^:]*:\s*(\d+)/i)?.[1], total = r.summary?.match(/Issued[^:]*:\s*(\d+)/i)?.[1];
    if (open != null) return Number(open) > 0
      ? { value: `${open} open building violation${open === "1" ? "" : "s"}${total ? ` (${total} issued over time)` : ""}.`, tone: "bad" }
      : { value: `No open building violations${total ? ` (${total} issued over time, all resolved)` : ""}.`, tone: "ok" };
  }
  if (key === "flood") {
    const z = rec(/FLD_ZONE/i), sfha = rec(/SFHA/i);
    if (z) return sfha === "T" ? { value: `Flood zone ${z}: inside a FEMA flood hazard area.`, tone: "bad" } : { value: `Flood zone ${z}: outside the FEMA flood hazard area.`, tone: "ok" };
    if (r.status === "none_found") return { value: "FEMA has no flood map for this spot (not the same as no risk).", tone: "warn" };
  }
  if (key === "zoning") { const z = rec(/zoning district/i); if (z) return { value: `Zoned ${z}.`, tone: "info" }; }
  if (key === "tax") { const c = rec(/tax class/i), o = rec(/owner/i); if (c) return { value: `Tax class ${c}${o ? `, owner of record: ${o}` : ""}.`, tone: "info" }; }
  if (key === "schools" && n) return { value: `Zoned: ${r.records.map((x) => x.title).join("; ")}.`, tone: "info" };
  if (key === "permits" && n) return { value: `${n} filing rows (${new Set(r.records.map((x) => x.id).filter(Boolean)).size || "?"} distinct jobs), latest ${r.records[0].date ?? "date not shown"}. May be incomplete (DOB NOW not covered).`, tone: "info" };
  return r.status === "none_found" ? { value: "No records on file.", tone: "ok" } : { value: `${n} records found.`, tone: "info" };
}

export default function Home() {
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [res, setRes] = useState<Results>({});
  const [started, setStarted] = useState<Record<string, number>>({});
  const [prog, setProg] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [mon, setMon] = useState<any>(null);
  const [monBusy, setMonBusy] = useState(false);
  const [monMsg, setMonMsg] = useState<{ err?: boolean; text: string } | null>(null);
  const [recent, setRecent] = useState<{ place: Place; res: Results; savedAt: string }[]>([]);
  const [fromCache, setFromCache] = useState<string | null>(null);
  const runId_ = useRef(0);

  const loadRecent = () => {
    try {
      const all = Object.keys(localStorage).filter((k) => k.startsWith(CACHE)).map((k) => JSON.parse(localStorage.getItem(k)!));
      setRecent(all.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 8));
    } catch {}
  };

  useEffect(() => {
    api("/api/status").then((s) => setHasKey(s.hasKey)).catch(() => {});
    loadRecent();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // persist finished dossier so reopening is instant
  useEffect(() => {
    if (!place || !SOURCES.some((s) => res[s.key])) return;
    try { localStorage.setItem(CACHE + place.bbl, JSON.stringify({ place, res, savedAt: SOURCES.map((s) => res[s.key]?.retrievedAt ?? "").sort().at(-1) })); loadRecent(); } catch {}
  }, [res, place]);

  async function lookup(text: string) {
    setSearching(true); setNoMatch(false); setSugg([]);
    try {
      const { places } = await api(`/api/geocode?q=${encodeURIComponent(text)}`);
      if (places.length === 1) return start(places[0]);
      setSugg(places);
      setNoMatch(!places.length);
    } catch { setNoMatch(true); } finally { setSearching(false); }
  }

  async function runSection(p: Place, key: string, id: number) {
    const t0 = Date.now();
    setStarted((s) => ({ ...s, [key]: t0 }));
    setRes((r) => ({ ...r, [key]: undefined }));
    const post = (method: string, body: object) => api("/api/section", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, place: p, ...body }) });
    let out: SectionResult;
    try {
      const { runId } = await post("POST", {});
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        if (id !== runId_.current) return; // a newer search replaced this one
        const j = await post("PUT", { runId, elapsed: (Date.now() - t0) / 1000 });
        if (!j.pending) { out = j; break; }
        setProg((m) => ({ ...m, [key]: `${j.status === "PENDING" ? "Waiting for a TinyFish browser" : `Step ${j.steps}`}${j.action ? `: ${j.action}` : ""}` }));
      }
    } catch (e: any) {
      out = { key, status: "unavailable", reason: e.message, summary: null, sourceUrl: SOURCES.find((s) => s.key === key)!.home, records: [], retrievedAt: new Date().toISOString(), runId: null };
    }
    if (id === runId_.current) setRes((r) => ({ ...r, [key]: out }));
    setStarted((s) => { const { [key]: _, ...rest } = s; return rest; });
  }

  function start(p: Place, fresh = false) {
    const id = ++runId_.current;
    setPlace(p); setSugg([]); setQ(p.address); setStarted({}); setProg({}); setMon(null); setMonMsg(null); setNoMatch(false);
    api(`/api/monitor?bbl=${p.bbl}`).then((j) => id === runId_.current && setMon(j.monitor)).catch(() => {});
    try {
      const c = fresh ? null : JSON.parse(localStorage.getItem(CACHE + p.bbl) ?? "null");
      if (c) {
        setRes(c.res);
        const missing = SOURCES.filter((s) => !c.res[s.key]);
        if (!missing.length) { setFromCache(c.savedAt); return; }
        setFromCache(null);
        runQueue(p, missing, id);
        return;
      }
    } catch {}
    setFromCache(null); setRes({});
    runQueue(p, SOURCES, id);
  }

  function runQueue(p: Place, list: typeof SOURCES, id: number) {
    // ponytail: 2 concurrent agent runs (the account limit seen in testing); raise if your plan allows more
    const queue = [...list];
    const worker = async () => { for (let s; (s = queue.shift()); ) await runSection(p, s.key, id); };
    [worker(), worker()];
  }

  async function monitorAction(kind: "watch" | "check" | "stop") {
    if (!place) return;
    setMonBusy(true); setMonMsg(null);
    const jobsKey = "jobs:" + place.bbl;
    try {
      if (kind === "watch") {
        const j = await api("/api/monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(place) });
        setMon(j.monitor);
        try { localStorage.setItem(jobsKey, JSON.stringify(j.jobs ?? [])); } catch {}
        setMonMsg({ text: `Baseline saved (${j.jobs?.length ?? 0} DOB job filings on record). TinyFish re-checks every 6 hours. Use "Check now" to see anything new.` });
      } else if (kind === "check") {
        const j = await api("/api/monitor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mon.id }) });
        const cur: string[] = j.jobs ?? [];
        let before: string[] | null = null;
        try { before = JSON.parse(localStorage.getItem(jobsKey) ?? "null"); localStorage.setItem(jobsKey, JSON.stringify(cur)); } catch {}
        const fresh = before ? cur.filter((x) => !before!.includes(x)) : [];
        setMonMsg({
          text: !before ? `Page re-read live (${cur.length} job filings). No earlier baseline in this browser, so this check is the new baseline.`
            : fresh.length ? `${fresh.length} new DOB job filing${fresh.length > 1 ? "s" : ""} since the last check: ${fresh.join(", ")}`
            : "No new DOB job filings since the last check.",
        });
      } else {
        await api(`/api/monitor?id=${mon.id}`, { method: "DELETE" });
        setMon(null); setMonMsg({ text: "Stopped watching this address." });
      }
    } catch (e: any) { setMonMsg({ err: true, text: e.message }); } finally { setMonBusy(false); }
  }

  const forget = (bbl: string) => { try { localStorage.removeItem(CACHE + bbl); } catch {} loadRecent(); };
  const badge = (res: Results) => {
    const n = SOURCES.filter((s) => res[s.key]).length;
    const bad = SOURCES.filter((s) => ["bad", "warn"].includes(glance(s.key, res[s.key]).tone)).length;
    return n < SOURCES.length ? { cls: "warn", text: `partial ${n}/${SOURCES.length}` } : bad ? { cls: "gap", text: `${bad} to review` } : { cls: "ok", text: "no flags" };
  };
  const openSection = (key: string) => {
    const el = document.getElementById(`sec-${key}`) as HTMLDetailsElement | null;
    if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  const printAll = () => { document.querySelectorAll<HTMLDetailsElement>("details.sec").forEach((d) => (d.open = true)); setTimeout(() => window.print(), 100); };

  const cov = coverage(res);
  const doneCount = SOURCES.filter((s) => res[s.key]).length;
  const done = doneCount === SOURCES.length;
  const running = !done && !fromCache;
  const rows = SOURCES.map((s) => ({ s, g: glance(s.key, res[s.key]) })).sort((a, b) => RANK[a.g.tone] - RANK[b.g.tone]);
  const flags = rows.filter((x) => x.g.tone === "bad" || x.g.tone === "warn");
  const gaps = rows.filter((x) => x.g.tone === "gap");
  const verdict = running && !doneCount ? null
    : flags.length ? { tone: "bad", title: `${flags.length} thing${flags.length > 1 ? "s" : ""} to look at`, text: `Needs attention: ${flags.map((x) => x.s.short.toLowerCase()).join(", ")}.${gaps.length ? ` ${gaps.length} source${gaps.length > 1 ? "s" : ""} could not be read.` : ""}` }
    : gaps.length ? { tone: "warn", title: "No red flags, but not complete", text: `Nothing concerning in what was read. ${gaps.map((x) => x.s.short.toLowerCase()).join(", ")} could not be read, so this is not a full all-clear.` }
    : running ? { tone: "info", title: "No red flags so far", text: `${doneCount} of ${SOURCES.length} sources read. Results below update as more arrive.` }
    : { tone: "ok", title: "No red flags found", text: "All sources were read and none shows an open violation or flood-hazard flag. Review the details below before relying on it." };

  return (
    <div className="wrap">
      <nav className="top"><b>Property Dossier</b><span>New York City · live from official sources</span></nav>

      <PipelineHero compact={!!place}>
        <div className="search">
          <form onSubmit={(e) => { e.preventDefault(); q.trim().length > 3 && lookup(q.trim()); }}>
            <input value={q} onChange={(e) => { setQ(e.target.value); setNoMatch(false); }} placeholder="Type an address, e.g. 350 5th Ave, Manhattan" aria-label="Property address" autoFocus />
            <button className="btn primary big" disabled={searching || q.trim().length < 4}>{searching ? "Finding…" : "Build dossier"}</button>
          </form>
          {sugg.length > 1 && (
            <div className="suggest" role="listbox">
              <div className="suggest-h">Which one did you mean?</div>
              {sugg.map((p) => <button key={p.bbl + p.address} onClick={() => start(p)}>{p.address} <small>BBL {p.bbl}</small></button>)}
            </div>
          )}
        </div>
        {noMatch && <div className="hint">No NYC address matched. Include the borough, e.g. “12 Court St, Brooklyn”.</div>}
        {!place && <div className="try">Try an example: {EXAMPLES.map((x) => <button key={x} className="pill" onClick={() => { setQ(x); lookup(x); }}>{x}</button>)}</div>}
        {!hasKey && <div className="banner">TinyFish API key missing. Put <code>TINYFISH_API_KEY</code> in <code>.env</code> or <code>.env.local</code> and restart <code>npm run dev</code>.</div>}
      </PipelineHero>

      {recent.filter((r) => r.place.bbl !== place?.bbl).length > 0 && (
        <section className={place ? "history slim" : "block"}>
          <h2>Recent searches</h2>
          <ul className="hist">
            {recent.filter((r) => r.place.bbl !== place?.bbl).map((r) => {
              const b = badge(r.res);
              return (
                <li key={r.place.bbl}>
                  <button className="hist-main" onClick={() => start(r.place)}>
                    <strong>{r.place.address}</strong>
                    <span className="meta">{ago(r.savedAt)}</span>
                    <span className={`chip ${b.cls}`}>{b.text}</span>
                  </button>
                  <button className="hist-x" aria-label={`Remove ${r.place.address}`} title="Remove from history" onClick={() => forget(r.place.bbl)}>×</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!place && (
        <>
          <section className="block">
            <h2>What you get</h2>
            <div className="grid">
              {SOURCES.map((s) => (
                <a key={s.key} className="src" href={s.home} target="_blank" rel="noreferrer">
                  <strong>{s.title}</strong>
                  <span>{s.what}</span>
                  <small>{s.org} ↗</small>
                </a>
              ))}
            </div>
          </section>
          <section className="block">
            <h2>How it works</h2>
            <ol className="steps">
              <li><b>Live retrieval.</b> A TinyFish browser agent opens each official website, finds your property and reads the records. Nothing is pre-loaded or cached from someone else.</li>
              <li><b>Cross-checked.</b> TinyFish Fetch re-reads the cited page and confirms the record is there. Each record shows <span className="chip ok">✓ re-verified</span> or says why it could not be.</li>
              <li><b>Honest gaps.</b> If a site blocks the agent or has no record, the report says so. Nothing is guessed or filled in.</li>
              <li><b>Watch it.</b> TinyFish Monitor re-checks the building's DOB filings every 6 hours and tells you about new permits.</li>
            </ol>
            <p className="meta">Takes about 5 to 8 minutes because the agents browse real government sites. Coverage: all five NYC boroughs.</p>
          </section>
        </>
      )}

      {place && (
        <>
          <section className="place">
            <div className="place-top">
              <div>
                <h2>{place.address}</h2>
                <div className="facts">
                  <span>Borough <b>{place.borough}</b></span><span>Block <b>{Number(place.block)}</b></span><span>Lot <b>{Number(place.lot)}</b></span>
                  <span>BBL <b>{place.bbl}</b></span>{place.bin && <span>BIN <b>{place.bin}</b></span>}
                </div>
              </div>
              <button className="btn sm" onClick={() => { setPlace(null); setQ(""); setRes({}); runId_.current++; }}>New search</button>
            </div>

            {running && (
              <div className="progress" aria-live="polite">
                <div className="bar"><i style={{ width: `${(doneCount / SOURCES.length) * 100}%` }} /></div>
                <span>{doneCount} of {SOURCES.length} sources read. Agents are browsing government sites live, this takes 5 to 8 minutes. You can leave this tab open.</span>
              </div>
            )}
            {fromCache && <div className="progress"><span>Saved dossier from {ago(fromCache)}. <button className="link" onClick={() => start(place, true)}>Refresh everything live</button></span></div>}

            {verdict && (
              <div className={`verdict ${verdict.tone}`}>
                <strong>{verdict.title}</strong>
                <span>{verdict.text}</span>
              </div>
            )}

            <ul className="findings">
              {rows.map(({ s, g }) => (
                <li key={s.key}>
                  <button onClick={() => openSection(s.key)} className={`find ${g.tone}`}>
                    <i className="ic">{ICON[g.tone]}</i>
                    <span className="lbl">{s.short}</span>
                    <span className="val">{g.value}</span>
                    <span className="go">details ›</span>
                  </button>
                </li>
              ))}
            </ul>
            {(done || fromCache) && <div className="meta cover-line">{cov.found} sources returned records · {cov.none} confirmed none on file · {cov.gaps} could not be read</div>}

            <div className="actions">
              <button className="btn sm" disabled={doneCount === 0} onClick={() => download(`dossier-${place.bbl}.json`, JSON.stringify(toJson(place, res), null, 2), "application/json")}>Download JSON</button>
              <button className="btn sm" disabled={doneCount === 0} onClick={() => download(`dossier-${place.bbl}.md`, toMarkdown(place, res), "text/markdown")}>Download report</button>
              <button className="btn sm" disabled={doneCount === 0} onClick={printAll}>Print / PDF</button>
            </div>

            <div className="monitor">
              <div>
                <h3>Watch this address</h3>
                <p>TinyFish Monitor re-reads this building's DOB job filings every 6 hours and flags any new filing or permit.</p>
                {monMsg && <p className={monMsg.err ? "err" : "ok-text"}>{monMsg.text}</p>}
              </div>
              {!mon ? (
                <button className="btn primary" disabled={monBusy || !hasKey} onClick={() => monitorAction("watch")}>{monBusy ? "Setting up…" : "Start watching"}</button>
              ) : (
                <div className="actions" style={{ marginTop: 0 }}>
                  <span className="chip ok">watching</span>
                  <button className="btn sm" disabled={monBusy} onClick={() => monitorAction("check")}>{monBusy ? "Checking…" : "Check now"}</button>
                  <button className="btn sm" disabled={monBusy} onClick={() => monitorAction("stop")}>Stop</button>
                </div>
              )}
            </div>
          </section>

          <h2 className="detail-h">Source details</h2>
          <div className="sections">
            {SOURCES.map((s) => {
              const r = res[s.key];
              const g = glance(s.key, r);
              const secs = started[s.key] ? Math.round((now - started[s.key]) / 1000) : 0;
              return (
                <details className="sec" key={s.key} id={`sec-${s.key}`}>
                  <summary className="sec-h">
                    <i className={`ic ${g.tone}`}>{ICON[g.tone]}</i>
                    <div className="sec-t"><h3>{s.title}</h3><span className="meta">{r ? g.value : started[s.key] ? `Reading live site… ${secs}s` : "Queued"}</span></div>
                    <span className="meta chev">{r ? "Show details" : ""}</span>
                  </summary>
                  <div className="sec-b">
                    <div className="tools">
                      <span className="meta">{s.org}</span>
                      <a href={r?.sourceUrl ?? s.home} target="_blank" rel="noreferrer" className="meta">open official source ↗</a>
                      {r && <button className="btn sm" onClick={() => runSection(place, s.key, runId_.current)}>{r.status === "unavailable" ? "Retry" : "Refresh"}</button>}
                    </div>
                    {!r && <><div className="meta">{started[s.key] ? prog[s.key] ?? "Starting a TinyFish browser…" : "Waiting for a free browser (2 run at a time)."}</div><div className="skel" style={{ width: "80%" }} /></>}
                    {r?.status === "unavailable" && <div className="note gap"><b>Not retrieved.</b> {r.reason} Nothing was guessed.</div>}
                    {r?.status === "none_found" && <div className="note none">The source shows no records for this property{r.reason ? `: ${r.reason}` : "."}</div>}
                    {r && <Records r={r} />}
                    {r?.summary && <details className="sum"><summary>Agent notes</summary><p>{r.summary}</p></details>}
                    {r && <div className="meta stamp">Retrieved {new Date(r.retrievedAt).toLocaleString()}{r.runId ? ` · TinyFish run ${r.runId.slice(0, 8)}` : ""}</div>}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
      <footer>Records are read live from public government websites by TinyFish Agent and re-checked with TinyFish Fetch. This is a research aid, not legal advice: confirm anything material at the linked source.</footer>
    </div>
  );
}

function Records({ r }: { r: SectionResult }) {
  const [all, setAll] = useState(false);
  if (!r.records.length) return null;
  const shown = all ? r.records : r.records.slice(0, SHOW);
  const ver = r.records.filter((x) => x.verified === "yes").length;
  return (
    <>
      <div className="meta verif">
        {ver === r.records.length ? `✓ All ${ver} records re-verified against the source page.`
          : ver ? `${ver} of ${r.records.length} records re-verified against the source page; the rest are flagged below.`
          : "Read by the agent. The source page could not be re-read independently, so confirm at the source."}
      </div>
      {shown.map((x, i) => <Record key={i} x={x} fallback={r.sourceUrl} />)}
      {r.key === "permits" && permitNote(r) && <div className="meta verif">{permitNote(r)}</div>}
      {r.records.length > SHOW && <button className="btn sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${r.records.length}`}</button>}
    </>
  );
}

function Record({ x, fallback }: { x: Rec; fallback: string }) {
  const meta = [x.id && `#${x.id}`, x.date, x.status].filter(Boolean).join(" · ");
  return (
    <div className="rec">
      <div className="rec-top"><strong>{x.title}</strong><a href={x.url ?? fallback} target="_blank" rel="noreferrer" className="src-link">source ↗</a></div>
      {meta && <div className="meta">{meta}</div>}
      {x.detail && <div className="rec-d">{x.detail}</div>}
      {x.verified === "no" && <span className="chip warn" title="The re-fetched page did not contain this text (the page may be session-based). Confirm at the source.">⚠ not re-confirmed</span>}
      {x.quote && <details><summary>source text</summary><blockquote>{x.quote}</blockquote></details>}
    </div>
  );
}
