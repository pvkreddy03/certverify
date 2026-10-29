/** Use a client-assigned report title for downloadable Word files.
 * Opaque storage object IDs deliberately remain independent from the display name.
 */
export function safeReportFileName(value: string): string {
  const safe = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return safe || "Report";
}
