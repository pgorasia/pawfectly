-- Migration: Seed entitlement_plans with required base plans
-- Fixes FK failures when creating user_entitlements rows with plan_code='free'.

DO $$
DECLARE
  v_cols text[];
  v_col text;
  v_col_list text;
  v_val_list text;
  v_plan text;
BEGIN
  IF to_regclass('public.entitlement_plans') IS NULL THEN
    RAISE NOTICE 'entitlement_plans not found; skipping seed.';
    RETURN;
  END IF;

  -- Use only columns that are likely to exist; ignore unknown schema details.
  SELECT array_agg(column_name ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'entitlement_plans'
    AND column_name IN (
      'plan_code',
      'name',
      'display_name',
      'description',
      'is_active','active','enabled',
      'sort_order',
      'price_cents','monthly_price_cents',
      'currency',
      'likes_per_day',
      'compliments_per_day',
      'created_at','updated_at',
      'metadata'
    );

  -- Always include plan_code
  IF v_cols IS NULL OR array_position(v_cols, 'plan_code') IS NULL THEN
    v_cols := ARRAY['plan_code'];
  END IF;

  v_col_list := array_to_string(
    ARRAY(SELECT quote_ident(x) FROM unnest(v_cols) AS x),
    ', '
  );

  FOREACH v_plan IN ARRAY ARRAY['free','plus'] LOOP
    IF EXISTS (SELECT 1 FROM public.entitlement_plans WHERE plan_code = v_plan) THEN
      CONTINUE;
    END IF;

    v_val_list := '';
    FOREACH v_col IN ARRAY v_cols LOOP
      IF v_val_list <> '' THEN
        v_val_list := v_val_list || ', ';
      END IF;

      IF v_col = 'plan_code' THEN
        v_val_list := v_val_list || quote_literal(v_plan);

      ELSIF v_col IN ('name','display_name') THEN
        v_val_list := v_val_list || quote_literal(CASE WHEN v_plan = 'free' THEN 'Free' ELSE 'Plus' END);

      ELSIF v_col = 'description' THEN
        v_val_list := v_val_list || quote_literal(CASE WHEN v_plan = 'free' THEN 'Default free plan' ELSE 'Default plus plan' END);

      ELSIF v_col IN ('is_active','active','enabled') THEN
        v_val_list := v_val_list || 'true';

      ELSIF v_col = 'sort_order' THEN
        v_val_list := v_val_list || CASE WHEN v_plan = 'free' THEN '0' ELSE '10' END;

      ELSIF v_col IN ('price_cents','monthly_price_cents') THEN
        v_val_list := v_val_list || CASE WHEN v_plan = 'free' THEN '0' ELSE '999' END;

      ELSIF v_col = 'currency' THEN
        v_val_list := v_val_list || quote_literal('USD');

      ELSIF v_col = 'likes_per_day' THEN
        -- Adjust to your business rules as needed
        v_val_list := v_val_list || CASE WHEN v_plan = 'free' THEN '25' ELSE 'NULL' END;

      ELSIF v_col = 'compliments_per_day' THEN
        v_val_list := v_val_list || CASE WHEN v_plan = 'free' THEN '5' ELSE 'NULL' END;

      ELSIF v_col IN ('created_at','updated_at') THEN
        v_val_list := v_val_list || 'now()';

      ELSIF v_col = 'metadata' THEN
        v_val_list := v_val_list || '''{}''::jsonb';

      ELSE
        v_val_list := v_val_list || 'NULL';
      END IF;
    END LOOP;

    EXECUTE format('INSERT INTO public.entitlement_plans(%s) VALUES (%s);', v_col_list, v_val_list);
  END LOOP;

  -- Ensure user_entitlements defaults to free when plan_code exists
  IF to_regclass('public.user_entitlements') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_entitlements' AND column_name='plan_code'
     )
  THEN
    EXECUTE 'ALTER TABLE public.user_entitlements ALTER COLUMN plan_code SET DEFAULT ''free'';';

    -- Backfill NULLs (if allowed by schema)
    EXECUTE 'UPDATE public.user_entitlements SET plan_code = ''free'' WHERE plan_code IS NULL;';
  END IF;
END $$;
