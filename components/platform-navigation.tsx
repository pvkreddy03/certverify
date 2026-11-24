"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items=[
  {href:"/platform",label:"Overview"},
  {href:"/platform/accounts",label:"Accounts"},
  {href:"/platform/subscriptions",label:"Subscriptions"},
  {href:"/platform/payments",label:"Payments"},
  {href:"/platform/pricing",label:"Pricing and offers"},
  {href:"/platform/branding",label:"Branding approvals"},
  {href:"/platform/contact",label:"Support details"},
  {href:"/platform/audit",label:"Audit history"},
];
export function PlatformNavigation() {
  const pathname=usePathname();
  return <nav aria-label="Platform administration sections" className="mt-4 flex gap-2 overflow-x-auto pb-2">
    {items.map(item=>{
      const active=pathname===item.href || (item.href!=="/platform" && pathname.startsWith(item.href+"/"));
      return <Link key={item.href} href={item.href} aria-current={active?"page":undefined}
        className={active?"shrink-0 rounded-lg border border-teal-300/50 bg-teal-400 px-3 py-2 text-sm font-extrabold text-slate-950 shadow-sm":"shrink-0 rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/15 hover:text-white"}>
        {item.label}
      </Link>;
    })}
  </nav>;
}
