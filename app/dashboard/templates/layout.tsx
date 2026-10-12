import { IssuerBranding } from "@/components/issuer-branding";

export default function TemplateBrandingLayout({ children }: { children:React.ReactNode }) {
  return <><div className="mx-auto max-w-6xl px-6"><IssuerBranding /></div>{children}</>;
}
