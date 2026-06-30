import { serverTimezone } from "./moneyTotals.js";

function tz() {
  return serverTimezone();
}

/** Match documents whose date field falls in this calendar year (business timezone). */
export function matchCalendarYear(fieldPath, year) {
  return {
    $expr: { $eq: [{ $year: { date: fieldPath, timezone: tz() } }, year] },
  };
}

/** Match documents whose date field falls in this calendar month (business timezone). */
export function matchCalendarYearMonth(fieldPath, year, month) {
  return {
    $expr: {
      $and: [
        { $eq: [{ $year: { date: fieldPath, timezone: tz() } }, year] },
        { $eq: [{ $month: { date: fieldPath, timezone: tz() } }, month] },
      ],
    },
  };
}

export function calendarMonthGroup(fieldPath) {
  return { $month: { date: fieldPath, timezone: tz() } };
}
