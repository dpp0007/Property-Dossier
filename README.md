# Property Dossier (NYC)

Enter a NYC address, get a dossier from official sites with no API: permits, DOB/ECB violations, HPD violations, zoning, tax, FEMA flood zone, zoned schools. Every record links to its source. Gaps are flagged, never guessed.

## Run
```bash
cp .env.example .env.local   # add TINYFISH_API_KEY (https://agent.tinyfish.ai/api-keys)
npm run dev                  # http://localhost:3000
```

## How TinyFish is used
- **Agent** (`/v1/automation/run-async` + poll, `lib/tinyfish.ts`): one run per source (`lib/sources.ts`). It opens the real portal (DOB BISweb, HPD Online, ZoLa, DOF, FEMA MSC, DOE), searches the property, and returns schema-shaped JSON. The goal forbids inferring values and requires a verbatim `quote` and page `url` per record.
- **Fetch** (`api.fetch.tinyfish.ai`, `app/api/section/route.ts`): independently re-reads each cited page (`ttl: 0`) and checks the agent's quote/id appears in it. Result per record: `✓ re-verified`, `⚠ not re-confirmed`, or `agent-read only`.
- **Monitor** (`/v1/monitors`, `app/api/monitor/route.ts`): "Start watching" creates a Page Monitor on the building's DOB job-filings list every 6h with a purpose, so a new permit yields a diff plus a relevance judgement. "Check now" runs it on demand. Set `MONITOR_WEBHOOK_URL` for push alerts.

Address to parcel (BBL/BIN) uses NYC Planning GeoSearch for identification only. No record data comes from it.

## Adding a city
Add an entry to `SOURCES` in `lib/sources.ts` (start URL + plain-English task) and a geocoder in `app/api/geocode`.

## Fallback when BISweb is down
BISweb sometimes returns Cloudflare 520 errors. If the Agent run for permits or OATH/ECB violations ends as a gap, `lib/fallback.ts` has TinyFish **Fetch** read live (`ttl: 0`) the official NYC Open Data DOB datasets for the building's BIN (legacy job filings, DOB NOW filings, ECB violations). The section is labelled FALLBACK, says why the Agent failed, and names the dataset. If that Fetch also fails, the gap stays: nothing is guessed, and an empty or unreadable response is never reported as "none on file". Open Data can lag BISweb.

## Known limitations
- **NYC only.** Address-to-parcel uses NYC Planning GeoSearch; other cities need a source list and geocoder (see above).
- **Permits may be incomplete.** BISweb covers legacy filings; newer ones may exist only in DOB NOW, which is not read. Rows sharing a job number are amendments of one job, and the report says so.
- **Slow.** Each section is a real browser run, typically 1 to 8 minutes. Runs over 480s are cancelled and shown as a gap, not guessed.
- **Verification levels.** `✓ re-verified` = Fetch found the agent's quote in the cited page. `⚠ not re-confirmed` = page fetched, text absent (often session-based or JS-rendered portals). `agent-read only` = page could not be re-fetched. Confirm the last two at the source link.
- **Gaps are expected.** If a portal blocks the agent or cannot find the property, the section is flagged `unavailable` with the reason.
- **Not legal or financial advice.** Verify against the linked source before relying on a record.
