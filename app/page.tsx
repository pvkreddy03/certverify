import Link from "next/link";
import { VerificationLookup } from "@/components/verification-lookup";

const benefits=[
  {number:"01",icon:"◇",title:"Secure records",description:"Maintain an authoritative verification record for every certificate, valuation or report you issue."},
  {number:"02",icon:"▦",title:"Instant QR verification",description:"One scan opens a current public status page without exposing confidential document fields."},
  {number:"03",icon:"✓",title:"Designed for teams",description:"Use flexible templates, shared organization access and up to 100 certificates in a bulk Excel import."},
];

export default function Home(){
  return <main className="cv-page">
    <header className="border-b border-[#e8edf2] bg-white/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-3" aria-label="CertVerify home">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#163c57] to-[#0b9186] text-white shadow-[0_5px_17px_rgba(10,106,102,.2)]">
            <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 5 5L20 6M3 3h11M3 21h18"/></svg>
          </span>
          <span className="text-xl font-extrabold tracking-tight text-[#152b43]">CertVerify<span className="text-[#109b8e]">.</span></span>
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold sm:gap-5" aria-label="Website navigation">
          <a href="#how-it-works" className="hidden text-[#53687f] hover:text-[#0b827b] sm:inline">How It Works</a>
          <a href="#professionals" className="hidden text-[#53687f] hover:text-[#0b827b] md:inline">For Professionals</a>
          <a href="#verify" className="text-[#53687f] hover:text-[#0b827b]">Verify</a>
          <Link href="/login" className="cv-secondary !px-4 !py-2.5 text-sm">Login</Link>
          <Link href="/signup" className="cv-primary !px-4 !py-2.5 text-sm">Get Started <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>

    <section className="relative overflow-hidden">
      <div className="cv-shell grid min-h-[590px] items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.12fr_.88fr]">
        <div className="cv-entrance">
          <span className="cv-pill">✦ &nbsp; SECURE CERTIFICATE VERIFICATION</span>
          <h1 className="mt-7 max-w-3xl text-[48px] leading-[1.07] font-extrabold tracking-[-.055em] text-[#102640] sm:text-[64px] lg:text-[71px]">
            Create.<br/>Verify.<br/><span className="bg-gradient-to-r from-[#078981] to-[#2b9e91] bg-clip-text text-transparent">Trust.</span>
          </h1>
          <p className="mt-6 max-w-[570px] text-base leading-8 text-[#60738c] sm:text-lg">
            Professional certificate authentication, made beautifully simple.
            Create verified records, issue unique QR codes and give clients an easy way to check the status of your work.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="cv-primary !px-7 !py-3.5">Start issuing certificates →</Link>
            <a href="#verify" className="cv-secondary !px-7 !py-3.5">Verify a Certificate</a>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[#547184]">
            <span className="flex items-center gap-2"><span className="text-[#0c9b89]">✓</span> Individual & organization accounts</span>
            <span className="flex items-center gap-2"><span className="text-[#0c9b89]">✓</span> Custom templates</span>
            <span className="flex items-center gap-2"><span className="text-[#0c9b89]">✓</span> Secure public verification</span>
          </div>
        </div>
        <div aria-hidden="true" className="relative mx-auto w-full max-w-[455px] py-8">
          <div className="absolute inset-[5%] rotate-6 rounded-[36px] bg-gradient-to-br from-[#bcefe4] to-[#dfeaf8] opacity-65 blur-3xl"/>
          <div className="relative rotate-[-2deg] rounded-[27px] border border-[#e2eaf1] bg-white p-6 shadow-[0_30px_75px_rgba(16,38,64,.16)] sm:p-8">
            <div className="flex items-center justify-between border-b border-[#edf0f3] pb-5">
              <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e3f8f2] text-[#0a887d]">✓</span><span className="text-sm font-extrabold text-[#20344b]">Certificate verification</span></span>
              <span className="rounded-full bg-[#e1f8ec] px-3 py-1.5 text-xs font-bold text-[#0b866a]">● Active</span>
            </div>
            <p className="mt-6 text-[10px] font-bold tracking-[.15em] text-[#8a99aa]">CERTIFICATE NUMBER</p>
            <p className="mt-2 text-xl font-extrabold tracking-tight text-[#1e3048]">CV-2026-00001</p>
            <div className="mt-7 grid grid-cols-[125px_1fr] items-center gap-5">
              <div className="rounded-2xl border border-[#dae6eb] bg-white p-3">
                <svg viewBox="0 0 100 100" className="h-full w-full text-[#172f41]" fill="currentColor">
                  <path d="M0 0h31v31H0zm7 7v17h17V7zm62-7h31v31H69zm7 7v17h17V7zM0 69h31v31H0zm7 7v17h17V76z" fillRule="evenodd"/>
                  <path d="M11 11h9v9h-9zM80 11h9v9h-9zM11 80h9v9h-9zM41 0h9v10h-9zM53 0h10v20H53zM38 18h18v9H38zM38 38h10v10H38zM51 33h11v12H51zM69 41h10v8H69zM83 39h17v9H83zM0 41h10v18H0zM16 39h16v10H16zM40 53h8v14h-8zM55 55h13v8H55zM75 57h9v18h-9zM89 54h11v11H89zM38 74h11v12H38zM55 72h12v11H55zM69 86h10v14H69zM85 83h15v17H85zM0 56h25v8H0z"/>
                </svg>
              </div>
              <div className="space-y-3"><p className="text-xs font-semibold text-[#7b8a9c]">ISSUED BY</p>
                <p className="text-sm font-extrabold text-[#1c2e45]">Professional issuer</p>
                <div className="h-2 w-full rounded-full bg-[#edf2f5]"/><div className="h-2 w-3/4 rounded-full bg-[#edf2f5]"/>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e8f8f0] px-2.5 py-1.5 text-[11px] font-bold text-[#10795f]">✓ Verified record</span>
              </div>
            </div>
            <div className="mt-7 flex items-center justify-between rounded-xl bg-[#f3f8f9] p-3 text-[11px] font-medium text-[#65798e]">
              <span>Secure verification reference</span><span className="font-semibold text-[#0a8779]">Live status ↗</span>
            </div>
          </div>
          <div className="absolute -bottom-2 -left-5 rotate-3 rounded-2xl border border-[#dbede7] bg-white p-4 shadow-xl">
            <p className="text-xs font-extrabold text-[#177c75]">✓ Verification ready</p>
            <p className="mt-1 text-[11px] text-[#8391a1]">Trusted document records</p>
          </div>
          <p className="relative mt-7 text-center text-[11px] font-medium text-[#8b99a9]">Illustrative certificate preview — not a real certificate.</p>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="border-y border-[#e7eef1] bg-white/80 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="cv-eyebrow">BUILT FOR CONFIDENCE</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#1a3048] sm:text-4xl">Better verification. Less manual effort.</h2>
        <p className="mt-4 max-w-xl text-[#66788d]">An elegant workflow from certificate creation to public verification.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {benefits.map(card=><div key={card.number} className="cv-card cv-card--interactive p-7">
            <div className="flex items-start justify-between"><div className="cv-glow-icon text-xl font-extrabold">{card.icon}</div><span className="text-xs font-extrabold text-[#aab6c2]">{card.number}</span></div>
            <h3 className="mt-6 text-lg font-extrabold text-[#24354c]">{card.title}</h3>
            <p className="mt-3 text-sm leading-7 text-[#708094]">{card.description}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section id="professionals" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="cv-eyebrow">FOR YOUR PROFESSION</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-[#192f47] sm:text-4xl">One platform. Any professional certificate.</h2>
        <p className="mt-4 text-[#65788b]">Adapt reusable templates to the documents your organization issues.</p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Valuers","Property valuation reports and professional certificates","⌂"],
            ["Lawyers","Legal opinions and document attestations","§"],
            ["CA / CS","Professional declarations and reports","▤"],
            ["Engineers","Inspection reports and technical assessments","◇"],
          ].map(([title,desc,icon])=><div key={title} className="cv-card cv-card--interactive p-6">
            <span className="cv-glow-icon !h-12 !w-12 text-xl font-bold">{icon}</span>
            <h3 className="mt-5 font-extrabold text-[#1f344d]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6c7e90]">{desc}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section id="verify" className="relative overflow-hidden bg-[#0d213a] py-16 sm:py-24">
      <div className="pointer-events-none absolute -right-16 -top-24 h-96 w-96 rounded-full bg-[#2fa99c]/15 blur-[110px]"/>
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="cv-eyebrow !text-[#7adfcb]">VERIFY A DOCUMENT</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Check a certificate instantly.</h2>
          <p className="mt-4 leading-7 text-[#c4d3df]">Enter the verification ID printed on a document or scan its QR code. No account required.</p>
          <VerificationLookup />
        </div>
      </div>
    </section>
    <footer className="border-t border-[#dfe9ee] bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-xs font-semibold text-[#75889a] sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 CertVerify. All rights reserved.</p><p>Professional records. Verifiable trust.</p>
      </div>
    </footer>
  </main>;
}
