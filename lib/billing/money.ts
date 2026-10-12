export function parseMoney(value: string, exponent = 2) {
  if (
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > 3 ||
    !/^\d+(\.\d+)?$/.test(value.trim())
  )
    throw new Error("Enter a non-negative price using decimal digits.");
  const [whole, fraction = ""] = value.trim().split(".");
  if (fraction.length > exponent)
    throw new Error("Price has too many decimal places.");
  const amount =
    BigInt(whole) * BigInt(10) ** BigInt(exponent) +
    BigInt(fraction.padEnd(exponent, "0") || "0");
  if (amount > BigInt(10000000000))
    throw new Error("Price exceeds the supported amount.");
  return Number(amount);
}
export function formatMoney(minor: number, currency: string, exponent = 2) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);
}
// Invoice calculations remain authoritative in SQL; this helper formats administrative inputs.
