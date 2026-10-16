import { AccountWorkspace } from "@/components/account-switcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Workspace resolves the role and renders one ribbon with only relevant links.
  return <AccountWorkspace>{children}</AccountWorkspace>;
}
