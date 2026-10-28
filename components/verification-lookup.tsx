"use client";

import { useState, type FormEvent } from "react";

export function VerificationLookup() {
  const [reference, setReference] = useState("");
  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reference.trim();
    if (!trimmed) return;
    window.location.assign(`/verify/${encodeURIComponent(trimmed)}`);
  }
  return (
    <form onSubmit={handleLookup} className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
      <label htmlFor="verification-reference" className="sr-only">Certificate verification ID</label>
      <input
        id="verification-reference"
        type="text"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        placeholder="Enter Certificate ID"
        autoComplete="off"
        required
        maxLength={180}
        className="flex-1 rounded-lg border border-slate-600 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400"
      />
      <button type="submit" className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">
        Verify
      </button>
    </form>
  );
}
