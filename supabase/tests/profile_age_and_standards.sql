-- Isolated fixture with minimal content tables (id/user_id) and broad policies.
BEGIN;
INSERT INTO auth.users(id, raw_app_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', '{"provider":"google"}'),
  ('22222222-2222-2222-2222-222222222222', '{"provider":"google"}');
DO $$ BEGIN
  BEGIN
    INSERT INTO auth.users(id, raw_app_meta_data, raw_user_meta_data)
    VALUES ('33333333-3333-3333-3333-333333333333', '{"provider":"email"}', '{"reported_age":12}');
    RAISE EXCEPTION 'underage email signup allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Ages 13 and older only' THEN RAISE; END IF;
  END;
END $$;
INSERT INTO auth.users(id, raw_app_meta_data, raw_user_meta_data)
  VALUES ('44444444-4444-4444-4444-444444444444', '{"provider":"email"}', '{"reported_age":13,"accepted_policy_version":"2026-09-15"}');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profile WHERE id='44444444-4444-4444-4444-444444444444'
    AND reported_age=13 AND age_recorded_at=current_date AND accepted_policy_version='2026-09-15') THEN
    RAISE EXCEPTION 'signup did not capture age and acceptance';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
DO $$ BEGIN
  IF public.can_use_app() THEN RAISE EXCEPTION 'unconfirmed account admitted'; END IF;
  IF (SELECT count(*) FROM public.profile) <> 1 THEN RAISE EXCEPTION 'other private profiles leaked'; END IF;
  BEGIN
    INSERT INTO public.items(id,user_id) VALUES (1,auth.uid());
    RAISE EXCEPTION 'content without standards allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.profile SET reported_age=18 WHERE id=auth.uid();
    RAISE EXCEPTION 'direct age update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.accept_account_standards(12,'2026-09-15');
    RAISE EXCEPTION 'underage onboarding allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Ages 13 and older only' THEN RAISE; END IF;
  END;
END $$;
SELECT public.accept_account_standards(17,'2026-09-15');
DO $$ BEGIN
  IF NOT public.can_use_app() OR public.viewer_age() <> 17 THEN RAISE EXCEPTION 'eligible account rejected'; END IF;
  BEGIN
    PERFORM public.accept_account_standards(18,'2026-09-15');
    RAISE EXCEPTION 'age upgraded through repeated onboarding';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Contact support to correct recorded age' THEN RAISE; END IF;
  END;
END $$;
INSERT INTO public.items(id,user_id) VALUES (1,auth.uid());
RESET ROLE;
UPDATE public.profile SET age_recorded_at = current_date - interval '1 year' + interval '1 day'
  WHERE id='11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  IF public.viewer_age() <> 17 THEN RAISE EXCEPTION 'age advanced early'; END IF;
END $$;
UPDATE public.profile SET age_recorded_at = current_date - interval '1 year'
  WHERE id='11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  IF public.viewer_age() <> 18 THEN RAISE EXCEPTION 'age failed to advance'; END IF;
END $$;
ROLLBACK;
