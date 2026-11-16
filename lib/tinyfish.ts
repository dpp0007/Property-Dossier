// Thin REST wrappers for TinyFish Agent, Fetch and Monitor (no SDK, so every call is visible).
const AGENT = "https://agent.tinyfish.ai";
const FETCH = "https://api.fetch.tinyfish.ai";

export const hasKey = () => !!process.env.TINYFISH_API_KEY;

async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new Error("TINYFISH_API_KEY is not set (copy .env.example to .env.local)");
  const r = await fetch(url, {
    ...init,
    headers: { "X-API-Key": key, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`TinyFish ${r.status}: ${body?.error?.message ?? body?.message ?? String(text).slice(0, 200)}`);
  return body as T;
}

/** TinyFish Agent: start a run in a real browser on an official site (async; poll with agentGet). */
export async function agentStart(url: string, goal: string, output_schema: object) {
  const q = await call<any>(`${AGENT}/v1/automation/run-async`, {
    method: "POST",
    body: JSON.stringify({ url, goal, output_schema, browser_profile: "stealth", proxy_config: { enabled: true, country_code: "US" } }),
  });
  if (q.error || !q.run_id) throw new Error(q.error?.message ?? "Agent run was not queued");
  return q.run_id as string;
}
export const agentGet = (id: string) => call<any>(`${AGENT}/v1/runs/${encodeURIComponent(id)}`);
export const agentCancel = (id: string) => call(`${AGENT}/v1/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }).catch(() => {});

/** TinyFish Fetch: independent, live (ttl 0) re-fetch of pages, used to cross-check what the agent reported. */
export async function fetchPages(urls: string[], format: "markdown" | "html" = "markdown") {
  const r = await call<any>(
    FETCH,
    { method: "POST", body: JSON.stringify({ urls, format, ttl: 0 }) },
    150_000,
  );
  const out = new Map<string, string>();
  for (const x of r.results ?? []) {
    if (x.text) { out.set(x.url, x.text); if (x.final_url) out.set(x.final_url, x.text); }
  }
  return out;
}

/** TinyFish Monitor: scheduled page watch with diff + purpose-based relevance judgement. */
export const monitors = {
  list: async () => (await call<any>(`${AGENT}/v1/monitors`)).monitors as any[],
  create: (body: object) => call<any>(`${AGENT}/v1/monitors`, { method: "POST", body: JSON.stringify(body) }, 120_000),
  runNow: (id: string) => call<any>(`${AGENT}/v1/monitors/${encodeURIComponent(id)}/runs`, { method: "POST" }, 120_000),
  remove: (id: string) => call<any>(`${AGENT}/v1/monitors/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
