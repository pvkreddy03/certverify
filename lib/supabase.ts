import { createBrowserClient } from "@supabase/ssr";
import { accountHeaders } from "@/lib/accounts/context";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        // Session/account discovery does not require context. All PostgREST
        // queries include the selected account; RLS revalidates it server-side.
        const headers = accountHeaders(init?.headers);
        return fetch(input, { ...init, headers });
      },
    },
  }
);
