"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

const BUCKET = "certverify-user-avatars";

type ContactProfile = {
  user_id: string;
  display_name: string;
  contact_email: string | null;
  mobile: string | null;
  job_title: string | null;
  city: string | null;
  bio: string | null;
  avatar_path: string | null;
  updated_at: string;
};

function Field({ title, value, onChange, placeholder = "", type = "text", maxLength = 120 }: {
  title: string; value: string; onChange: (text: string) => void;
  placeholder?: string; type?: "text" | "email" | "tel"; maxLength?: number;
}) {
  return <label className="block text-sm font-bold text-[#31526a]">{title}
    <input type={type} className="cv-field mt-2" value={value}
      onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength}/>
  </label>;
}

async function compressedWebp(photo: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    throw new Error("Choose a JPG, PNG or WebP profile photo.");
  }
  if (photo.size > 5 * 1024 * 1024) throw new Error("Choose a photo smaller than 5 MB.");
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.type !== "image/webp" || blob.size > 1024 * 1024) {
      throw new Error("Unable to prepare a profile photo below 1 MB.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

export default function ProfilePage() {
  const [userId, setUserId] = useState("");
  const [workspace, setWorkspace] = useState<AccountMembership | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Sign in to view your profile.");
        const [profile, original, workspaces] = await Promise.all([
          supabase.from("cv_user_contact_profiles").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("professional_name").eq("user_id", user.id).maybeSingle(),
          supabase.rpc("cv_list_accounts"),
        ]);
        if (profile.error) throw new Error("Your profile is temporarily unavailable: " + profile.error.message);
        if (!active) return;
        if (!workspaces.error) {
          const selectedId = selectedAccountId();
          const current = ((workspaces.data ?? []) as AccountMembership[]).find(account => account.id === selectedId) ?? null;
          setWorkspace(current);
        }
        const p = profile.data as ContactProfile | null;
        setUserId(user.id);
        setLoginEmail(user.email ?? "");
        setDisplayName(p?.display_name || original.data?.professional_name || "");
        setContactEmail(p?.contact_email ?? "");
        setMobile(p?.mobile ?? "");
        setJobTitle(p?.job_title ?? "");
        setCity(p?.city ?? "");
        setBio(p?.bio ?? "");
        setAvatarPath(p?.avatar_path ?? null);
        if (p?.avatar_path) {
          const signed = await supabase.storage.from(BUCKET).createSignedUrl(p.avatar_path, 3600);
          if (active && signed.data?.signedUrl) setPhotoUrl(signed.data.signedUrl);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Profile could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG or WebP image smaller than 5 MB.");
      return;
    }
    setNewPhoto(file);
    setRemovePhoto(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !userId) return;
    const email = contactEmail.trim();
    const phone = mobile.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid contact email address."); return; }
    if (phone && !/^[+0-9() .-]{6,25}$/.test(phone)) { setError("Enter a valid contact phone number."); return; }
    setBusy(true); setError(""); setMessage("");
    let uploadedPath: string | null = null;
    try {
      let nextPath = removePhoto ? null : avatarPath;
      if (newPhoto) {
        const compressed = await compressedWebp(newPhoto);
        uploadedPath = userId + "/" + crypto.randomUUID() + ".webp";
        const upload = await supabase.storage.from(BUCKET).upload(uploadedPath, compressed, {
          contentType: "image/webp", upsert: false, cacheControl: "3600",
        });
        if (upload.error) throw new Error("Photo upload failed: " + upload.error.message);
        nextPath = uploadedPath;
      }

      const { error: saveError } = await supabase.from("cv_user_contact_profiles").upsert({
        user_id: userId, display_name: displayName.trim(),
        contact_email: email || null, mobile: phone || null,
        job_title: jobTitle.trim() || null, city: city.trim() || null,
        bio: bio.trim() || null, avatar_path: nextPath,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (saveError) throw new Error("Could not save your profile: " + saveError.message);
      if (avatarPath && avatarPath !== nextPath) {
        // Old private photos are deleted only after the new profile is committed.
        void supabase.storage.from(BUCKET).remove([avatarPath]);
      }
      setAvatarPath(nextPath);
      setNewPhoto(null);
      setRemovePhoto(false);
      if (nextPath) {
        const signed = await supabase.storage.from(BUCKET).createSignedUrl(nextPath, 3600);
        setPhotoUrl(signed.data?.signedUrl ?? "");
      } else setPhotoUrl("");
      setMessage("Profile saved. Your contact details are private and available to authorized platform administrators.");
    } catch (reason) {
      if (uploadedPath) void supabase.storage.from(BUCKET).remove([uploadedPath]);
      setError(reason instanceof Error ? reason.message : "Could not save profile.");
    } finally { setBusy(false); }
  }

  const initials = (displayName.trim() || loginEmail.split("@")[0] || "U").slice(0, 2).toUpperCase();
  return <main className="cv-page min-h-screen">
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#112b42] to-[#08796e] p-7 text-white sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#83eddd]">MY ACCOUNT</p>
        <h1 className="mt-2 text-3xl font-extrabold">My Profile</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#d1eeeb]">Personalize your CertVerify profile. Add your professional contact details and an optional photo.</p>
      </header>
      {loading && <div className="cv-panel rounded-2xl p-8 text-slate-600" role="status">Loading profile…</div>}
      {!loading && <form onSubmit={event => void save(event)} className="cv-panel rounded-3xl p-6 sm:p-9">
        <div className="flex flex-wrap items-center gap-5 border-b border-[#e6edf1] pb-7">
          <div aria-label="Profile photo" role="img"
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d2f5e9] bg-cover bg-center text-2xl font-extrabold text-[#0a756f] ring-4 ring-[#ebf7f3]"
            style={photoUrl && !removePhoto ? { backgroundImage: 'url("' + photoUrl + '")' } : undefined}>
            {photoUrl && !removePhoto ? "" : initials}
          </div>
          <div className="min-w-[220px] flex-1 space-y-2">
            <p className="text-base font-bold text-[#1b3d4d]">Profile photo <span className="text-sm font-normal text-slate-500">(optional)</span></p>
            <label className="inline-flex cursor-pointer rounded-xl border border-[#b8d4d7] bg-white px-4 py-2.5 text-sm font-semibold text-[#176e66] hover:bg-[#effbf7]">
              Choose photo
              <input aria-label="Upload profile photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={onPhotoChange}/>
            </label>
            {(avatarPath || newPhoto) && <button type="button" disabled={busy} onClick={() => { setRemovePhoto(true); setNewPhoto(null); }}
              className="ml-3 text-sm font-semibold text-red-700 underline">Remove photo</button>}
            {newPhoto && <p className="text-xs text-[#55727b]">Ready to upload: {newPhoto.name}</p>}
            <p className="text-xs text-slate-500">JPG, PNG or WebP up to 5 MB. Photos are resized and stored privately.</p>
          </div>
        </div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <Field title="Display name" value={displayName} onChange={setDisplayName} placeholder="Name shown on your profile"/>
          <Field title="Profession / designation" value={jobTitle} onChange={setJobTitle} placeholder="Registered Valuer, Engineer, CA…"/>
          <label className="block text-sm font-bold text-[#31526a]">Login email (read-only)
            <input type="email" className="cv-field mt-2 bg-[#f0f5f7]" value={loginEmail} readOnly aria-label="Login email"/>
            <span className="mt-1 block text-xs font-normal text-slate-500">Changing contact email below does not change your login email.</span>
          </label>
          <Field title="Contact email" type="email" maxLength={254} value={contactEmail} onChange={setContactEmail} placeholder="you@organization.com"/>
          <Field title="Mobile number" type="tel" maxLength={25} value={mobile} onChange={setMobile} placeholder="+91 98765 43210"/>
          <Field title="City / location" value={city} onChange={setCity} placeholder="Hyderabad"/>
        </div>
        <label className="mt-5 block text-sm font-bold text-[#31526a]">About you (optional)
          <textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={350} rows={3}
            className="cv-field mt-2" placeholder="Short professional introduction"/>
        </label>
        <p className="mt-4 rounded-xl bg-[#edf7f5] p-4 text-xs leading-6 text-[#3e6966]">
          Profile contact information and photos are private. Only you and verified CertVerify platform administrators can access them. Your public certificates do not automatically display these fields.
        </p>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button className="cv-primary" disabled={loading || busy} type="submit">{busy ? "Saving profile…" : "Save Profile"}</button>
          <Link href="/dashboard" className="rounded-xl border border-[#c7dade] px-5 py-3 text-sm font-bold text-[#426170]">Back to dashboard</Link>
        </div>
      </form>}
      {!loading && workspace && <details className="cv-panel rounded-2xl border border-[#d8e7e7] p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-bold text-[#21465b]">Workspace details</summary>
        <p className="mt-2 text-xs text-slate-500">Read-only information about the workspace currently selected in the navigation ribbon.</p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Account name</dt><dd className="mt-1 font-semibold text-[#1b3b4c]">{workspace.account_name}</dd></div>
          <div><dt className="text-slate-500">Account code</dt><dd className="mt-1 font-semibold text-[#1b3b4c]">{workspace.account_code || "Not assigned"}</dd></div>
          <div><dt className="text-slate-500">Account type</dt><dd className="mt-1 font-semibold text-[#1b3b4c]">{workspace.account_type === "organization" ? "Multi-user organization" : "Individual"}</dd></div>
          <div><dt className="text-slate-500">Your role</dt><dd className="mt-1 font-semibold text-[#1b3b4c]">{workspace.role === "owner" ? "Owner" : workspace.role === "admin" ? "Administrator" : workspace.role === "member" ? "Member" : "Viewer"}</dd></div>
        </dl>
      </details>}
    </div>
  </main>;
}
