"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function ProfileAvatarLink() {
  const pathname = usePathname();
  const [initials, setInitials] = useState("U");
  const [photoUrl, setPhotoUrl] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !live) return;
      const { data } = await supabase.from("cv_user_contact_profiles")
        .select("display_name,avatar_path").eq("user_id", user.id).maybeSingle();
      if (!live) return;
      const value = data?.display_name?.trim() || user.email?.split("@")[0] || "U";
      setInitials(value.slice(0, 2).toUpperCase());
      if (data?.avatar_path) {
        const signed = await supabase.storage.from("certverify-user-avatars")
          .createSignedUrl(data.avatar_path, 3600);
        if (live) setPhotoUrl(signed.data?.signedUrl ?? "");
      } else setPhotoUrl("");
    }
    void load();
    return () => { live = false; };
  }, [pathname]);

  return <Link href="/dashboard/profile" aria-label="My Profile"
    title="My Profile"
    className={"ml-auto flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#5dcab6] bg-[#d7f7ed] bg-cover bg-center text-xs font-extrabold text-[#0b6b65] shadow-sm transition hover:ring-4 hover:ring-[#58b8a1]/30 " +
      (pathname === "/dashboard/profile" ? "ring-4 ring-[#58b8a1]/30" : "")}
    style={photoUrl ? { backgroundImage: 'url("' + photoUrl + '")' } : undefined}>
    {photoUrl ? <span className="sr-only">Open My Profile</span> : initials}
  </Link>;
}
