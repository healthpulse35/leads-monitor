// Bootstrap: fetch -> state -> render; 5-min poll; refresh on tab focus (§3.4).

import "./ui.css";
import { fetchData } from "./data.ts";
import {
  aggregate,
  clockHHMM,
  cutoffHour,
  formatInt,
  formatMoneyAbbr,
  formatRoas,
  longDay,
  monthLabel,
} from "./compute.ts";
import { destroyChart, renderChart } from "./chart.ts";
import { renderFlag } from "./flag.ts";
import { renderTable } from "./table.ts";
import type { AppState, LeadsData, SyncStatus } from "./types.ts";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (§3.4)

const app = document.getElementById("app") as HTMLElement;

let state: AppState | null = null;
let chartMode: "cumulative" | "hourly" = "cumulative";
let fetching = false;

// ---------------------------------------------------------------------------
// Status pill (§6)
// ---------------------------------------------------------------------------

function pillHtml(status: SyncStatus, syncedAt: string): string {
  let cls = "pill--live";
  let text = `Live · synced ${clockHHMM(syncedAt)}`;
  if (status === "syncing") {
    cls = "pill--syncing";
    text = "Syncing…";
  } else if (status === "snapshot") {
    cls = "pill--snapshot";
    text = `Saved snapshot${syncedAt ? ` · ${clockHHMM(syncedAt)}` : ""}`;
  }
  return `<span class="pill ${cls}"><span class="pill__dot"></span>${text}</span>`;
}

function setPill(status: SyncStatus): void {
  const el = document.getElementById("pill");
  if (el) el.innerHTML = pillHtml(status, state?.syncedAt ?? "");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function stripHtml(data: LeadsData): string {
  const a = aggregate(data.daily);
  const cells = [
    { label: "Paid leads", value: formatInt(a.paid) },
    { label: "Revenue", value: formatMoneyAbbr(a.revenue) },
    { label: "Profit", value: formatMoneyAbbr(a.profit) },
    { label: "Avg ROAS", value: formatRoas(a.avgRoas) },
  ];
  const month = monthLabel(data.today.date);
  return `
    <section class="card strip-card">
      <div class="card__title">${esc(month)} so far</div>
      <div class="strip">
        ${cells
          .map(
            (c) => `
          <div class="stat">
            <div class="stat__value">${c.value}</div>
            <div class="stat__label">${esc(c.label)}</div>
          </div>`,
          )
          .join("")}
      </div>
    </section>
  `;
}

function chartCardHtml(data: LeadsData): string {
  const subtitle = `vs typical day · ${longDay(data.today.date)} (in progress)`;
  return `
    <section class="card chart-card">
      <div class="card__head">
        <div>
          <div class="card__title">Leads today</div>
          <div class="card__subtitle">${esc(subtitle)}</div>
        </div>
        <div class="toggle" role="group" aria-label="Chart mode">
          <button class="toggle__seg ${chartMode === "cumulative" ? "is-active" : ""}"
                  data-mode="cumulative" type="button"
                  aria-pressed="${chartMode === "cumulative"}">Cumulative</button>
          <button class="toggle__seg ${chartMode === "hourly" ? "is-active" : ""}"
                  data-mode="hourly" type="button"
                  aria-pressed="${chartMode === "hourly"}">Per hour</button>
        </div>
      </div>
      <div class="chart-box"><canvas id="chart"></canvas></div>
      <div class="legend" id="legend">${legendHtml()}</div>
    </section>
  `;
}

function legendHtml(): string {
  if (chartMode === "cumulative") {
    return `
      <span class="legend__item"><span class="swatch swatch--today"></span>Today</span>
      <span class="legend__item"><span class="swatch swatch--typical"></span>Typical day</span>
      <span class="legend__item"><span class="swatch swatch--band"></span>Typical range</span>
    `;
  }
  return `
    <span class="legend__item"><span class="swatch swatch--bar"></span>Today / hour</span>
    <span class="legend__item"><span class="swatch swatch--typical"></span>Typical / hour</span>
  `;
}

function footnoteHtml(s: AppState): string {
  const source = s.isFixture
    ? "Source: bundled snapshot (live sheet unreachable)"
    : "Source: Google Sheet (Cumul. Leads + monthly tab)";
  const when = s.syncedAt ? ` · last sync ${clockHHMM(s.syncedAt)}` : "";
  return `<p class="footnote">${esc(source)}${esc(when)}</p>`;
}

function render(): void {
  if (!state) return;
  const s = state;
  const month = monthLabel(s.data.today.date);

  app.innerHTML = `
    <header class="header">
      <div>
        <h1 class="header__title">Leads Monitor</h1>
        <p class="header__subtitle">${esc(month)} · today vs typical day</p>
      </div>
      <div id="pill">${pillHtml(s.status, s.syncedAt)}</div>
    </header>
    ${stripHtml(s.data)}
    ${renderFlag(s.data)}
    ${chartCardHtml(s.data)}
    ${renderTable(s.data)}
    ${footnoteHtml(s)}
  `;

  drawChart();
  wireToggle();
}

function drawChart(): void {
  if (!state) return;
  const canvas = document.getElementById("chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const cutoff = cutoffHour(state.data.today.cumulative);
  renderChart(canvas, state.data, chartMode, cutoff);
}

function wireToggle(): void {
  const segs = app.querySelectorAll<HTMLButtonElement>(".toggle__seg");
  segs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode as "cumulative" | "hourly";
      if (mode === chartMode) return;
      chartMode = mode;
      segs.forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      const legend = document.getElementById("legend");
      if (legend) legend.innerHTML = legendHtml();
      drawChart();
    });
  });
}

// ---------------------------------------------------------------------------
// Data lifecycle
// ---------------------------------------------------------------------------

async function refresh(): Promise<void> {
  if (fetching) return;
  fetching = true;
  if (state) setPill("syncing");

  try {
    const { data, isFixture } = await fetchData();
    state = {
      data,
      status: isFixture ? "snapshot" : "live",
      syncedAt: data.syncedAt,
      isFixture,
      chartMode,
    };
  } catch (err) {
    // validate() can still throw if even the fixture is malformed.
    console.error("[leads-monitor] failed to load any data:", err);
    if (state) {
      state.status = "snapshot";
    } else {
      app.innerHTML = `<p class="fatal">Couldn't load leads data. Check the data source and reload.</p>`;
      fetching = false;
      return;
    }
  } finally {
    fetching = false;
  }
  render();
}

function init(): void {
  // Initial shell so the screen is never blank while the first fetch runs.
  app.innerHTML = `
    <header class="header">
      <div>
        <h1 class="header__title">Leads Monitor</h1>
        <p class="header__subtitle">loading…</p>
      </div>
      <div id="pill">${pillHtml("syncing", "")}</div>
    </header>
    <div class="skeleton">Loading leads…</div>
  `;

  void refresh();

  // Poll every 5 minutes.
  setInterval(() => void refresh(), POLL_INTERVAL_MS);

  // Refresh when the tab becomes visible again (reopening the phone).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });

  // Clean up the chart on unload (avoids leaks on bfcache restores).
  window.addEventListener("pagehide", () => destroyChart());
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

init();
