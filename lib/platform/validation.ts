import { isAccountId } from "../accounts/context";
import { ACCESS_STATUSES,SUBSCRIPTION_STATUSES } from "./types";
export class PlatformInputError extends Error {}
export function integer(value:string|null,fallback:number,maximum=10000) {
  if (value===null) return fallback;
  if (!/^[1-9][0-9]*$/.test(value) || Number(value)>maximum) throw new PlatformInputError("Invalid page or reporting range.");
  return Number(value);
}
function filter(value:string|null,allowed:readonly string[]) {
  if (!value) return null;
  if (!allowed.includes(value)) throw new PlatformInputError("Invalid report filter.");
  return value;
}
export function accountFilters(params:URLSearchParams) {
  const search=(params.get("search") ?? "").trim();
  if (search.length>200) throw new PlatformInputError("Search must be 200 characters or fewer.");
  return { p_search:search,p_type:filter(params.get("type"),["individual","organization"]),
    p_status:filter(params.get("status"),ACCESS_STATUSES),p_subscription:filter(params.get("subscription"),SUBSCRIPTION_STATUSES),
    p_page:integer(params.get("page"),1),p_limit:integer(params.get("limit"),25,50) };
}
export function accountId(value:string) {
  if (!isAccountId(value)) throw new PlatformInputError("Invalid account reference.");
  return value;
}
export function accessChange(body:unknown) {
  if (!body || typeof body!=="object") throw new PlatformInputError("Invalid access change.");
  const value=body as Record<string,unknown>;
  if (typeof value.status!=="string" || !ACCESS_STATUSES.includes(value.status as typeof ACCESS_STATUSES[number]) ||
      typeof value.reason!=="string" || !value.reason.trim() || value.reason.trim().length>2000 ||
      !Number.isSafeInteger(value.revision) || Number(value.revision)<0) throw new PlatformInputError("A valid status, reason and account revision are required.");
  return { p_status:value.status,p_reason:value.reason.trim(),p_revision:value.revision };
}
