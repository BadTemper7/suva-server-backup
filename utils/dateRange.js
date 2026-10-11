// utils/dateRange.js
// Parses a "YYYY-MM-DD" query param as local-timezone midnight, not UTC midnight
// (new Date("YYYY-MM-DD") is UTC per the ECMA-262 date-only form, which is 8h off
// from Asia/Manila local time — see WT-02).
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

export function getStartOfDay(dateStr) {
  return parseLocalDate(dateStr);
}

export function getEndOfDay(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
