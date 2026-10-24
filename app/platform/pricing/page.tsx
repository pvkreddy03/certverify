"use client";
import { useEffect, useRef, useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
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
        aria-label={label}
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
      {hint && <span aria-hidden="true" className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
const currencyChoices = ["INR","USD","EUR","GBP","AED"] as const;
function currencyPrecision(code: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
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
  const submitting = useRef(false);
  const [view, setView] = useState<"existing" | "create">("existing");
  const [editorType, setEditorType] = useState<"plan" | "offer">("plan");
  function showExisting(afterSave = false) {
    setView("existing");
    if (afterSave) {
      window.history.replaceState(null, "", "/platform/pricing");
    } else {
      window.history.pushState(null, "", "/platform/pricing");
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openEditor(type: "plan" | "offer") {
    setEditorType(type);
    setView("create");
    window.history.pushState(null, "", `/platform/pricing?view=create&type=${type}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function switchView(next: "existing" | "create") {
    if (busy) return;
    setMessage("");
    if (next === "existing") {
      showExisting();
    } else {
      selectPlan(EMPTY_PLAN);
      selectOffer(null);
      openEditor("plan");
    }
  }
  function switchEditor(type: "plan" | "offer") {
    if (busy) return;
    selectPlan(EMPTY_PLAN);
    selectOffer(null);
    setMessage("");
    openEditor(type);
  }
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
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setView(params.get("view") === "create" ? "create" : "existing");
      setEditorType(params.get("type") === "offer" ? "offer" : "plan");
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);
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
    // This synchronous guard blocks rapid double clicks before React disables the button.
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    const isSave = body.action === "save_plan" || body.action === "save_offer";
    let recorded = false;
    try {
      await platformFetch("/api/platform/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      recorded = true;
      if (isSave) {
        selectPlan(EMPTY_PLAN);
        selectOffer(null);
        showExisting(true);
        setMessage(`${body.action === "save_offer" ? "Promotional offer" : "Subscription plan"} saved with immutable version history. Review it below under Existing pricing and offers; it will not be submitted again.`);
      } else {
        setMessage("Pricing change saved with immutable version history.");
      }
      try {
        setCatalog(await platformFetch<PricingCatalog>("/api/platform/pricing"));
      } catch {
        setMessage("Saved successfully, but the list could not refresh. Reload Existing pricing and offers to see your change. Do not submit again.");
      }
    } catch (error) {
      setMessage(recorded
        ? "The change was saved, but the list could not refresh. Reload to review it; do not submit again."
        : error instanceof Error ? error.message : "Pricing change failed. Please review the fields.");
    } finally {
      submitting.current = false;
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
      <section aria-label="Pricing and offers navigation" className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="pricing-view" className="block text-sm font-bold text-slate-900">Pricing and offers</label>
          <select id="pricing-view" aria-label="Pricing and offers view" value={view} disabled={busy}
            onChange={(event) => switchView(event.target.value as "existing" | "create")}
            className="mt-2 w-full min-w-64 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
            <option value="existing">Existing pricing and offers</option>
            <option value="create">Create new</option>
          </select>
        </div>
        <p className="max-w-md text-sm leading-6 text-slate-600">
          {view === "existing"
            ? "Review saved plans and offers, confirm their status, or select Create new to add one."
            : "Complete one form at a time. After saving, this page returns automatically to your existing items."}
        </p>
      </section>
      {message && (
        <p role="status" className="rounded border p-4">
          {message}
        </p>
      )}
      {view === "existing" && <>
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm leading-6 text-teal-950">
        <p className="text-base font-bold">How to manage prices</p>
        <p><strong>1.</strong> Create or edit a plan below. <strong>2.</strong> Save a draft. <strong>3.</strong> Review and click Activate plan to offer it to customers.</p>
        <p>Existing subscribers keep their agreed terms. Monthly and annual subscriptions currently renew through explicit checkout; automatic UPI and card mandates are not yet implemented.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([["Total plans",catalog.plans.length],["Active plans",catalog.plans.filter(p=>p.status==="active").length],["Active offers",catalog.offers.filter(o=>o.status==="active").length]] as const).map(([label,total])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{total}</div></div>)}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Subscription plans</h2>
        <p className="mt-1 text-sm text-slate-500">Only active plans are offered to eligible customers. Drafts are for review.</p>
        {catalog.plans.map((p) => (
          <article key={p.id} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
                  selectPlan(p.terms,p);
                  setMessage("");
                  openEditor("plan");
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
                      if (status==="archived" && !window.confirm("Permanently archive this plan? Existing subscriber terms remain intact.")) return;
                      if (status==="inactive" && !window.confirm("Deactivate this plan for new subscriptions? Existing subscribers keep their terms.")) return;
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
      </>}
      {view === "create" && <>
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-bold text-slate-900">What would you like to create?
            <select aria-label="What would you like to create?" value={editorType} disabled={busy}
              onChange={(event) => switchEditor(event.target.value as "plan" | "offer")}
              className="mt-2 block min-w-60 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold">
              <option value="plan">Subscription plan</option>
              <option value="offer">Promotional offer / coupon code</option>
            </select>
          </label>
          <button type="button" disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => showExisting()}>← Back to existing pricing and offers</button>
        </div>
      </>}
      {view === "create" && editorType === "plan" && (
      <section id="plan-editor" className="scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">
          {edit ? "Edit plan terms" : "Create plan draft"}
        </h2>
        <label className="mt-3 block">
          Optional editable pricing example
          <select
            aria-label="Optional editable pricing example"
            value={edit ? "editing" : PROPOSED_EXAMPLES.indexOf(template)}
            onChange={(e) => {
              selectPlan(PROPOSED_EXAMPLES[Number(e.target.value)] ?? EMPTY_PLAN);
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
          className="mt-5 grid items-start gap-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 border-b border-slate-100 pb-2"><h3 className="text-lg font-bold text-slate-900">1. Plan identity</h3><p className="text-xs text-slate-500">Name and description shown to eligible customers.</p></div>
          <Input label="Plan name" name="name" value={t.name} required />
          <Input
            label="Plan description"
            name="description"
            value={t.description}
          />
          <div className="sm:col-span-2 border-b border-slate-100 pt-4 pb-2"><h3 className="text-lg font-bold text-slate-900">2. Billing and price</h3><p className="text-xs text-slate-500">Monthly and yearly are standard periods. Custom days only apply to a custom plan.</p></div>
          <label>
            Billing period
            <select
              aria-label="Billing period"
              name="billing_period"
              value={period}
              onChange={(e)=>setPeriod(e.target.value as PlanTerms["billing_period"])}
              className="mt-1 block border p-2"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom duration</option>
            </select>
          </label>
          <label>
            Plan audience
            <select
              aria-label="Plan audience"
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
          <Input label="Custom period days" name="custom_days" type="number" value={t.custom_days}
            min={1} max={3660} required={period==="custom"} disabled={period!=="custom"}
            hint={period==="custom" ? "Number of days per subscription period." : "Not applicable to monthly or yearly plans."} />
          <label className="block">Currency
            <select aria-label="Currency" name="currency" value={currency} onChange={(e)=>setCurrency(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3">
              {currencyChoices.map(code=><option key={code} value={code}>{code}{code==="INR"?" — Indian rupees":""}</option>)}
              {!currencyChoices.includes(currency as (typeof currencyChoices)[number]) && <option value={currency}>{currency}</option>}
            </select>
            <span aria-hidden="true" className="mt-1 block text-xs text-slate-500">Enter ordinary prices (for example ₹999.00). Decimal precision is automatic.</span>
          </label>
          <Input label="Subscription price" name="price" type="number" min={0} step={priceDigits===0 ? "1":"0.01"}
            value={t.price_minor / 10 ** t.currency_exponent} required hint="Charged for the first paid period, before promotions." />
          <Input label="Agreed renewal price" name="renewal" type="number" min={0} step={priceDigits===0 ? "1":"0.01"}
            value={t.renewal_price_minor / 10 ** t.currency_exponent} required hint="Price for later billing periods. Automatic collection is not yet active." />
          <div className="sm:col-span-2 border-b border-slate-100 pt-4 pb-2"><h3 className="text-lg font-bold text-slate-900">3. Users and certificate limits</h3><p className="text-xs text-slate-500">Unlimited refers to certificate count, not subscription duration or licensed users.</p></div>
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
            type="number"
            min={0}
            step={priceDigits===0 ? "1":"0.01"}
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
          <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
            <input name="unlimited" type="checkbox" checked={unlimited} onChange={(e)=>setUnlimited(e.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" />
            <span><strong className="block text-slate-900">Unlimited certificate generation</strong><span className="block text-sm text-slate-600">No certificate-count cap. Uncheck to set a specific limit below.</span></span>
          </label>
          <Input label="Certificate limit per billing period" name="certificate_limit" type="number"
            value={t.certificate_limit ?? 0} min={0} disabled={unlimited} required={!unlimited}
            hint={unlimited ? "Disabled while unlimited generation is selected." : "Maximum certificates issued in one subscription period."} />
          <div className="sm:col-span-2 border-b border-slate-100 pt-4 pb-2"><h3 className="text-lg font-bold text-slate-900">4. Visibility and optional settings</h3><p className="text-xs text-slate-500">Leave plan dates empty for ongoing availability.</p></div>
          <Input
            label="Trial days"
            name="trial_days"
            type="number"
            value={t.trial_days}
            min={0}
            max={365}
            required
          />
          <details className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold text-slate-900">Advanced: publishing schedule and customer-facing details</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            </div>
          </details>
          <button
            disabled={busy}
            className="rounded bg-teal-700 px-4 py-3 font-bold text-white"
          >
            Save plan draft/version
          </button>
          <button
            type="button"
            onClick={() => {
              selectPlan(EMPTY_PLAN);
            }}
          >
            Clear plan editor
          </button>
        </form>
      </section>
      )}
      {view === "existing" && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Promotional campaigns</h2><p className="mt-1 text-sm text-slate-500">Create coupons, trial offers and introductory pricing. Only active offers can be redeemed.</p>
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
              onClick={() => { selectOffer(o);setMessage("");openEditor("offer"); }}
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
                    if (status==="archived" && !window.confirm("Archive this offer permanently? Already-applied discounts retain their terms.")) return;
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
      )}
      {view === "create" && editorType === "offer" && (
      <form
        id="offer-editor"
        key={offer?.version_id ?? "new-offer"}
        onSubmit={saveOffer}
        className="scroll-mt-36 grid items-start gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
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
            aria-label="Offer type"
            name="kind"
            value={offerKind}
            onChange={(e)=>setOfferKind(e.target.value as OfferTerms["kind"])}
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
            aria-label="Offer eligibility"
            name="audience"
            value={offerAudience}
            onChange={(e)=>setOfferAudience(e.target.value as OfferTerms["audience"])}
            className="mt-1 block border p-2"
          >
            <option value="new">New customers</option>
            <option value="existing">Existing customers</option>
            <option value="selected">Selected accounts</option>
            <option value="all">All eligible accounts</option>
          </select>
        </label>
        <Input
          label={offerKind==="free_trial"?"Discount (not applicable)":offerKind==="percentage"?"Discount percentage (e.g. 50 for 50%)":offerKind==="fixed"?"Fixed discount amount":"Introductory cycle price"}
          name="value"
          value={
            ot?.value
              ? ot.value /
                (ot.kind === "percentage" ? 100 : 10 ** ot.currency_exponent)
              : 0
          }
          required={offerKind!=="free_trial"}
          disabled={offerKind==="free_trial"}
          min={0}
          max={offerKind==="percentage"?100:undefined}
          step="0.01"
          hint={offerKind==="free_trial"?"Use the trial duration instead.":offerKind==="percentage"?"Enter a percentage, not a money amount.":"Enter a regular currency amount."}
        />
        <label>Discount currency
          <select aria-label="Discount currency" name="currency" value={offerCurrency} onChange={(e)=>setOfferCurrency(e.target.value)} disabled={!offerMoney} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 disabled:bg-slate-100">
            {currencyChoices.map(code=><option key={code} value={code}>{code}</option>)}
            {!currencyChoices.includes(offerCurrency as (typeof currencyChoices)[number]) && <option value={offerCurrency}>{offerCurrency}</option>}
          </select>
          <span aria-hidden="true" className="mt-1 block text-xs text-slate-500">{offerMoney?"Only used for monetary discounts.":"Not applicable to a percentage or free trial."}</span>
        </label>
        <Input
          label="Introductory billing cycles"
          name="cycles"
          type="number"
          value={ot?.cycles ?? 1}
          min={1}
          max={36}
          disabled={offerKind==="free_trial"}
          required={offerKind!=="free_trial"}
          hint={offerKind==="free_trial"?"Free trial uses one offer cycle.":"How many subscription periods the promotion lasts."}
        />
        <Input
          label="Offer trial days"
          name="trial_days"
          type="number"
          value={ot?.trial_days ?? 0}
          min={offerKind==="free_trial"?1:0}
          max={365}
          disabled={offerKind!=="free_trial"}
          required={offerKind==="free_trial"}
          hint={offerKind==="free_trial"?"Trial duration in days.":"Used only for free-trial offers."}
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
          label="Selected account IDs (comma separated)"
          name="account_ids"
          value={ot?.account_ids.join(",") ?? ""}
          disabled={offerAudience!=="selected"}
          hint={offerAudience==="selected"?"Restrict this offer to named account IDs.":"Only used when eligibility is Selected accounts."}
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
        <p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Campaigns start as drafts and require explicit activation. Free trials use one redemption cycle; percentage discounts do not need a currency. Existing redemptions keep their agreed terms after expiry.</p>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-white"
        >
          Save offer draft/version
        </button>
      </form>
      )}
    </div>
  );
}
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Commercial controls</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-[#17344c]">Pricing and offers</h1>
      <p className="text-sm text-slate-600">Create subscription plans, set team-seat and certificate limits, and publish promotional campaigns.</p>
      <PlatformAdminGuide section="pricing" />
      <PlatformMfa>
        <Pricing />
      </PlatformMfa>
    </main>
  );
}
