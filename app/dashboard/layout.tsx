import { AccountWorkspace } from "@/components/account-switcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AccountWorkspace>{children}</AccountWorkspace>;
}
