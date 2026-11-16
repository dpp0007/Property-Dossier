export type Place = {
  address: string;
  housenumber: string;
  street: string;
  borough: string;
  boroCode: number; // 1 Manhattan … 5 Staten Island
  block: string; // 5 digits
  lot: string; // 4 digits
  bbl: string; // 10 digits
  bin: string | null;
  zip: string | null;
  lat: number;
  lng: number;
};

export type Rec = {
  id: string | null;
  title: string;
  date: string | null;
  status: string | null;
  detail: string | null;
  url: string | null;
  quote: string;
  // yes = text found when the page was re-fetched independently; no = page fetched but text absent; unchecked = could not re-fetch
  verified: "yes" | "no" | "unchecked";
};

export type SectionResult = {
  key: string;
  status: "found" | "none_found" | "unavailable";
  reason: string | null;
  summary: string | null;
  sourceUrl: string;
  records: Rec[];
  retrievedAt: string;
  runId: string | null;
};
