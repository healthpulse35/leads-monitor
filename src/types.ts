// The JSON contract returned by the data endpoint (§3.2). `leads-sample.json`
// is a real example of this shape and the offline fallback.

export interface DailyRow {
  date: string; // "DD/MM/YYYY"
  paidLeads: number | null;
  revenue: number | null;
  cpl: number | null;
  adjProfit: number | null;
  roas: number | null;
}

export interface LeadsData {
  syncedAt: string; // ISO timestamp, sheet timezone
  today: {
    date: string; // "DD/MM/YYYY"
    label: string;
    cumulative: number[]; // length 24, cumulative leads by hour
  };
  benchmark: {
    high: number[]; // length 24, cumulative
    low: number[]; // length 24, cumulative
  };
  daily: DailyRow[]; // one per day, oldest -> newest
}

export type SyncStatus = "syncing" | "live" | "snapshot";

export interface AppState {
  data: LeadsData;
  status: SyncStatus;
  syncedAt: string; // ISO of the data currently shown
  isFixture: boolean; // true when showing the bundled snapshot
  chartMode: "cumulative" | "hourly";
}
