"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CertificatesPage() {
  const [certificateId, setCertificateId] = useState("");
  const [client, setClient] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyArea, setPropertyArea] = useState("");
  const [location, setLocation] = useState("");
  const [pricePerSqMeter, setPricePerSqMeter] = useState("");
  const [totalPropertyValue, setTotalPropertyValue] = useState("");
  const [status, setStatus] = useState("Active");

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("certificates").insert({
      user_id: user.id,
      certificate_id: certificateId,
      client,
      valuation_date: valuationDate,
      purpose,
      owner_name: ownerName,
property_type: propertyType,
property_area: propertyArea ? Number(propertyArea) : null,
location,
      price_per_sq_meter: pricePerSqMeter
        ? Number(pricePerSqMeter)
        : null,
      total_property_value: totalPropertyValue
        ? Number(totalPropertyValue)
        : null,
      status,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Certificate saved successfully!");

      setCertificateId("");
      setClient("");
      setValuationDate("");
      setPurpose("");
      setOwnerName("");
      setPropertyType("");
      setPropertyArea("");
      setLocation("");
      setPricePerSqMeter("");
      setTotalPropertyValue("");
      setStatus("Active");
    }

    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Create Certificate
          </h1>

          <p className="mt-2 text-slate-600">
            Enter the property valuation details below.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Certificate ID
              </label>

              <input
                type="text"
                value={certificateId}
                onChange={(e) => setCertificateId(e.target.value)}
                placeholder="CV-2026-000001"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Client
              </label>

              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client name"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Date of Valuation
              </label>

              <input
                type="date"
                value={valuationDate}
                onChange={(e) => setValuationDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Purpose of Valuation
              </label>

              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Bank loan"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Owner Name
              </label>

              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Property owner"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Property Type
              </label>

              <input
                type="text"
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                placeholder="Land / Building / Flat / Commercial"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Property Area
              </label>

              <input
                type="number"
                value={propertyArea}
                onChange={(e) => setPropertyArea(e.target.value)}
                placeholder="Area in sq. m."
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Location
              </label>

              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Property location"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Price per Sq. Meter
              </label>

              <input
                type="number"
                value={pricePerSqMeter}
                onChange={(e) => setPricePerSqMeter(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Total Property Value
              </label>

              <input
                type="number"
                value={totalPropertyValue}
                onChange={(e) => setTotalPropertyValue(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Status
            </label>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Revoked">Revoked</option>
            </select>
          </div>

          {message && (
            <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Certificate"}
          </button>
        </form>
      </div>
    </main>
  );
}