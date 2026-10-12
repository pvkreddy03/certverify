import { authenticatedRequest, RequestError } from "@/lib/auth/request";
import { canManageAccount, type AccountMembership } from "@/lib/accounts/context";

export async function teamAdminContext(request: Request) {
  const auth = await authenticatedRequest(request);
  const { data, error } = await auth.client.rpc("cv_list_accounts");
  const account = (data as AccountMembership[] | null)?.find((item) => item.id === auth.accountId);
  if (error || !account || !canManageAccount(account.role) || account.account_type !== "organization") {
    throw new RequestError("An active organization owner or administrator is required.", 403);
  }
  return { ...auth, account };
}
