export const ACCESS_STATUSES = ["active", "inactive", "suspended"] as const;
export const SUBSCRIPTION_STATUSES = ["unknown", "trial", "active", "expired", "cancelled", "non_renewing", "promotional", "past_due", "paused"] as const;
export type AccessStatus = typeof ACCESS_STATUSES[number];
export type PlatformOverview = {
  accounts:number;individual_accounts:number;organization_accounts:number;users:number;
  certificates:number;active_certificates:number;inactive_certificates:number;revoked_certificates:number;
  access_statuses:Record<string,number>|null;subscription_statuses:Record<string,number>|null;
  issuance_daily:{ date:string;count:number }[];generated_at:string;
};
export type PlatformAccount = {
  id:string;name:string;account_code:string|null;account_type:string;created_at:string;
  access_status:AccessStatus;revision:number;subscription_status:string;subscription_source:string|null;
  subscription_observed_at:string|null;member_count:number;certificate_count:number;
  active_certificates:number;inactive_certificates:number;revoked_certificates:number;last_issued_at:string|null;
};
export type AuditEvent = { id:string;actor_id:string;action:string;account_id?:string|null;subject_id:string|null;occurred_at:string;details?:Record<string,unknown> };
export type AccountDetail = {
  account:PlatformAccount;access:{status:AccessStatus;revision:number;reason:string|null;changed_by:string|null;changed_at:string};
  subscription:{status:string;source:string;observed_at:string;period_start:string|null;period_end:string|null}|null;
  members:{id:string;user_id:string;email:string|null;role:string;status:string;joined_at:string;email_confirmed_at:string|null}[];
  member_page:number;total_members:number;activity:AuditEvent[];
};
