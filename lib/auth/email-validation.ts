export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 5 || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0].length === 0 || parts[0].length > 64) return false;
  if (parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..")) return false;
  const labels = parts[1].split(".");
  return labels.length >= 2 && labels.every((label) =>
    label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-") &&
    /^[a-z\d-]+$/i.test(label)
  ) && labels.at(-1)!.length >= 2;
}
export const INVALID_EMAIL_MESSAGE = "Enter a valid Email ID (for example, name@example.com).";
