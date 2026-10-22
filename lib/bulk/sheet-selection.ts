import type { ImportedSheet, NamedImportedSheet } from "./xlsx";

export type ImportedSource = { name: string; position: number };
export type SheetSelection = { sheet: ImportedSheet | null; sources: ImportedSource[]; issues: string[] };

const key = (header: string) => header.trim().toLowerCase();

/**
 * Merge only explicitly chosen worksheets. A sheet may reorder columns, but it
 * must contain exactly the same column names as the first selected sheet.
 * Never issue a partial batch if one selected sheet cannot be merged.
 */
export function combineSelectedSheets(
  workbook: NamedImportedSheet[],
  selectedNames: string[],
): SheetSelection {
  const failure = (issue: string): SheetSelection => ({ sheet: null, sources: [], issues: [issue] });
  if (!selectedNames.length) return failure("Choose which Excel sheets to import, or select all sheets.");
  if (new Set(selectedNames).size !== selectedNames.length) return failure("A worksheet was selected more than once.");
  const chosen = selectedNames.map(name => workbook.find(sheet => sheet.name === name));
  if (chosen.some(sheet => !sheet)) return failure("The selected worksheet could not be found. Upload the workbook again.");
  const selected = chosen as NamedImportedSheet[];
  const first = selected[0];
  if (!first.headers.length) return failure('Sheet "' + first.name + '" does not contain column headers.');
  const reference = first.headers.map(key);
  if (reference.some(name => !name) || new Set(reference).size !== reference.length)
    return failure('Sheet "' + first.name + '" has blank or duplicated column headers.');
  const rows: string[][] = [];
  const sources: ImportedSource[] = [];
  for (const item of selected) {
    if (!item.headers.length) return failure('Sheet "' + item.name + '" is empty or missing column headers. Unselect it or correct the file.');
    const current = item.headers.map(key);
    const missing = reference.filter(col => !current.includes(col));
    const extra = current.filter(col => !reference.includes(col));
    if (missing.length || extra.length || current.length !== reference.length) {
      const differences = [
        missing.length ? "missing: " + missing.join(", ") : "",
        extra.length ? "extra: " + extra.join(", ") : "",
      ].filter(Boolean).join("; ");
      return failure('Sheet "' + item.name + '" does not have the same columns as "' + first.name + '". ' + (differences || "The columns do not match.") + " Correct the columns or import sheets separately.");
    }
    const indexes = reference.map(col => current.indexOf(col));
    item.rows.forEach((row, position) => {
      rows.push(indexes.map(index => row[index] ?? ""));
      sources.push({ name: item.name, position: position + 1 });
    });
  }
  if (!rows.length) return failure("The selected sheets contain no certificate rows.");
  if (rows.length > 100) return failure("The selected sheets contain " + rows.length + " certificates. The maximum is 100 across all selected sheets. Choose fewer sheets or split the batch.");
  return { sheet: { headers: first.headers, rows }, sources, issues: [] };
}
