// Data fetching: hit the endpoint, validate the shape, fall back to the
// bundled fixture so the screen is never blank (§3.4).

import type { LeadsData } from "./types.ts";

// Resolved at build time. Empty when no live endpoint is configured.
const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) ?? "";

// Vite serves /public at the root; `base: "./"` makes this relative in builds.
const FIXTURE_URL = `${import.meta.env.BASE_URL}leads-sample.json`;

export interface FetchResult {
  data: LeadsData;
  isFixture: boolean;
}

/**
 * Fetch live data when an endpoint is configured; otherwise (or on any
 * failure) load the bundled fixture. Caller decides how to surface which
 * source won via the status pill.
 */
export async function fetchData(): Promise<FetchResult> {
  if (DATA_URL) {
    try {
      const live = await fetchJson(withCacheBust(DATA_URL));
      return { data: validate(live), isFixture: false };
    } catch (err) {
      console.warn("[leads-monitor] live fetch failed, using snapshot:", err);
    }
  }
  // No endpoint configured, or live fetch failed.
  const fixture = await fetchJson(withCacheBust(FIXTURE_URL));
  return { data: validate(fixture), isFixture: true };
}

function withCacheBust(url: string): string {
  // Date.now() is fine in the browser; this only runs client-side.
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Minimal structural validation so a malformed response falls back cleanly. */
export function validate(raw: unknown): LeadsData {
  if (!raw || typeof raw !== "object") throw new Error("payload is not an object");
  const d = raw as Record<string, unknown>;

  const today = d.today as Record<string, unknown> | undefined;
  const benchmark = d.benchmark as Record<string, unknown> | undefined;

  if (!today || !Array.isArray(today.cumulative)) throw new Error("missing today.cumulative");
  if (!benchmark || !Array.isArray(benchmark.high) || !Array.isArray(benchmark.low)) {
    throw new Error("missing benchmark band");
  }
  if (!Array.isArray(d.daily)) throw new Error("missing daily[]");

  return {
    syncedAt: typeof d.syncedAt === "string" ? d.syncedAt : new Date().toISOString(),
    today: {
      date: typeof today.date === "string" ? today.date : "",
      label: typeof today.label === "string" ? today.label : "Today",
      cumulative: pad24(today.cumulative as unknown[]),
    },
    benchmark: {
      high: pad24(benchmark.high as unknown[]),
      low: pad24(benchmark.low as unknown[]),
    },
    daily: (d.daily as unknown[]).map(normalizeRow),
  };
}

function pad24(a: unknown[]): number[] {
  const nums = a.map((v) => (typeof v === "number" && isFinite(v) ? v : 0));
  const r = nums.slice(0, 24);
  while (r.length < 24) r.push(r.length ? r[r.length - 1] : 0);
  return r;
}

function normalizeRow(raw: unknown): LeadsData["daily"][number] {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    date: typeof r.date === "string" ? r.date : "",
    paidLeads: num(r.paidLeads),
    revenue: num(r.revenue),
    cpl: num(r.cpl),
    adjProfit: num(r.adjProfit),
    roas: num(r.roas),
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}
