/** Use a client-assigned title in the filename. Internal object paths are opaque. */
export function safeReportFileName(value: string, maxLength = 120): string {
  const safe = value
    .replace(/[<>:"\/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, maxLength);
  return safe || "Report";
}
