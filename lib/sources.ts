import type { Place } from "./types";

// Official NYC / FEMA portals. None is used through an API: TinyFish Agent drives the public website.
export type Source = {
  key: string;
  title: string;
  short: string; // tile label
  what: string; // plain-English description for the landing page
  org: string;
  home: string; // shown to the user as the official source
  start: (p: Place) => string;
  task: string;
  direct?: boolean; // answered synchronously by Search + Fetch, no browser agent
};

const bis = (p: Place) =>
  `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${p.boroCode}&houseno=${encodeURIComponent(p.housenumber)}&street=${encodeURIComponent(p.street).replace(/%20/g, "+")}&go2=+GO+&requestid=0`;

const jobs = (p: Place) =>
  p.bin ? `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByLocationServlet?requestid=1&allbin=${p.bin}` : bis(p);

const ecb = (p: Place) =>
  p.bin ? `https://a810-bisweb.nyc.gov/bisweb/ECBQueryByLocationServlet?requestid=2&allbin=${p.bin}` : bis(p);

export const SOURCES: Source[] = [
  {
    key: "permits",
    short: "Permits",
    what: "Recent construction and alteration filings, with job numbers, dates and status.",
    title: "Building permits & job filings",
    org: "NYC Dept. of Buildings (BISweb)",
    home: "https://a810-bisweb.nyc.gov/bisweb/",
    start: jobs,
    task: `Open the property's job application / permit lists (the "Applications", "Permits" or "Jobs" links on the Property Profile; if the profile mentions newer filings are in DOB NOW, say so in summary). Return up to 10 most recent job filings or permits from the FIRST page of results only (do not paginate). id = job or permit number, title = job type / work type, date = filed or issued date, status = job/permit status, detail = work description or applicant if shown.`,
  },
  {
    key: "dob_violations",
    short: "Building violations",
    what: "OATH/ECB violations against the building, with open counts and penalties.",
    title: "OATH/ECB violations (DOB)",
    org: "NYC Dept. of Buildings (BISweb)",
    home: "https://a810-bisweb.nyc.gov/bisweb/",
    start: ecb,
    task: `This page is the OATH/ECB violation list for the building. Put the header totals (Total Violations Issued, Open / Certificate of Correction Required, hearings Completed/Defaulted and Pending) in summary, and say that this covers OATH/ECB violations only. Then return the first 10 rows of page 1 only, do not paginate or click anything else. id = OATH/ECB number, title = severity and violation type if shown, date = violation date, status = certification status, detail = respondent, infraction code and penalty due.`,
  },
  {
    key: "hpd",
    short: "Housing violations",
    what: "Open housing-maintenance violations (heat, leaks, mold, pests) for residential buildings.",
    title: "Housing maintenance violations",
    org: "NYC Housing Preservation & Development",
    home: "https://hpdonline.nyc.gov/hpdonline/",
    start: () => "https://hpdonline.nyc.gov/hpdonline/",
    task: `Search the property by address, open the building overview and its Violations list. Return up to 10 most recent violations (open first), first page only. id = violation ID, title = violation description, date = inspection or issue date, status = open/closed, detail = class (A/B/C) and apartment/location. If the building is not in HPD's system (e.g. not a residential multiple dwelling) return none_found with the site's wording in reason.`,
  },
  {
    key: "zoning",
    short: "Zoning",
    what: "Zoning district, overlays and land-use facts for the tax lot.",
    title: "Zoning & land use",
    org: "NYC Dept. of City Planning (ZoLa)",
    home: "https://zola.planning.nyc.gov/",
    start: (p) => `https://zola.planning.nyc.gov/l/lot/${p.boroCode}/${Number(p.block)}/${Number(p.lot)}`,
    task: `Read the lot's info panel. Return one record per fact that is actually displayed (skip any field the page does not show; never add "not listed" rows), each with title = the label and detail = the value exactly as shown: zoning district(s), commercial overlay, special purpose district, limited height district, max FAR (residential / commercial / facility if shown), lot area, building area, land use, year built, number of floors, residential units, owner type if shown, landmark/historic district status. id = null.`,
  },
  {
    key: "tax",
    short: "Tax record",
    what: "Tax class, owner of record and assessment details from the Department of Finance.",
    title: "Property tax & assessment",
    org: "NYC Dept. of Finance",
    home: "https://a836-pts-access.nyc.gov/care/",
    start: () => "https://a836-pts-access.nyc.gov/care/forms/htmlframe.aspx?mode=content/home.htm",
    task: `Look the property up by borough/block/lot (a BBL search page exists; accept cookies if asked). On the FIRST results/property details page, read only: tax class, market value, assessed value, exemptions and owner/billing name if shown. Then STOP: do not open Account Balance, bills, or other tabs, and do not search again. id = null, title = label, detail = value exactly as shown, date = the tax year the value applies to if shown.`,
  },
  {
    key: "flood",
    short: "Flood zone",
    what: "FEMA flood zone and whether the property sits in a Special Flood Hazard Area.",
    title: "FEMA flood zone",
    org: "FEMA Flood Map Service Center",
    home: "https://msc.fema.gov/portal/home",
    start: (p) =>
      `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${p.lng},${p.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID,FLD_AR_ID&returnGeometry=false&f=json`,
    task: `This page is the FEMA National Flood Hazard Layer queried at the property's coordinates (JSON). Read features[].attributes and return one record per attribute that has a value: FLD_ZONE (flood zone, e.g. AE, X, VE), ZONE_SUBTY (zone subtype), SFHA_TF (T = inside a Special Flood Hazard Area, F = outside), STATIC_BFE (base flood elevation; ignore if -9999 or null), DFIRM_ID (FIRM database id). title = a plain label, detail = the value exactly as shown, id = null. If features is empty, return status none_found with reason "FEMA has no mapped flood zone at these coordinates (the area may be unmapped, which is not the same as zero risk)". Do not click anything.`,
  },
  {
    key: "schools",
    short: "Schools",
    what: "The elementary, middle and high schools zoned for this address.",
    title: "Zoned schools",
    org: "NYC Dept. of Education",
    home: "https://www.schools.nyc.gov/enrollment/enrollment-help/zoned-schools",
    start: () => "https://www.schools.nyc.gov/",
    task: `Find the school zone lookup (zoned schools for an address). Enter the address and return each zoned school (elementary, middle, high if shown). id = DBN/school code, title = school name, detail = grade levels, district and school address, status = null. If no zoned school is returned say so in reason.`,
  },
  {
    key: "notices",
    short: "Official documents",
    what: "Landmark reports, city notices and public documents on official sites whose text contains this exact address.",
    title: "Public records mentioning this address",
    org: "NYC.gov, NY State, FEMA (found by TinyFish Search, confirmed by Fetch)",
    home: "https://www.nyc.gov/",
    start: () => "https://www.nyc.gov/",
    task: "",
    direct: true,
  },
];

