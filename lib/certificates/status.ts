export type CertificateStatus = "Active" | "Inactive" | "Revoked";

export function statusPresentation(status: string) {
  switch (status) {
    case "Active": return { title: "Certificate Verified", description: "The issuer recognizes this certificate as active.", classes: "bg-green-100 text-green-800", icon: "✓" };
    case "Inactive": return { title: "Certificate Inactive", description: "This certificate is temporarily inactive and must not be relied upon as currently valid.", classes: "bg-amber-100 text-amber-900", icon: "!" };
    case "Revoked": return { title: "Certificate Revoked", description: "The issuer has withdrawn this certificate. It is no longer valid.", classes: "bg-red-100 text-red-800", icon: "!" };
    default: return { title: "Status Unavailable", description: "The certificate's current validity could not be established.", classes: "bg-slate-100 text-slate-800", icon: "?" };
  }
}

export function validateStatusChange(status: CertificateStatus, reason: string, publicReason: string) {
  if (status === "Revoked" && !reason.trim()) return "A revocation reason is required.";
  if (reason.trim().length > 2000) return "Keep the internal reason within 2,000 characters.";
  if (publicReason.trim().length > 500) return "Keep the public explanation within 500 characters.";
  return null;
}
