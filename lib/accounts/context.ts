export const ACCOUNT_HEADER = "x-certverify-account";
export const ACCOUNT_STORAGE_KEY = "certverify.selected-account";

export type AccountMembership = {
  id: string;
  account_name: string;
  account_code: string | null;
  account_type: "individual" | "organization";
  role: "owner" | "admin" | "member" | "viewer";
};

export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function chooseAccount(accounts: AccountMembership[], requested: string | null) {
  return accounts.find((account) => account.id === requested) ?? accounts[0] ?? null;
}

// This is a routing hint, never authorization. PostgreSQL checks current membership
// on every request. Per-tab storage prevents one tab switching another tab's tenant.
export function selectedAccountId(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(ACCOUNT_STORAGE_KEY);
  return isAccountId(value) ? value : null;
}

export function requireSelectedAccountId(): string {
  const id = selectedAccountId();
  if (!id) throw new Error("Choose an account before continuing.");
  return id;
}

export function selectAccount(id: string) {
  if (!isAccountId(id)) throw new Error("Invalid account.");
  window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, id);
}

export function accountHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  const id = selectedAccountId();
  if (id) headers.set(ACCOUNT_HEADER, id);
  return headers;
}

export function canManageAccount(role: AccountMembership["role"]) {
  return role === "owner" || role === "admin";
}
