# Leads Monitor

A mobile-first dashboard that tracks **today's incoming leads vs a typical day**
and shows a daily performance breakdown for the month. Built to be opened from a
phone, refreshing automatically (~5-minute freshness) from a Google Sheet.

Static single-page app: **Vite + vanilla TypeScript + Chart.js v4**. No backend
runtime — the only server-side piece is a small Google Apps Script that returns
JSON (so no Sheet credentials or PII ever reach the browser).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/  (static; deploy anywhere)
npm run preview    # serve the production build locally
```

With no data endpoint configured the app runs entirely off the bundled fixture
(`public/leads-sample.json`) and the status pill reads **"Saved snapshot"** —
useful for local dev and as the offline fallback.

## Live data

1. Open the Google Sheet → **Extensions ▸ Apps Script**, paste
   [`apps-script/Code.gs`](apps-script/Code.gs), and confirm the two tab-name
   constants (`DAILY_TAB`, `CUMUL_TAB`) match the real tabs.
2. **Deploy ▸ New deployment ▸ Web app**, *Execute as: Me*, *Who has access:
   Anyone*. Copy the resulting `…/exec` URL.
3. Put it in `.env`:
   ```
   VITE_DATA_URL=https://script.google.com/macros/s/XXXX/exec
   ```
4. `npm run build` (or `npm run dev`). The app now fetches live JSON, polls
   every 5 minutes, and re-fetches when the tab regains focus. On any fetch
   failure it falls back to the bundled snapshot.

The Apps Script reads **only** the daily-summary tab and the `Cumul. Leads` tab
and parses money/percent cells to plain numbers server-side. It never touches
the lead-level/PII tabs. See `apps-script/Code.gs` and the build spec for the
JSON contract.

## Deploy

`npm run build` emits a fully static `dist/`. Deploy to Netlify, Vercel, or
GitHub Pages. `vite.config.ts` uses `base: "./"` so relative asset paths work on
project-subpath hosts (e.g. GitHub Pages). Set `VITE_DATA_URL` as a build-time
env var in your host (it's inlined at build time — no secrets are involved).

## Project layout

```
src/
  main.ts      bootstrap: fetch → state → render; 5-min poll; visibilitychange; toggle
  data.ts      fetchData(): hit endpoint, validate shape, fall back to fixture
  compute.ts   typical/cutoff/variance/aggregates + all number & date formatters
  chart.ts     Chart.js cumulative-band and per-hour charts
  flag.ts      pace flag banner
  table.ts     daily breakdown table
  ui.css       design tokens + components (light mode only)
  types.ts     the JSON contract types
public/
  leads-sample.json   bundled fixture / offline fallback
apps-script/Code.gs   the Sheet-side data endpoint (deployed separately)
verify.ts             acceptance check — `node verify.ts` runs the compute
                      functions against the fixture (all 25 spec numbers)
```

## Verifying the numbers

```bash
node verify.ts
```

Runs the real `compute.ts` functions against the fixture and asserts every
number in the spec's acceptance criteria — paid-leads total (9,130), revenue
($216,517 / $216.5k), profit ($90,674), avg ROAS (1.70), cutoff hour (13),
`typical[13]` (147), variance (−19%), median ROAS (1.71), and the ROAS chip
colors. Requires Node ≥ 22 (runs TypeScript directly).

## Business logic (where to look)

All calculations live in `src/compute.ts` and follow the build spec §5:

- **Typical line** = midpoint of the benchmark high/low band.
- **Cutoff hour** = last hour today's cumulative increased; the "Today" line/bars
  stop there so an in-progress day doesn't show a flat future.
- **Pace flag** compares `today[cutoff]` to `typical[cutoff]`: ≤ −10% red
  (behind), ≥ +10% green (ahead), else blue (on pace).
- **ROAS chips** color relative to the month's median ROAS.