export const monitorTarget = jobs; // the DOB job-filings list for the building: a new filing changes this page

const clean = (s: unknown, max = 200) => String(s ?? "").replace(/[^\x20-\x7E]/g, " ").trim().slice(0, max);

/** Validates a Place posted by the client before it is interpolated into any agent goal. */
export function parsePlace(x: any): Place | null {
  const bbl = clean(x?.bbl, 10);
  if (!/^[1-5]\d{9}$/.test(bbl)) return null;
  const lat = Number(x?.lat), lng = Number(x?.lng);
  return {
    address: clean(x.address), housenumber: clean(x.housenumber, 20), street: clean(x.street, 80),
    borough: clean(x.borough, 20), boroCode: Number(bbl[0]), block: bbl.slice(1, 6), lot: bbl.slice(6), bbl,
    bin: /^\d{7}$/.test(clean(x.bin, 7)) ? clean(x.bin, 7) : null, zip: clean(x.zip, 10) || null,
    lat: isFinite(lat) ? lat : 0, lng: isFinite(lng) ? lng : 0,
  };
}

export function goal(s: Source, p: Place) {
  return `Collect official public records for ONE property from this official website only.
Property: ${p.address} (NYC borough ${p.borough}, block ${Number(p.block)}, lot ${Number(p.lot)}, BBL ${p.bbl}${p.bin ? `, BIN ${p.bin}` : ""}).
If the site asks for a different input format, enter the address, or borough/block/lot, as needed. If several buildings or lots match, pick the one matching this BBL/BIN and mention that in summary.

TASK: ${s.task}

STRICT RULES:
- Report ONLY what the site displays. Never estimate, infer or fill in values from memory. Use null for anything not shown.
- For every record, quote = a short verbatim excerpt (under 120 chars) copied from the page row/text it came from, and url = the address-bar URL of the page where it is shown.
- status = "found" if you returned records; "none_found" if the site clearly shows there are no such records (explain in reason); "unavailable" if you were blocked, hit a CAPTCHA/error/timeout, or could not locate the property (explain in reason).
- source_url = the address-bar URL of the main page you read. Work efficiently: do not paginate, do not revisit pages, and finish as soon as you have the data. Do not submit any form that changes data. Do not log in.`;
}

// Shared JSON schema for every section (enum described in text; keeps the validator happy).
export const SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string" },
    reason: { type: "string", nullable: true },
    summary: { type: "string", nullable: true },
    source_url: { type: "string" },
    records: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", nullable: true },
          title: { type: "string" },
          date: { type: "string", nullable: true },
          status: { type: "string", nullable: true },
          detail: { type: "string", nullable: true },
          url: { type: "string", nullable: true },
          quote: { type: "string" },
        },
        required: ["title", "quote"],
      },
    },
  },
  required: ["status", "source_url", "records"],
};
