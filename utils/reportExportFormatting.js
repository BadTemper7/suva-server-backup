import Setting from "../models/Settings.js";

const DEFAULT_TZ = "Asia/Manila";

let cache = null;
let cacheTime = 0;
const CACHE_MS = 60_000;

/**
 * Timezone, date style, and clock style from Settings (cached briefly).
 */
export async function getReportExportFormatContext() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_MS) {
    return cache;
  }
  try {
    const map = await Setting.getAllSettings();
    cache = {
      timeZone:
        typeof map.timezone === "string" && map.timezone.trim()
          ? map.timezone.trim()
          : DEFAULT_TZ,
      dateFormat: map.dateFormat || "MM/DD/YYYY",
      timeFormat: map.timeFormat || "24h",
    };
  } catch {
    cache = {
      timeZone: DEFAULT_TZ,
      dateFormat: "MM/DD/YYYY",
      timeFormat: "24h",
    };
  }
  cacheTime = now;
  return cache;
}

function localeForDateFormat(dateFormat) {
  switch (String(dateFormat || "")) {
    case "DD/MM/YYYY":
      return "en-GB";
    case "YYYY-MM-DD":
      return "en-CA";
    default:
      return "en-US";
  }
}

/** Calendar date in configured timezone and date style (no time). */
export function formatExportDate(value, ctx) {
  if (value === null || value === undefined) return "N/A";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  const locale = localeForDateFormat(ctx.dateFormat);
  return new Intl.DateTimeFormat(locale, {
    timeZone: ctx.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Date and time in configured timezone, fixed shape:
 * `YYYY-MM-DD h:mm AM/PM` (e.g. `2026-04-07 12:33 AM`).
 */
export function formatExportDateTime(value, ctx) {
  if (value === null || value === undefined) return "N/A";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ctx.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "";

  const year = pick("year");
  const month = pick("month").padStart(2, "0");
  const day = pick("day").padStart(2, "0");
  const hour = pick("hour");
  const minute = pick("minute").padStart(2, "0");
  const rawPeriod = pick("dayPeriod");
  const dayPeriod = rawPeriod ? rawPeriod.toUpperCase() : "";

  if (!year || !month || !day || !hour || !minute || !dayPeriod) return "N/A";

  return `${year}-${month}-${day} ${hour}:${minute} ${dayPeriod}`;
}

/** yyyy-mm-dd in configured TZ for export filenames. */
export function formatExportFilenameDate(ctx) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: ctx.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return formatted.replace(/\//g, "-");
}
