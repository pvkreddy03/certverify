"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import type { PlatformOverview } from "@/lib/platform/types";
function Subscriptions(){const [report,setReport]=useState<PlatformOverview|null>(null);const [error,setError]=useState("");useEffect(()=>{let active=true;void platformFetch<PlatformOverview>("/api/platform/overview").then((data)=>{if(active)setReport(data);}).catch((failure)=>{if(active)setError(failure.message);});return()=>{active=false;};},[]);return <div className="space-y-5"><p>Available subscription status summaries are informational. Unknown means no reliable record has been connected.</p>{error && <p role="alert">{error}</p>}{report && Object.entries(report.subscription_statuses ?? {}).map(([status,count])=><p key={status}><Link className="text-blue-700" href={`/platform/accounts?subscription=${status}`}>{status.replaceAll("_"," ")}: {count} accounts</Link></p>)}<p>Configurable pricing plans, promotional offers and subscription administration are scheduled for Stage 5. No prices, quotas, checkout or payment processing are active here.</p></div>;}
export default function PlatformSubscriptionsPage(){return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Subscription administration foundation</h1><PlatformMfa><Subscriptions /></PlatformMfa></main>;}
