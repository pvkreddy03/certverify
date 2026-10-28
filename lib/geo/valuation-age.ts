/**
 * Age bands are calculated from the recorded valuation date, never from the
 * certificate issue date. Date-only comparisons use the viewer's calendar day.
 */
export type ValuationAgeBand =
  | "under-6-months"
  | "6-to-12-months"
  | "1-to-2-years"
  | "over-2-years"
  | "unknown";

export const VALUATION_AGE_LEGEND: ReadonlyArray<{
  key: ValuationAgeBand;
  label: string;
  color: string;
}> = [
  { key: "under-6-months", label: "Under 6 months", color: "#15803d" },
  { key: "6-to-12-months", label: "6–12 months", color: "#d97706" },
  { key: "1-to-2-years", label: "1–2 years", color: "#2563eb" },
  { key: "over-2-years", label: "Older than 2 years", color: "#dc2626" },
  { key: "unknown", label: "Date unavailable", color: "#64748b" },
];

function parseDateOnly(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  if (year < 1900 || year > 9999 || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const result = Date.UTC(year, month, day);
  const parsed = new Date(result);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) return null;
  return result;
}

function monthsEarlier(today: Date, months: number): number {
  const year = today.getFullYear();
  const month = today.getMonth() - months;
  const monthStart = new Date(Date.UTC(year, month, 1));
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(today.getDate(), lastDay));
}

/**
 * At exactly six months, the orange band starts; at exactly one year, blue;
 * at exactly two years, blue remains, and only older dates become red.
 * Missing, invalid or future valuation dates are never labelled recent.
 */
export function valuationAgeBand(
  valuationDate: string | null | undefined,
  asOf: Date,
): ValuationAgeBand {
  if (Number.isNaN(asOf.getTime())) return "unknown";
  const recorded = parseDateOnly(valuationDate);
  if (recorded === null) return "unknown";
  const today = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (recorded > today) return "unknown";
  if (recorded > monthsEarlier(asOf, 6)) return "under-6-months";
  if (recorded > monthsEarlier(asOf, 12)) return "6-to-12-months";
  if (recorded >= monthsEarlier(asOf, 24)) return "1-to-2-years";
  return "over-2-years";
}

export function valuationAgeInfo(band: ValuationAgeBand) {
  return VALUATION_AGE_LEGEND.find(item => item.key === band) ?? VALUATION_AGE_LEGEND[4];
}
