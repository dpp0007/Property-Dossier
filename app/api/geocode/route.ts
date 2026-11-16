// Address -> parcel identity (BBL/BIN) via NYC Planning Labs GeoSearch. Identification only; records come from TinyFish.
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 150);
  if (!q || q.length < 4) return Response.json({ places: [] });
  try {
    const r = await fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(q)}&size=6`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const j = await r.json();
    const places = (j.features ?? [])
      .filter((f: any) => f.properties?.addendum?.pad?.bbl && f.properties.housenumber)
      .map((f: any) => {
        const p = f.properties,
          pad = p.addendum.pad;
        return {
          address: `${p.housenumber} ${title(p.street ?? "")}, ${p.borough}, NY ${p.postalcode ?? ""}`.trim(),
          housenumber: p.housenumber,
          street: p.street,
          borough: p.borough,
          bbl: pad.bbl,
          boroCode: Number(pad.bbl[0]),
          block: pad.bbl.slice(1, 6),
          lot: pad.bbl.slice(6),
          bin: pad.bin ?? null,
          zip: p.postalcode ?? null,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        };
      });
    return Response.json({ places });
  } catch (e: any) {
    return Response.json({ places: [], error: "Address lookup failed: " + e.message }, { status: 502 });
  }
}
