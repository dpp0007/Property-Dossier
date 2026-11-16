import { monitorTarget, parsePlace } from "@/lib/sources";
import { monitors } from "@/lib/tinyfish";

export const maxDuration = 120;
const nameOf = (bbl: string) => `dossier:${bbl}`;
// DOB job numbers are 9 digits; the client diffs these between checks to name new filings
const jobs = (run: any): string[] => [...new Set<string>((run?.results?.[0]?.text ?? "").match(/\b[1-4]\d{8}\b/g) ?? [])];
const err = (e: any) => Response.json({ error: e.message ?? String(e) }, { status: 502 });

export async function GET(req: Request) {
  const bbl = new URL(req.url).searchParams.get("bbl") ?? "";
  try {
    const m = (await monitors.list()).find((x) => x.name === nameOf(bbl));
    return Response.json({ monitor: m ?? null });
  } catch (e) {
    return err(e);
  }
}

// Watch: Page Monitor on the DOB job-filings list for the building.
export async function POST(req: Request) {
  const place = parsePlace(await req.json().catch(() => null));
  if (!place) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const r = await monitors.create({
      type: "fetch",
      name: nameOf(place.bbl),
      config: { url: monitorTarget(place), format: "markdown" },
      schedule_cron: "0 */6 * * *",
      purpose: `At ${place.address} (BBL ${place.bbl}): a new building permit or job filing, a new DOB/ECB violation or complaint, or a change in open permit/violation/complaint counts.`,
      ...(process.env.MONITOR_WEBHOOK_URL ? { webhook_url: process.env.MONITOR_WEBHOOK_URL } : {}),
    });
    return Response.json({ monitor: r.monitor, jobs: jobs(r.run) });
  } catch (e) {
    return err(e);
  }
}

// Check now: run the monitor immediately and return the diff against the previous run.
export async function PUT(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    const r = await monitors.runNow(id);
    return Response.json({ ...r, jobs: jobs(r.run) });
  } catch (e) {
    return err(e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    return Response.json(await monitors.remove(id));
  } catch (e) {
    return err(e);
  }
}
