"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

/**
 * Only the enrolled user ever sees the QR or setup key. Both encode a TOTP
 * secret, so neither is logged, sent to our server, or placed in a public URL.
 */
export function PlatformMfa({
  children,
  accountSecurity = false,
}: {
  children: ReactNode;
  accountSecurity?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [factor, setFactor] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Checking secure session…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (data.currentLevel === "aal2") {
        if (!cancelled) setReady(true);
        return;
      }
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      if (!cancelled) {
        setFactor(factors.data.totp.find((item) => item.status === "verified")?.id ?? null);
        setMessage(
          accountSecurity
            ? "Set up or verify your authenticator to secure your account."
            : "MFA verification is required for platform administration.",
        );
      }
    }
    void load().catch(() => {
      if (!cancelled) setMessage("MFA session could not be checked. Sign in again.");
    });
    return () => {
      cancelled = true;
    };
  }, [accountSecurity]);

  async function enroll() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: accountSecurity ? "CertVerify account security" : "CertVerify platform approval",
    });
    if (error) {
      setMessage("Authenticator setup failed. Refresh the page and retry, or sign in again.");
      setBusy(false);
      return;
    }

    setFactor(data.id);
    // Supabase returns a standard otpauth:// URI and a manual-entry secret.
    // Render a locally generated PNG with a four-module quiet zone for scanners
    // that cannot decode an embedded SVG or a small QR code.
    setSetupKey(data.totp.secret ?? "");
    try {
      if (!data.totp.uri) throw new Error("Missing TOTP provisioning URI");
      const png = await QRCode.toDataURL(data.totp.uri, {
        type: "image/png",
        width: 320,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      setQr(png);
    } catch {
      // If rasterization fails, keep Supabase's own QR plus manual entry.
      const original = data.totp.qr_code;
      setQr(
        original.startsWith("data:")
          ? original
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(original)}`,
      );
    }
    setMessage("Use Microsoft Authenticator → Other account → Scan QR code. If scanning fails, use the manual setup key below.");
    setBusy(false);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor,
      code: code.trim(),
    });
    if (error) {
      setMessage("The authenticator code could not be verified. Check the current six-digit code and try again.");
    } else {
      setQr("");
      setSetupKey("");
      setCode("");
      setReady(true);
    }
    setBusy(false);
  }

  if (ready) return children;

  return (
    <section className="space-y-4 rounded border bg-white p-6">
      <h2 className="text-xl font-semibold">
        {accountSecurity ? "Account MFA verification" : "Platform MFA verification"}
      </h2>
      <p role="status">{message}</p>

      {qr && (
        <div className="space-y-3">
          <p className="text-sm">In Microsoft Authenticator, select <strong>Other account</strong>, not Work or School.</p>
          <div className="inline-block rounded-lg border-4 border-white bg-white p-3">
            <Image
              src={qr}
              alt="Authenticator setup QR"
              width={320}
              height={320}
              unoptimized
              className="h-80 w-80 max-w-full object-contain"
            />
          </div>
          {setupKey && (
            <details className="rounded border p-4">
              <summary className="cursor-pointer font-medium">
                QR not scanning? Enter setup key manually
              </summary>
              <p className="mt-3 text-sm">
                In Microsoft Authenticator choose Other account → Enter code manually.
                Set the account name to <strong>CertVerify</strong> and enter this setup key:
              </p>
              <label className="mt-3 block text-sm font-medium" htmlFor="certverify-totp-setup-key">
                Authenticator setup key
              </label>
              <input
                id="certverify-totp-setup-key"
                readOnly
                autoComplete="off"
                spellCheck={false}
                value={setupKey}
                className="mt-1 w-full rounded border bg-slate-50 p-3 font-mono text-sm"
              />
              <p className="mt-2 text-xs text-slate-600">
                This is private. Never send this key or the QR code to anyone.
              </p>
            </details>
          )}
        </div>
      )}

      {!factor ? (
        <button
          disabled={busy}
          onClick={() => { void enroll(); }}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Set up authenticator
        </button>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <label className="block">
            Authenticator code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              className="ml-3 rounded border p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          >
            Verify MFA
          </button>
        </form>
      )}
    </section>
  );
}
