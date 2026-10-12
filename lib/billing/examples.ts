import type { PlanTerms } from "./types";
// Optional editable form templates, never seeded or used by entitlement/pricing calculations.
const base: PlanTerms = {
  name: "",
  description: "Editable proposed example — review before activation",
  eligibility: ["organization"],
  audience: "standard",
  billing_period: "monthly",
  custom_days: 30,
  price_minor: 0,
  renewal_price_minor: 0,
  currency: "INR",
  currency_exponent: 2,
  included_seats: 1,
  extra_seat_price_minor: 0,
  max_seats: null,
  certificate_limit: null,
  trial_days: 0,
  visible: true,
  features: [],
  starts_at: null,
  ends_at: null,
};
export const EMPTY_PLAN = base;
export const PROPOSED_EXAMPLES: PlanTerms[] = [
  {
    ...base,
    name: "Limited monthly example",
    price_minor: 39900,
    renewal_price_minor: 39900,
    certificate_limit: 20,
    eligibility: ["individual", "organization"],
  },
  {
    ...base,
    name: "Individual unlimited example",
    price_minor: 99900,
    renewal_price_minor: 99900,
    eligibility: ["individual"],
    max_seats: 1,
  },
  {
    ...base,
    name: "Organization unlimited example",
    price_minor: 99900,
    renewal_price_minor: 99900,
    included_seats: 5,
    extra_seat_price_minor: 39900,
    eligibility: ["organization"],
  },
];
