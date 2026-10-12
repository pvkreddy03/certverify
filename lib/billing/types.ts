export type PlanTerms = {
  name: string;
  description: string;
  eligibility: ("individual" | "organization")[];
  audience: "standard" | "enterprise";
  billing_period: "monthly" | "annual" | "custom";
  custom_days: number;
  price_minor: number;
  renewal_price_minor: number;
  currency: string;
  currency_exponent: number;
  included_seats: number;
  extra_seat_price_minor: number;
  max_seats: number | null;
  certificate_limit: number | null;
  trial_days: number;
  visible: boolean;
  features: string[];
  starts_at: string | null;
  ends_at: string | null;
};
export type OfferTerms = {
  name: string;
  kind: "percentage" | "fixed" | "intro_price" | "free_trial";
  audience: "new" | "existing" | "selected" | "all";
  value: number;
  cycles: number;
  trial_days: number;
  currency_exponent: number;
  currency: string | null;
  max_redemptions: number | null;
  plan_ids: string[];
  account_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
};
export type CatalogPlan = {
  id: string;
  version_id: string;
  terms: PlanTerms;
  status?: string;
  revision?: number;
};
export type CatalogOffer = {
  id: string;
  version_id: string;
  code: string;
  terms: OfferTerms;
  status: string;
  revision: number;
  redemption_count: number;
};
export type PricingCatalog = { plans: CatalogPlan[]; offers: CatalogOffer[] };
export type Quote = {
  id: string;
  expires_at: string;
  quote: {
    plan_id: string;
    plan_version_id: string;
    plan: PlanTerms;
    licensed_seats: number;
    regular_renewal_minor: number;
    discounted_cycles: number;
    list_amount_minor: number;
    amount_due_minor: number;
    currency: string;
    trial_days: number;
    offer_terms: Omit<
      OfferTerms,
      "account_ids" | "plan_ids" | "max_redemptions" | "audience"
    > | null;
  };
};
export type SubscriptionStatus = {
  account_id: string;
  account_type: "individual" | "organization";
  can_cancel: boolean;
  can_manage: boolean;
  entitled: boolean;
  status: string;
  trial_used: boolean;
  cancel_at_period_end: boolean;
  allocated_seats: number;
  period: {
    id: string;
    plan_id: string;
    plan_version_id: string;
    name: string;
    billing_period: string;
    starts_at: string;
    ends_at: string;
    licensed_seats: number;
    certificate_limit: number | null;
    certificates_created: number;
    remaining_certificates: number | null;
    payment_status: string;
  } | null;
  requests: {
    id: string;
    status: string;
    intent: string;
    seats: number;
    quote: Quote["quote"];
    scheduled_for: string | null;
  }[];
  history: {
    id: string;
    starts_at: string;
    ends_at: string;
    plan_snapshot: PlanTerms;
    licensed_seats: number;
    list_amount_minor: number;
    amount_due_minor: number;
    currency: string;
    access_kind: string;
    payment_status: string;
  }[];
  payments: {
    id: string;
    amount_minor: number;
    currency: string;
    provider: string;
    status: string;
    created_at: string;
  }[];
};
