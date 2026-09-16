BEGIN;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111');
DO $$
DECLARE
  uid UUID := '11111111-1111-4111-8111-111111111111';
  stamp BIGINT := extract(epoch FROM now())*1000;
  active JSONB;
  canceled JSONB;
BEGIN
  active := jsonb_build_object('observed_at_ms',stamp,'status','active',
    'price_id','curator_monthly','plan_id','curator_monthly',
    'current_period_end',now()+interval '1 month','cancel_at_period_end',false);
  canceled := jsonb_build_object('observed_at_ms',stamp+1,'status','canceled');
  IF NOT public.apply_revenuecat_snapshot(uid,active) THEN
    RAISE EXCEPTION 'Valid snapshot must apply';
  END IF;
  IF NOT public.has_curator_membership(uid) THEN
    RAISE EXCEPTION 'Valid snapshot must grant membership';
  END IF;
  IF public.apply_revenuecat_snapshot(uid,active) THEN RAISE EXCEPTION 'Duplicate must be ignored'; END IF;
  PERFORM public.apply_revenuecat_snapshot(uid,canceled);
  IF public.apply_revenuecat_snapshot(uid,active) OR public.has_active_membership(uid) THEN
    RAISE EXCEPTION 'Stale snapshot must not resurrect access';
  END IF;
  UPDATE public.subscriptions SET status='active',current_period_end=now()-interval '1 second' WHERE user_id=uid;
  IF public.has_active_membership(uid) OR public.has_curator_membership(uid) THEN
    RAISE EXCEPTION 'Expired rows must fail closed without an expiration webhook';
  END IF;
  INSERT INTO public.account_deletion_requests(user_id) VALUES(uid);
  IF public.apply_revenuecat_snapshot(uid,active || jsonb_build_object('observed_at_ms',stamp+2)) THEN
    RAISE EXCEPTION 'Deleting accounts must not be updated';
  END IF;
  IF has_function_privilege('authenticated','public.apply_revenuecat_snapshot(uuid,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','public.subscriptions','INSERT') THEN
    RAISE EXCEPTION 'Clients must not grant memberships';
  END IF;
END $$;
ROLLBACK;
