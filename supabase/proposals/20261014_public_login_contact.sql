-- CertVerify Phase 8 (proposal only): public login information and platform-managed contact details.
-- Do not apply to hosted staging without approval. Preserve existing pricing and Auth functions.
BEGIN;
CREATE TABLE public.cv_public_contact_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  support_email text NOT NULL DEFAULT '',
  support_phone text NOT NULL DEFAULT '',
  website_url text NOT NULL DEFAULT '',
  help_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.cv_public_contact_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_public_contact_settings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cv_public_login_information()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'plans', COALESCE(public.cv_pricing_catalog(), '[]'::jsonb),
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', left(v.terms->>'name',120),
        'code', o.code,
        'kind', v.terms->>'kind',
        'value', (v.terms->>'value')::numeric,
        'trial_days', (v.terms->>'trial_days')::integer,
        'cycles', (v.terms->>'cycles')::integer,
        'currency', v.terms->>'currency',
        'currency_exponent', (v.terms->>'currency_exponent')::integer,
        'ends_at', v.terms->>'ends_at'
      ) ORDER BY o.created_at), '[]'::jsonb)
      FROM public.cv_offers o
      JOIN public.cv_offer_versions v ON v.id = o.current_version_id
      WHERE o.status = 'active'
        AND v.terms->>'audience' IN ('new', 'all')
        AND (v.terms->>'starts_at' IS NULL OR (v.terms->>'starts_at')::timestamptz <= public.cv_billing_now())
        AND (v.terms->>'ends_at' IS NULL OR (v.terms->>'ends_at')::timestamptz > public.cv_billing_now())
        AND (v.terms->>'max_redemptions' IS NULL OR o.redemption_count < (v.terms->>'max_redemptions')::integer)
        AND EXISTS (
          SELECT 1 FROM public.cv_plans p
          JOIN public.cv_plan_versions pv ON pv.id=p.current_version_id
          WHERE p.status='active' AND (pv.terms->>'visible')::boolean
          AND (pv.terms->>'starts_at' IS NULL OR (pv.terms->>'starts_at')::timestamptz <= public.cv_billing_now())
          AND (pv.terms->>'ends_at' IS NULL OR (pv.terms->>'ends_at')::timestamptz > public.cv_billing_now())
          AND (
            jsonb_array_length(COALESCE(v.terms->'plan_ids', '[]'::jsonb)) = 0 OR
            (v.terms->'plan_ids') ? p.id::text
          )
        )
    ), '[]'::jsonb),
    'contact', COALESCE((
      SELECT jsonb_build_object(
        'support_email', c.support_email,
        'support_phone', c.support_phone,
        'website_url', c.website_url,
        'help_text', c.help_text
      ) FROM public.cv_public_contact_settings c WHERE c.singleton = true
    ), '{}'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.cv_platform_contact_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE actor uuid := public.cv_require_platform_admin();
BEGIN
  RETURN COALESCE(
    (SELECT jsonb_build_object('support_email',support_email,'support_phone',support_phone,
      'website_url',website_url,'help_text',help_text,'updated_at',updated_at)
      FROM public.cv_public_contact_settings WHERE singleton=true),
    jsonb_build_object('support_email','','support_phone','','website_url','','help_text','')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cv_save_platform_contact_settings(p_contact jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE actor uuid := public.cv_require_platform_admin();
  e text;
  p text;
  w text;
  h text;
BEGIN
  IF p_contact IS NULL OR jsonb_typeof(p_contact) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_contact) AS k(key)
                WHERE k.key NOT IN ('support_email','support_phone','website_url','help_text'))
  THEN RAISE EXCEPTION 'Invalid contact details'; END IF;
  e := btrim(COALESCE(p_contact->>'support_email',''));
  p := btrim(COALESCE(p_contact->>'support_phone',''));
  w := btrim(COALESCE(p_contact->>'website_url',''));
  h := btrim(COALESCE(p_contact->>'help_text',''));
  IF length(e)>254 OR (e<>'' AND e !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    OR length(p)>26 OR (p<>'' AND p !~ '^\+?[0-9 ()-]{7,26}$')
    OR length(w)>500 OR (w<>'' AND w !~* '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$')
    OR length(h)>500
  THEN RAISE EXCEPTION 'Invalid contact details'; END IF;
  INSERT INTO public.cv_public_contact_settings(singleton,support_email,support_phone,website_url,help_text,updated_at,updated_by)
    VALUES(true,e,p,w,h,now(),actor)
  ON CONFLICT(singleton) DO UPDATE
    SET support_email=excluded.support_email,support_phone=excluded.support_phone,
        website_url=excluded.website_url,help_text=excluded.help_text,
        updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  INSERT INTO public.cv_platform_audit_events(actor_id,action,details)
    VALUES(actor,'platform.contact_updated',jsonb_build_object('fields',jsonb_build_array('support_email','support_phone','website_url','help_text')));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.cv_public_login_information() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_public_login_information() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cv_platform_contact_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_platform_contact_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.cv_save_platform_contact_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_save_platform_contact_settings(jsonb) TO authenticated;
COMMIT;
