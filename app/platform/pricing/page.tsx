"use client";
import { useEffect, useState } from "react";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import { formatMoney, parseMoney } from "@/lib/billing/money";
import { EMPTY_PLAN, PROPOSED_EXAMPLES } from "@/lib/billing/examples";
import type {
  CatalogPlan,
  CatalogOffer,
  PricingCatalog,
  PlanTerms,
  OfferTerms,
} from "@/lib/billing/types";
function dateInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function field(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}
function date(form: FormData, key: string) {
  const v = field(form, key);
  return v ? new Date(v).toISOString() : null;
}
function Input({
  label,
  name,
  value,
  type = "text",
  required = false,
  min,
  max,
  disabled = false,
  hint,
  step,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  hint?: string;
  step?: string;
}) {
  return (
    <label className="block">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        step={step}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
const currencyChoices = ["INR","USD","EUR","GBP","AED"] as const;
function currencyPrecision(code: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
}
function Pricing() {
  const [catalog, setCatalog] = useState<PricingCatalog>({
    plans: [],
    offers: [],
  });
  const [edit, setEdit] = useState<CatalogPlan | null>(null);
  const [template, setTemplate] = useState<PlanTerms>(EMPTY_PLAN);
  const [offer, setOffer] = useState<CatalogOffer | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [period,setPeriod] = useState<PlanTerms["billing_period"]>(EMPTY_PLAN.billing_period);
  const [unlimited,setUnlimited] = useState(EMPTY_PLAN.certificate_limit===null);
  const [currency,setCurrency] = useState(EMPTY_PLAN.currency);
  const [offerKind,setOfferKind] = useState<OfferTerms["kind"]>("percentage");
  const [offerAudience,setOfferAudience] = useState<OfferTerms["audience"]>("new");
  const [offerCurrency,setOfferCurrency] = useState("INR");
  function selectPlan(next:PlanTerms, editing:CatalogPlan|null=null) {
    setEdit(editing);setTemplate(next);setPeriod(next.billing_period);
    setUnlimited(next.certificate_limit===null);setCurrency(next.currency);
  }
  function selectOffer(next:CatalogOffer|null) {
    setOffer(next);setOfferKind(next?.terms.kind ?? "percentage");
    setOfferAudience(next?.terms.audience ?? "new");setOfferCurrency(next?.terms.currency ?? "INR");
  }
  useEffect(() => {
    let active = true;
    void platformFetch<PricingCatalog>("/api/platform/pricing")
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((f) => {
        if (active) setMessage(f.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await platformFetch("/api/platform/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setCatalog(await platformFetch<PricingCatalog>("/api/platform/pricing"));
      selectPlan(EMPTY_PLAN);
      selectOffer(null);
      setMessage("Pricing change saved with immutable version history.");
    } catch (f) {
      setMessage(f instanceof Error ? f.message : "Pricing change failed.");
    } finally {
      setBusy(false);
    }
  }
  function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      const selectedCurrency=field(f,"currency").toUpperCase();
      const exponent=currencyPrecision(selectedCurrency);
      const terms: PlanTerms = {
        name: field(f, "name"),
        description: field(f, "description"),
        eligibility: f.getAll("eligibility") as PlanTerms["eligibility"],
        audience: field(f, "audience") as PlanTerms["audience"],
        billing_period: period,
        custom_days: period==="custom" ? Number(field(f,"custom_days")) : (t.custom_days||30),
        currency: selectedCurrency,
        currency_exponent: exponent,
        price_minor: parseMoney(field(f, "price"), exponent),
        renewal_price_minor: parseMoney(field(f, "renewal"), exponent),
        extra_seat_price_minor: parseMoney(field(f, "extra"), exponent),
        included_seats: Number(field(f, "included_seats")),
        max_seats: field(f, "max_seats") ? Number(field(f, "max_seats")) : null,
        certificate_limit: unlimited ? null : Number(field(f,"certificate_limit")),
        trial_days: Number(field(f, "trial_days")),
        visible: f.has("visible"),
        features: field(f, "features")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        starts_at: date(f, "starts_at"),
        ends_at: date(f, "ends_at"),
      };
      void act({
        action: "save_plan",
        terms,
        id: edit?.id ?? null,
        revision: edit?.revision ?? 0,
      });
    } catch (f) {
      setMessage(f instanceof Error ? f.message : "Check plan values.");
    }
  }
  function saveOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const kind = field(f, "kind") as OfferTerms["kind"];
    try {
      const value =
        kind === "percentage"
          ? parseMoney(field(f, "value"), 2)
          : kind === "free_trial"
            ? 0
            : parseMoney(field(f, "value"), currencyPrecision(offerCurrency));
      const terms: OfferTerms = {
        name: field(f, "name"),
        kind,
        audience: offerAudience,
        value,
        cycles: kind === "free_trial" ? 1 : Number(field(f, "cycles")),
        trial_days: kind === "free_trial" ? Number(field(f,"trial_days")) : 0,
        currency_exponent: currencyPrecision(offerCurrency),
        currency: ["fixed", "intro_price"].includes(kind) ? offerCurrency : null,
        max_redemptions: field(f, "max_redemptions")
          ? Number(field(f, "max_redemptions"))
          : null,
        plan_ids: f.getAll("plan_ids") as string[],
        account_ids: offerAudience==="selected" ? field(f,"account_ids").split(",").map(s=>s.trim()).filter(Boolean) : [],
        starts_at: date(f, "starts_at"),
        ends_at: date(f, "ends_at"),
      };
      void act({
        action: "save_offer",
        code: field(f, "code"),
        terms,
        id: offer?.id ?? null,
        revision: offer?.revision ?? 0,
      });
    } catch (f) {
      setMessage(f instanceof Error ? f.message : "Check offer values.");
    }
  }
  const t = edit?.terms ?? template;
  const ot = offer?.terms;
  const priceDigits=currencyPrecision(currency);
  const offerMoney=offerKind==="fixed"||offerKind==="intro_price";
  return (
    <div className="space-y-8">
      {message && (
        <p role="status" className="rounded border p-4">
          {message}
        </p>
      )}
      <p>
        Drafts require explicit activation. Editing creates a new version;
        existing subscribers retain agreed historical prices and limits.
        Archived items cannot be reopened.
      </p>
      <section className="rounded border bg-white p-6">
        <h2 className="text-xl font-semibold">Subscription plans</h2>
        {catalog.plans.map((p) => (
          <article key={p.id} className="mt-4 rounded border p-4">
            <h3 className="font-semibold">
              {p.terms.name} — {p.status}
            </h3>
            <p>
              {formatMoney(
                p.terms.price_minor,
                p.terms.currency,
                p.terms.currency_exponent,
              )}{" "}
              / {p.terms.billing_period} ·{" "}
              {p.terms.certificate_limit === null
                ? "Unlimited certificates"
                : `${p.terms.certificate_limit} certificates`}{" "}
              · {p.terms.included_seats} included seats
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                disabled={busy || p.status === "archived"}
                onClick={() => {
                  setEdit(p);
                  setTemplate(p.terms);
                }}
              >
                Edit plan
              </button>
              {["active", "inactive", "archived"]
                .filter((s) => s !== p.status)
                .map((status) => (
                  <button
                    key={status}
                    disabled={busy || p.status === "archived"}
                    onClick={() => {
                      void act({
                        action: "status",
                        kind: "plan",
                        id: p.id,
                        status,
                        revision: p.revision,
                      });
                    }}
                  >
                    {status === "active"
                      ? "Activate plan"
                      : status === "inactive"
                        ? "Deactivate plan"
                        : "Archive plan"}
                  </button>
                ))}
            </div>
          </article>
        ))}
      </section>
      <section className="rounded border bg-white p-6">
        <h2 className="text-xl font-semibold">
          {edit ? "Edit plan terms" : "Create plan draft"}
        </h2>
        <label className="mt-3 block">
          Optional editable pricing example
          <select
            aria-label="Optional editable pricing example"
            value={edit ? "editing" : PROPOSED_EXAMPLES.indexOf(template)}
            onChange={(e) => {
              setEdit(null);
              setTemplate(
                PROPOSED_EXAMPLES[Number(e.target.value)] ?? EMPTY_PLAN,
              );
            }}
            className="ml-3 border p-2"
          >
            <option value={-1}>Empty draft</option>
            {PROPOSED_EXAMPLES.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
            {edit && <option value="editing">Current plan</option>}
          </select>
        </label>
        <form
          key={edit?.version_id ?? template.name}
          onSubmit={savePlan}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <Input label="Plan name" name="name" value={t.name} required />
          <Input
            label="Plan description"
            name="description"
            value={t.description}
          />
          <label>
            Billing period
            <select
              name="billing_period"
              defaultValue={t.billing_period}
              className="mt-1 block border p-2"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom days</option>
            </select>
          </label>
          <label>
            Plan audience
            <select
              name="audience"
              defaultValue={t.audience}
              className="mt-1 block border p-2"
            >
              <option value="standard">Individual or multi-user</option>
              <option value="enterprise">Enterprise / sales assisted</option>
            </select>
          </label>
          <fieldset>
            <legend>Account eligibility</legend>
            {["individual", "organization"].map((v) => (
              <label key={v} className="mr-4">
                <input
                  type="checkbox"
                  name="eligibility"
                  value={v}
                  defaultChecked={t.eligibility.includes(
                    v as "individual" | "organization",
                  )}
                />{" "}
                {v}
              </label>
            ))}
          </fieldset>
          <Input
            label="Custom period days"
            name="custom_days"
            type="number"
            value={t.custom_days}
            min={1}
            max={3660}
            required
          />
          <Input
            label="Currency code"
            name="currency"
            value={t.currency}
            required
          />
          <Input
            label="Currency decimal places"
            name="currency_exponent"
            type="number"
            value={t.currency_exponent}
            min={0}
            max={3}
            required
          />
          <Input
            label="Subscription price"
            name="price"
            value={t.price_minor / 10 ** t.currency_exponent}
            required
          />
          <Input
            label="Agreed renewal price"
            name="renewal"
            value={t.renewal_price_minor / 10 ** t.currency_exponent}
            required
          />
          <Input
            label="Included user seats"
            name="included_seats"
            type="number"
            value={t.included_seats}
            min={1}
            max={10000}
            required
          />
          <Input
            label="Price per additional seat"
            name="extra"
            value={t.extra_seat_price_minor / 10 ** t.currency_exponent}
            required
          />
          <Input
            label="Maximum seats (empty = operational maximum)"
            name="max_seats"
            type="number"
            value={t.max_seats ?? ""}
            min={1}
            max={10000}
          />
          <Input
            label="Certificate limit per billing period"
            name="certificate_limit"
            type="number"
            value={t.certificate_limit ?? 0}
            min={0}
          />
          <label>
            <input
              name="unlimited"
              type="checkbox"
              defaultChecked={t.certificate_limit === null}
            />{" "}
            Unlimited certificate generation
          </label>
          <Input
            label="Trial days"
            name="trial_days"
            type="number"
            value={t.trial_days}
            min={0}
            max={365}
            required
          />
          <Input
            label="Plan starts (your local time)"
            name="starts_at"
            type="datetime-local"
            value={dateInput(t.starts_at)}
          />
          <Input
            label="Plan ends (your local time)"
            name="ends_at"
            type="datetime-local"
            value={dateInput(t.ends_at)}
          />
          <label>
            <input type="checkbox" name="visible" defaultChecked={t.visible} />{" "}
            Visible to eligible customers
          </label>
          <label>
            Features (one per line)
            <textarea
              name="features"
              defaultValue={t.features.join("\n")}
              className="mt-1 block w-full border p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-white"
          >
            Save plan draft/version
          </button>
          <button
            type="button"
            onClick={() => {
              setEdit(null);
              setTemplate(EMPTY_PLAN);
            }}
          >
            Clear plan editor
          </button>
        </form>
      </section>
      <section className="rounded border bg-white p-6">
        <h2 className="text-xl font-semibold">Promotional campaigns</h2>
        {catalog.offers.map((o) => (
          <article key={o.id} className="mt-4 rounded border p-4">
            <h3>
              {o.terms.name} ({o.code}) — {o.status}
            </h3>
            <p>
              {o.redemption_count} redemptions · {o.terms.cycles} discounted
              cycles · expiry{" "}
              {o.terms.ends_at
                ? new Date(o.terms.ends_at).toLocaleString("en-IN")
                : "No scheduled end"}
            </p>
            <button
              disabled={busy || o.status === "archived"}
              onClick={() => setOffer(o)}
            >
              Edit offer
            </button>
            {["active", "inactive", "archived"]
              .filter((s) => s !== o.status)
              .map((status) => (
                <button
                  key={status}
                  disabled={busy || o.status === "archived"}
                  onClick={() => {
                    void act({
                      action: "status",
                      kind: "offer",
                      id: o.id,
                      status,
                      revision: o.revision,
                    });
                  }}
                  className="ml-4"
                >
                  {status === "active"
                    ? "Activate offer"
                    : status === "inactive"
                      ? "Disable offer"
                      : "Archive offer"}
                </button>
              ))}
          </article>
        ))}
      </section>
      <form
        key={offer?.version_id ?? "new-offer"}
        onSubmit={saveOffer}
        className="grid gap-4 rounded border bg-white p-6 sm:grid-cols-2"
      >
        <h2 className="text-xl font-semibold sm:col-span-2">
          {offer ? "Edit promotional offer" : "Create promotional offer draft"}
        </h2>
        <Input label="Offer name" name="name" value={ot?.name} required />
        <Input
          label="Coupon code (permanent)"
          name="code"
          value={offer?.code}
          required
        />
        <label>
          Offer type
          <select
            name="kind"
            defaultValue={ot?.kind ?? "percentage"}
            className="mt-1 block border p-2"
          >
            <option value="percentage">Percentage discount</option>
            <option value="fixed">Fixed discount</option>
            <option value="intro_price">Introductory cycle price</option>
            <option value="free_trial">Free trial</option>
          </select>
        </label>
        <label>
          Offer eligibility
          <select
            name="audience"
            defaultValue={ot?.audience ?? "new"}
            className="mt-1 block border p-2"
          >
            <option value="new">New customers</option>
            <option value="existing">Existing customers</option>
            <option value="selected">Selected accounts</option>
            <option value="all">All eligible accounts</option>
          </select>
        </label>
        <Input
          label="Discount percentage or amount"
          name="value"
          value={
            ot?.value
              ? ot.value /
                (ot.kind === "percentage" ? 100 : 10 ** ot.currency_exponent)
              : 0
          }
          required
        />
        <Input
          label="Amount currency code"
          name="currency"
          value={ot?.currency ?? "INR"}
        />
        <Input
          label="Amount decimal places"
          name="exponent"
          type="number"
          value={ot?.currency_exponent ?? 2}
          min={0}
          max={3}
        />
        <Input
          label="Introductory billing cycles"
          name="cycles"
          type="number"
          value={ot?.cycles ?? 1}
          min={1}
          max={36}
          required
        />
        <Input
          label="Offer trial days"
          name="trial_days"
          type="number"
          value={ot?.trial_days ?? 0}
          min={0}
          max={365}
          required
        />
        <Input
          label="Total redemption limit (empty = unlimited)"
          name="max_redemptions"
          type="number"
          value={ot?.max_redemptions ?? ""}
          min={1}
        />
        <Input
          label="Campaign starts (your local time)"
          name="starts_at"
          type="datetime-local"
          value={dateInput(ot?.starts_at ?? null)}
        />
        <Input
          label="Campaign expires (your local time)"
          name="ends_at"
          type="datetime-local"
          value={dateInput(ot?.ends_at ?? null)}
        />
        <Input
          label="Selected account references (comma separated)"
          name="account_ids"
          value={ot?.account_ids.join(",") ?? ""}
        />
        <fieldset>
          <legend>Restrict to plans (none = all eligible plans)</legend>
          {catalog.plans.map((p) => (
            <label key={p.id} className="block">
              <input
                type="checkbox"
                name="plan_ids"
                value={p.id}
                defaultChecked={ot?.plan_ids.includes(p.id)}
              />{" "}
              {p.terms.name}
            </label>
          ))}
        </fieldset>
        <p className="text-sm">
          Free trials use the trial duration and one redemption cycle.
          Percentage values are percentages; monetary values use the configured
          currency precision. Accepted offers keep their versioned terms after
          campaign expiry.
        </p>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-white"
        >
          Save offer draft/version
        </button>
      </form>
    </div>
  );
}
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <h1 className="text-3xl font-bold">
        Pricing plans and promotional offers
      </h1>
      <PlatformMfa>
        <Pricing />
      </PlatformMfa>
    </main>
  );
}
