/**
 * User-facing Excel dates use day/month/year (Indian convention).
 * The database stores canonical ISO dates so no timezone conversion is involved.
 * Numeric cells from Excel's default 1900 date system are also supported.
 */
export function normalizeBulkDate(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  let day: number;
  let month: number;
  let year: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const indian = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(value);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (indian) {
    day = Number(indian[1]); month = Number(indian[2]); year = Number(indian[3]);
  } else if (/^\d+(?:\.\d+)?$/.test(value)) {
    // Excel 1900 serial date (not a Unix timestamp).
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 61 || serial > 2958465) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    year = date.getUTCFullYear(); month = date.getUTCMonth() + 1; day = date.getUTCDate();
  } else {
    return null;
  }

  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function displayBulkDate(input: string): string {
  const iso = normalizeBulkDate(input);
  if (!iso) return input;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
