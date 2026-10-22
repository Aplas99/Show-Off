-- Open Library cover backfill for cached ISBN products without an image.
-- Generated 2026-10-21T23:35:59.413Z by scripts/backfill-openlibrary-covers.cjs.
-- Each update re-checks that the product is still imageless.
begin;
update public.products set data = jsonb_set(data::jsonb, '{images}', jsonb_build_array('https://covers.openlibrary.org/b/isbn/9781607064114-L.jpg?default=false'))::json
  where ean = 9781607064114 and coalesce(jsonb_array_length(data::jsonb->'images'), 0) = 0;
update public.products set data = jsonb_set(data::jsonb, '{images}', jsonb_build_array('https://covers.openlibrary.org/b/isbn/9781684058419-L.jpg?default=false'))::json
  where ean = 9781684058419 and coalesce(jsonb_array_length(data::jsonb->'images'), 0) = 0;
commit;
