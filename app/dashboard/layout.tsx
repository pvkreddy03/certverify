import { AccountWorkspace } from "@/components/account-switcher";
import { DashboardNavigation } from "@/components/dashboard-navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <><DashboardNavigation /><AccountWorkspace>{children}</AccountWorkspace></>;
}
