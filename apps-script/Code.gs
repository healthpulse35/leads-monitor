/**
 * Leads Monitor — Apps Script data endpoint (§3.2).
 *
 * Reads ONLY the two aggregate tabs (daily summary + Cumul. Leads) and returns
 * the JSON contract the dashboard expects. Never exposes lead-level/PII tabs.
 *
 * Deploy: Extensions ▸ Apps Script ▸ paste this file ▸ Deploy ▸ New deployment
 *   - Type: Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the resulting /exec URL into the dashboard's .env as VITE_DATA_URL.
 */

// ==== CONFIG ====
const SPREADSHEET_ID = '1CH7e50P8ZWeK1uL6GQyWdhFobPUDROmThzE2vmXSxxo';
const DAILY_TAB = 'June 2026';      // monthly daily-summary tab (confirmed against the sheet)
const CUMUL_TAB = 'Cumul. Leads';   // the cumulative dashboard tab

function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const out = {
    syncedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    today: readToday_(ss),
    benchmark: {
      high: readCumulRow_(ss, 'Benchmark High'),
      low: readCumulRow_(ss, 'Benchmark Low')
    },
    daily: readDaily_(ss)
  };
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function readToday_(ss) {
  return {
    date: readCumulDateForLabel_(ss, 'Today'),
    label: 'Today',
    cumulative: readCumulRow_(ss, 'Today')
  };
}

/**
 * Returns the 24 CUMULATIVE hourly values for a labelled row
 * (Today / Benchmark High / Benchmark Low).
 *
 * The real Cumul. Leads tab has TWO blocks, each carrying these same labels:
 *   - a "With Hour"  block — per-hour counts   ← NOT what the dashboard wants
 *   - a "Cumulative" block — running totals    ← what the dashboard needs
 * The per-hour block appears first, so a naive label search grabs the wrong
 * numbers. We therefore anchor on the "Cumulative" section header and read the
 * labelled row beneath it. Hours run 0..23 left-to-right; values sit to the
 * right of the label (a blank separator column is dropped by the numeric filter).
 */
function readCumulRow_(ss, label) {
  const sh = ss.getSheetByName(CUMUL_TAB);
  if (!sh) return new Array(24).fill(0);
  const values = sh.getDataRange().getValues();

  // Locate the "Cumulative" section header; search for the label below it.
  let start = 0;
  for (let r = 0; r < values.length; r++) {
    if (values[r].some(function (v) {
      return String(v).trim().toLowerCase() === 'cumulative';
    })) {
      start = r;
      break;
    }
  }

  for (let r = start; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c]).trim().toLowerCase() === label.toLowerCase()) {
        const nums = values[r].slice(c + 1).map(toNumOrNull_).filter(function (v) {
          return v !== null;
        });
        return padTo24_(nums);
      }
    }
  }
  return new Array(24).fill(0);
}

function readCumulDateForLabel_(ss) {
  // The cumulative tab's "Today" tracks TODAY(); use the newest daily date.
  const daily = readDaily_(ss);
  return daily.length ? daily[daily.length - 1].date : '';
}

function readDaily_(ss) {
  const sh = ss.getSheetByName(DAILY_TAB);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  let h = -1;
  const col = {};
  for (let r = 0; r < values.length; r++) {
    const row = values[r].map(function (x) { return String(x).trim(); });
    if (row.indexOf('Paid Leads') !== -1 && row.indexOf('Date') !== -1) {
      h = r;
      row.forEach(function (name, i) { col[name] = i; });
      break;
    }
  }
  if (h === -1) return [];
  const out = [];
  for (let r = h + 1; r < values.length; r++) {
    const date = formatDate_(values[r][col['Date']], ss);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) continue; // skip non-date / junk rows
    out.push({
      date: date,
      paidLeads: toNumOrNull_(values[r][col['Paid Leads']]),
      revenue: toNumOrNull_(values[r][col['Revenue']]),
      cpl: toNumOrNull_(values[r][col['CPL']]),
      adjProfit: toNumOrNull_(values[r][col['Adj. Profit']]),
      roas: toNumOrNull_(values[r][col['ROAS']])
    });
  }
  return out;
}

function toNumOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/[$,%\s]/g, '');
  if (/DIV\/0/i.test(s) || s === '-' || s === '') return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function padTo24_(a) {
  const r = a.slice(0, 24);
  while (r.length < 24) r.push(r.length ? r[r.length - 1] : 0);
  return r;
}

function formatDate_(v, ss) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy');
  }
  return String(v).trim();
}
