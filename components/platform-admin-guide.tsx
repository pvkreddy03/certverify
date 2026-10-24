import Link from "next/link";

type Section = "accounts" | "account" | "subscriptions" | "payments" | "pricing" | "branding" | "contact" | "audit";
const help:Record<Section,{eyebrow:string,title:string,description:string,tips:string[],next:{label:string,href:string}}> = {
  accounts:{eyebrow:"Customer operations",title:"Find and support a customer",description:"Search accounts and inspect membership, subscription, and issuance totals before making access changes.",tips:["Access suspension does not erase existing verification records.","Open an account to see its security status and members."],next:{label:"Review subscriptions",href:"/platform/subscriptions"}},
  account:{eyebrow:"Customer investigation",title:"Review before changing access",description:"Account status controls permissions, not historic certificate validity. Confirm the customer and record a reason before any change.",tips:["Suspensions block new authenticated operations.","Billing changes belong in Subscription administration."],next:{label:"Open subscription administration",href:"/platform/subscriptions"}},
  subscriptions:{eyebrow:"Customer billing",title:"Review entitlements and due dates",description:"See active seats, certificate use, paid periods and pending requests. Complimentary grants are exceptional and require an audit reason.",tips:["A complimentary grant never represents a payment.","Automatic UPI/card charges are not implemented yet."],next:{label:"Manage plans and prices",href:"/platform/pricing"}},
  payments:{eyebrow:"Razorpay Test Mode",title:"Verify payment before granting access",description:"Track test payment attempts and reconcile gateway evidence. Never assume that a browser callback or a submitted refund is final.",tips:["An authorized payment is not necessarily captured.","Production money collection and automatic mandates are disabled."],next:{label:"Review customer subscriptions",href:"/platform/subscriptions"}},
  pricing:{eyebrow:"Plans and coupons",title:"Create → Save draft → Activate",description:"Only active plans and promotions are available to eligible customers. All financial terms retain immutable versions.",tips:["Unlimited certificates means no count limit for that subscription period.","Monthly/yearly periods do not need custom day counts."],next:{label:"Review subscribed customers",href:"/platform/subscriptions"}},
  branding:{eyebrow:"Trust and identity",title:"Independently review the requested changes",description:"Compare old and proposed organization branding, confirm logo/identity evidence, and approve, reject or request further details.",tips:["A requester cannot approve their own branding change.","Scoped edit permissions expire and do not grant unrestricted access."],next:{label:"Review audit history",href:"/platform/audit"}},
  contact:{eyebrow:"Public support",title:"How customers reach your team",description:"Only fill in contact details you actually monitor. Blank values are hidden from the public login page.",tips:["This does not update individual customer support contacts.","Test public-facing contact links after saving."],next:{label:"Return to overview",href:"/platform"}},
  audit:{eyebrow:"Accountability",title:"Every important decision leaves a record",description:"Use the audit trail to trace access, billing and branding changes. This record is read-only.",tips:["Search using the account reference when available.","Audit evidence should not be overwritten or deleted."],next:{label:"Review customer accounts",href:"/platform/accounts"}}
};
export function PlatformAdminGuide({section}:{section:Section}) {
  const item=help[section];
  return <section aria-label="Administration guidance" className="rounded-2xl border border-teal-100 bg-gradient-to-r from-white to-teal-50 p-5 shadow-sm sm:p-6">
    <p className="text-xs font-extrabold uppercase tracking-[.16em] text-teal-700">{item.eyebrow}</p>
    <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl"><h2 className="text-lg font-extrabold text-slate-900">{item.title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p></div>
      <Link href={item.next.href} className="shrink-0 rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50">{item.next.label} →</Link>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">{item.tips.map(tip=><span key={tip} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{tip}</span>)}</div>
  </section>;
}
