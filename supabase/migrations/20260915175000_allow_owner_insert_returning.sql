-- SELECT guards also run against INSERT ... RETURNING. Stable helpers cannot
-- find a newly inserted row through a second table query in the same statement.
-- Check the owner directly from the policy row, preserving suspension/restrictions.
ALTER POLICY item_audience_read_guard ON public.items USING (
  (user_id=auth.uid() AND public.can_interact_with(user_id) AND NOT public.content_is_restricted('item',id::text))
  OR public.can_view_item(id)
);
ALTER POLICY showcase_audience_read_guard ON public.showcase USING (
  (profile_id=auth.uid() AND public.can_interact_with(profile_id) AND NOT public.content_is_restricted('showcase',id::text))
  OR public.can_view_showcase(id)
);
ALTER POLICY post_audience_read_guard ON public.posts USING (
  (user_id=auth.uid() AND public.can_interact_with(user_id) AND NOT public.content_is_restricted('post',id::text))
  OR public.can_view_post(id)
);
