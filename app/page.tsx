import Link from "next/link";
import { VerificationLookup } from "@/components/verification-lookup";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
              C
            </div>

            <span className="text-xl font-bold tracking-tight text-slate-900">
              CertVerify
            </span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#how-it-works" className="hover:text-slate-900">
              How It Works
            </a>

            <a href="#professionals" className="hover:text-slate-900">
              For Professionals
            </a>

            <a href="#verify" className="hover:text-slate-900">
              Verify
            </a>

            <a
  href="/login"
  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
>
  Login
</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col px-6 py-20 lg:py-28">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700">
            Secure Certificate Verification
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            Create. Verify. Trust.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            CertVerify helps professionals create secure digital verification
            records for certificates, reports, opinions, estimates and
            valuations.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/signup" className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700">
              Get Started
            </Link>

            <a href="#verify" className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50">
              Verify a Certificate
            </a>
          </div>
        </div>

        {/* Features */}
        <div
          id="how-it-works"
          className="mt-20 grid gap-6 sm:grid-cols-3"
        >
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-2xl">🔐</div>

            <h2 className="mt-4 font-semibold text-slate-900">
              Secure Records
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Maintain an official verification record for every certificate
              you issue.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-2xl">📱</div>

            <h2 className="mt-4 font-semibold text-slate-900">
              QR Verification
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add a QR code to your document so anyone can verify it online.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-2xl">✓</div>

            <h2 className="mt-4 font-semibold text-slate-900">
              Easy to Trust
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Show selected certificate details without exposing your private
              records.
            </p>
          </div>
        </div>
      </section>

      {/* Professional section */}
      <section
        id="professionals"
        className="border-t border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-600">
              BUILT FOR PROFESSIONALS
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              One platform. Any professional certificate.
            </h2>

            <p className="mt-4 leading-7 text-slate-600">
              Create your own certificate fields once and reuse them whenever
              you issue a new certificate.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900">Valuers</h3>
              <p className="mt-2 text-sm text-slate-600">
                Valuation reports and certificates
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900">Lawyers</h3>
              <p className="mt-2 text-sm text-slate-600">
                Legal opinions and certificates
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900">CA / CS</h3>
              <p className="mt-2 text-sm text-slate-600">
                Professional certificates and reports
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900">Engineers</h3>
              <p className="mt-2 text-sm text-slate-600">
                Estimates and technical certificates
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Verification section */}
      <section id="verify" className="bg-slate-900">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-300">
              VERIFY A DOCUMENT
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
              Check a certificate instantly.
            </h2>

            <p className="mt-4 leading-7 text-slate-300">
              Enter the certificate verification ID printed on the document or
              scan its QR code.
            </p>

            <VerificationLookup />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 CertVerify. All rights reserved.</p>

          <p>Secure digital certificate verification.</p>
        </div>
      </footer>
    </main>
  );
}