// "Official documents naming this address": TinyFish Search finds candidate pages on official domains,
// then TinyFish Fetch re-reads each one live. A hit is kept only if the page text really contains the address,
// and the quote shown is copied from that text. Everything else is dropped and counted, never shown.
import { fetchPages, searchWeb } from "./tinyfish";
import type { Place, Rec, SectionResult } from "./types";

const DOMAINS = ["nyc.gov", "cityofnewyork.us", "ny.gov", "fema.gov"];
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as any)[n % 10] ?? "th");

/** "5 AVENUE" -> ["5 avenue","5th avenue","fifth avenue"], "COURT STREET" -> ["court street", "court st"] */
function streetVariants(street: string) {
  const s = street.toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>([s]);
  const m = s.match(/^(?:east |west |north |south )?(\d+)(?:st|nd|rd|th)? (avenue|street|ave|st)$/);
  if (m) {
    const n = Number(m[1]), pre = s.match(/^(east |west |north |south )/)?.[1] ?? "", kind = m[2] === "ave" ? "avenue" : m[2] === "st" ? "street" : m[2];
    for (const k of [kind, kind === "avenue" ? "ave" : "st"]) {
      out.add(`${pre}${n} ${k}`); out.add(`${pre}${n}${suffix(n)} ${k}`);
      if (n < ORD.length) out.add(`${pre}${ORD[n]} ${k}`);
    }
  }
  const t = s.replace(/\bavenue\b/, "ave").replace(/\bstreet\b/, "st");
  out.add(t);
  return [...out];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function notices(p: Place): Promise<SectionResult> {
  const base = { key: "notices", retrievedAt: new Date().toISOString(), runId: null, sourceUrl: "https://www.nyc.gov/" };
  const variants = streetVariants(p.street);
  const house = p.housenumber.toLowerCase();
  const pretty = variants.filter((v) => !/ (ave|st)$/.test(v)).slice(0, 3);
  const query = `${pretty.map((v) => `"${house} ${v}"`).join(" OR ")} ${p.borough}`;
  try {
    const hits = await searchWeb(query, `Find official NYC and New York State government pages (landmark designations, DOB or HPD notices, hearings, public documents) that mention the property at ${p.address}`, DOMAINS);
    const cand = hits.filter((h) => /^https?:\/\//.test(h.url)).slice(0, 8);
    if (!cand.length) return { ...base, status: "none_found", reason: "TinyFish Search returned no official-domain pages for this address. That is not proof that none exist.", summary: `Searched ${DOMAINS.join(", ")}.`, records: [] };
    const pages = await fetchPages(cand.map((h) => h.url)).catch(() => new Map<string, string>());
    const re = new RegExp(`\\b${esc(house)}\\s{0,3}(?:${variants.map(esc).join("|")})\\b`, "i");
    const recs: Rec[] = [];
    let dropped = 0, unread = 0;
    for (const h of cand) {
      const text = pages.get(h.url);
      if (!text) { unread++; continue; }
      const flat = text.replace(/\s+/g, " ");
      const m = re.exec(flat);
      if (!m) { dropped++; continue; }
      const quote = flat.slice(Math.max(0, m.index - 60), m.index + m[0].length + 80).trim();
      recs.push({ id: null, title: h.title?.trim() || h.site_name, date: h.date ? h.date.slice(0, 10) : null, status: h.site_name, detail: quote, url: h.url, quote, verified: "yes" });
      if (recs.length >= 6) break;
    }
    const note = `Found by TinyFish Search on official domains, then re-read live by TinyFish Fetch: a page is listed only if its text contains "${p.housenumber} ${p.street}" (or a spelled variant). ${dropped} other search hit${dropped === 1 ? "" : "s"} dropped because the page text does not contain the address${unread ? `, ${unread} could not be re-read` : ""}. A mention is not always about this property (it can be a tenant's or company's address), so read each quote.`;
    if (!recs.length) return { ...base, status: "none_found", reason: "No official page whose text contains this exact address was confirmed. This is not proof that none exist.", summary: note, records: [] };
    return { ...base, status: "found", reason: null, summary: note, records: recs };
  } catch (e: any) {
    return { ...base, status: "unavailable", reason: `Search failed: ${String(e.message).slice(0, 160)}`, summary: null, records: [] };
  }
}
