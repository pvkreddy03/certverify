/** Reusable-format matching shared by certificate issuance and on-demand generation.
 * No generated cover-letter PDF is persisted.
 */
export type LinkedCoverFormat = {
  id: string;
  name: string;
  template_id: string | null;
  report_format_id: string | null;
};
export function matchingCoverFormats<T extends LinkedCoverFormat>(
  available: T[], templateId: string | null, reportFormatId: string | null
): T[] {
  return available.filter(item =>
    (item.template_id === null || item.template_id === templateId) &&
    (item.report_format_id === null || item.report_format_id === reportFormatId)
  ).sort((a, b) => {
    const rank = (format: T) => (format.report_format_id ? 4 : 0) + (format.template_id ? 2 : 0);
    return rank(b) - rank(a) || a.name.localeCompare(b.name);
  });
}
