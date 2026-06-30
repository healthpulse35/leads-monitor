// Chart.js v4 rendering for the "Leads today" card (§4.4, colors in §6).

import {
  Chart,
  LineController,
  BarController,
  LineElement,
  PointElement,
  BarElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";
import type { ChartConfiguration } from "chart.js";
import { HOUR_LABELS, perHour, typicalLine } from "./compute.ts";
import type { LeadsData } from "./types.ts";

Chart.register(
  LineController,
  BarController,
  LineElement,
  PointElement,
  BarElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
);

// Design tokens (§6) used by the chart.
const BLUE = "#2563eb";
const TYPICAL = "#94a3b8";
const BAND = "rgba(37,99,235,.10)";
const GRID = "#eef1f6";
const AXIS = "#94a3b8";

let chart: Chart | null = null;

const baseScales = {
  x: {
    grid: { color: GRID, drawTicks: false },
    border: { display: false },
    ticks: {
      color: AXIS,
      font: { size: 10 },
      autoSkip: true,
      maxRotation: 0,
      autoSkipPadding: 12,
    },
  },
  y: {
    beginAtZero: true,
    grid: { color: GRID, drawTicks: false },
    border: { display: false },
    ticks: {
      color: AXIS,
      font: { size: 10 },
      precision: 0, // integer ticks
    },
  },
};

const basePlugins = {
  legend: { display: false }, // custom HTML legend lives under the chart
  tooltip: {
    intersect: false,
    mode: "index" as const,
  },
};

/** Today's cumulative, truncated to the cutoff hour; null afterwards (§5.1). */
function todayUpToCutoff(today: number[], cutoff: number): (number | null)[] {
  return today.map((v, h) => (h <= cutoff ? v : null));
}

function cumulativeConfig(data: LeadsData, cutoff: number): ChartConfiguration {
  const { high, low } = data.benchmark;
  const typical = typicalLine(high, low);

  return {
    type: "line",
    data: {
      labels: HOUR_LABELS,
      datasets: [
        // Band: draw `low` (invisible), then `high` filling down to it.
        {
          label: "Low",
          data: low,
          borderColor: "transparent",
          pointRadius: 0,
          fill: false,
          order: 3,
        },
        {
          label: "Typical range",
          data: high,
          borderColor: "transparent",
          backgroundColor: BAND,
          pointRadius: 0,
          fill: "-1", // fill to the previous dataset (low)
          order: 3,
        },
        // Typical day (band midpoint), dashed grey.
        {
          label: "Typical day",
          data: typical,
          borderColor: TYPICAL,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          order: 2,
        },
        // Today, bold blue, only up to the cutoff hour.
        {
          label: "Today",
          data: todayUpToCutoff(data.today.cumulative, cutoff),
          borderColor: BLUE,
          borderWidth: 3,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          spanGaps: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      scales: baseScales,
      plugins: basePlugins,
    },
  };
}

function hourlyConfig(data: LeadsData, cutoff: number): ChartConfiguration {
  const { high, low } = data.benchmark;
  const typical = typicalLine(high, low);

  // Today's per-hour leads, only for hours 0..cutoff.
  const todayHourly = perHour(data.today.cumulative).map((v, h) =>
    h <= cutoff ? v : null,
  );
  const typicalHourly = perHour(typical);

  return {
    type: "bar",
    data: {
      labels: HOUR_LABELS,
      datasets: [
        {
          type: "bar",
          label: "Today (per hour)",
          data: todayHourly,
          backgroundColor: BLUE,
          borderRadius: 3,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
          order: 2,
        },
        {
          type: "line",
          label: "Typical (per hour)",
          data: typicalHourly,
          borderColor: TYPICAL,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      scales: baseScales,
      plugins: basePlugins,
    },
  };
}

/** (Re)draw the chart in the given mode into the provided canvas. */
export function renderChart(
  canvas: HTMLCanvasElement,
  data: LeadsData,
  mode: "cumulative" | "hourly",
  cutoff: number,
): void {
  chart?.destroy();
  const config = mode === "cumulative"
    ? cumulativeConfig(data, cutoff)
    : hourlyConfig(data, cutoff);
  chart = new Chart(canvas, config);
}

export function destroyChart(): void {
  chart?.destroy();
  chart = null;
}
