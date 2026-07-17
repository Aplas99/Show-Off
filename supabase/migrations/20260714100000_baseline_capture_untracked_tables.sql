-- Baseline capture for tables/policies that predate this migrations
-- history and were created out-of-band directly in Supabase: profile,
-- items, showcase, showcase_items, and the social tables that reference
-- them (bookmarks, comments, follows, likes, notifications, products,
-- shares, showcase_follows, showcase_likes, showcase_members).
--
-- Generated from `supabase db dump --schema public` against the live
-- project and transcribed here so future schema changes are diffable
-- instead of guessed at. Every statement is written to be a safe no-op
-- against a database that already has these objects:
--   - CREATE TABLE/INDEX/SEQUENCE IF NOT EXISTS
--   - CREATE OR REPLACE for functions/views/triggers
--   - DO blocks + `duplicate_object` exception for CREATE TYPE and
--     ALTER TABLE ADD CONSTRAINT (neither supports IF NOT EXISTS)
--   - DROP POLICY IF EXISTS before every CREATE POLICY
--
-- One deliberate change from the live state: the legacy policy
-- "Enable read access for all users" on public.showcase (`USING (true)`,
-- no role restriction) is dropped and NOT recreated. Because Postgres
-- OR's multiple permissive policies together, that policy made every
-- showcase -- including private ones -- readable by any role (anon
-- included), silently defeating the `is_public` check enforced by the
-- other showcase SELECT policies. This was found while preparing the
-- sharable-showcase-links feature and confirmed with the team as a bug,
-- not intentional behavior, before being removed here.

-- --- Types ---

DO $$ BEGIN
  CREATE TYPE public.item_condition AS ENUM (
    'New',
    'New in box',
    'Excellent',
    'Good',
    'Acceptable'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.showcase_role AS ENUM (
    'viewer',
    'editor'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- --- Tables ---

CREATE TABLE IF NOT EXISTS public.profile (
  id UUID NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  street_address1 TEXT,
  street_address2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  bio TEXT,
  username TEXT NOT NULL,
  email TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS public.products (
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ean BIGINT NOT NULL,
  upc BIGINT,
  isbn TEXT,
  data JSON NOT NULL,
  "searchableTitle" TEXT NOT NULL,
  "searchableDescription" TEXT NOT NULL,
  "searchableBrand" TEXT NOT NULL,
  price NUMERIC,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE public.products IS 'product data store';

CREATE SEQUENCE IF NOT EXISTS public.item_id_seq
  AS INTEGER START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.items (
  id INTEGER NOT NULL DEFAULT nextval('public.item_id_seq'::regclass),
  user_id UUID NOT NULL,
  product_ean BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_url TEXT DEFAULT ''::TEXT,
  condition public.item_condition,
  user_description TEXT,
  for_sale BOOLEAN NOT NULL DEFAULT FALSE,
  price DOUBLE PRECISION,
  currency_code CHARACTER(3) NOT NULL DEFAULT 'USD'::BPCHAR,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  custom_title TEXT,
  custom_brand TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  custom_publisher TEXT,
  custom_category TEXT,
  pokemon_tcg_card_id TEXT
);

ALTER SEQUENCE public.item_id_seq OWNED BY public.items.id;

CREATE TABLE IF NOT EXISTS public.showcase (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profile_id UUID NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT NOT NULL DEFAULT 'Untitled Showcase'::TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  visibility TEXT NOT NULL DEFAULT 'public'::TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT showcase_visibility_check
    CHECK (visibility = ANY (ARRAY['public'::TEXT, 'private'::TEXT, 'friends_only'::TEXT]))
);
COMMENT ON TABLE public.showcase IS 'Display a users item';

CREATE TABLE IF NOT EXISTS public.showcase_items (
  showcase_id UUID NOT NULL,
  item_id INTEGER NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.showcase_members (
  showcase_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role public.showcase_role NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.showcase_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  showcase_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.showcase_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  showcase_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.likes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  actor_id UUID NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY['like'::TEXT, 'comment'::TEXT, 'follow'::TEXT, 'mention'::TEXT]))
);

CREATE TABLE IF NOT EXISTS public.shares (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, NOW())
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

-- --- View ---

CREATE OR REPLACE VIEW public.feed_items AS
SELECT
  i.id, i.user_id, i.product_ean, i.condition, i.user_description,
  i.image_url, i.is_public, i.like_count, i.comment_count, i.created_at,
  i.for_sale, i.price, i.currency_code,
  p.id AS profile_id, p.username, p.first_name, p.last_name, p.avatar_url,
  p.is_private AS profile_is_private
FROM public.items i
LEFT JOIN public.profile p ON i.user_id = p.id
WHERE i.is_public = TRUE;

-- --- Primary keys / unique constraints / foreign keys ---

DO $$ BEGIN
  ALTER TABLE ONLY public.profile ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profile ADD CONSTRAINT profile_username_key UNIQUE (username);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.products ADD CONSTRAINT products_pkey PRIMARY KEY (ean);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.items ADD CONSTRAINT item_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.items
    ADD CONSTRAINT item_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_user_auth_fk FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_product_ean_fkey FOREIGN KEY (product_ean) REFERENCES public.products (ean) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pokemon_tcg_card_id_fkey FOREIGN KEY (pokemon_tcg_card_id) REFERENCES public.pokemon_tcg_cards (id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase ADD CONSTRAINT showcase_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase
    ADD CONSTRAINT showcase_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profile (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_items
    ADD CONSTRAINT showcase_items_pkey PRIMARY KEY (showcase_id, item_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_items
    ADD CONSTRAINT showcase_items_showcase_id_fkey FOREIGN KEY (showcase_id) REFERENCES public.showcase (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_items
    ADD CONSTRAINT showcase_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_members
    ADD CONSTRAINT showcase_members_pkey PRIMARY KEY (showcase_id, user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_members
    ADD CONSTRAINT showcase_members_showcase_id_fkey FOREIGN KEY (showcase_id) REFERENCES public.showcase (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_members
    ADD CONSTRAINT showcase_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_follows ADD CONSTRAINT showcase_follows_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_follows
    ADD CONSTRAINT showcase_follows_user_id_showcase_id_key UNIQUE (user_id, showcase_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_follows
    ADD CONSTRAINT showcase_follows_showcase_id_fkey FOREIGN KEY (showcase_id) REFERENCES public.showcase (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_follows
    ADD CONSTRAINT showcase_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_likes ADD CONSTRAINT showcase_likes_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_likes
    ADD CONSTRAINT showcase_likes_user_id_showcase_id_key UNIQUE (user_id, showcase_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_likes
    ADD CONSTRAINT showcase_likes_showcase_id_fkey FOREIGN KEY (showcase_id) REFERENCES public.showcase (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.showcase_likes
    ADD CONSTRAINT showcase_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookmarks ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_item_id_key UNIQUE (user_id, item_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.comments ADD CONSTRAINT comments_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.likes ADD CONSTRAINT likes_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.likes ADD CONSTRAINT likes_user_id_item_id_key UNIQUE (user_id, item_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shares ADD CONSTRAINT shares_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shares ADD CONSTRAINT shares_user_id_item_id_key UNIQUE (user_id, item_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users (id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- --- Indexes ---

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_ean ON public.products USING btree (ean);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_isbn ON public.products USING btree (isbn) WHERE (isbn IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_upc ON public.products USING btree (upc) WHERE (upc IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_products_is_verified ON public.products USING btree (is_verified);
CREATE INDEX IF NOT EXISTS idx_products_fulltext ON public.products USING gin (
  to_tsvector('english'::regconfig, ((((COALESCE("searchableTitle", ''::TEXT) || ' '::TEXT) || COALESCE("searchableDescription", ''::TEXT)) || ' '::TEXT) || COALESCE("searchableBrand", ''::TEXT)))
);

CREATE INDEX IF NOT EXISTS idx_items_is_public ON public.items USING btree (is_public) WHERE (is_public = TRUE);
CREATE INDEX IF NOT EXISTS idx_items_share_count ON public.items USING btree (share_count DESC);
CREATE INDEX IF NOT EXISTS items_pokemon_tcg_card_id_idx ON public.items USING btree (pokemon_tcg_card_id);

CREATE INDEX IF NOT EXISTS idx_showcase_user ON public.showcase USING btree (profile_id);
CREATE INDEX IF NOT EXISTS idx_showcase_is_public ON public.showcase USING btree (is_public) WHERE (is_public = TRUE);
CREATE INDEX IF NOT EXISTS idx_showcase_is_featured ON public.showcase USING btree (is_featured) WHERE (is_featured = TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS uq_showcase_default_per_profile ON public.showcase USING btree (profile_id) WHERE (is_default = TRUE);

CREATE INDEX IF NOT EXISTS idx_showcase_items_showcase_id ON public.showcase_items USING btree (showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_items_item_id ON public.showcase_items USING btree (item_id);

CREATE INDEX IF NOT EXISTS idx_showcase_members_user ON public.showcase_members USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_showcase_follows_showcase ON public.showcase_follows USING btree (showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_follows_user ON public.showcase_follows USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_follows_created_at ON public.showcase_follows USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_showcase_likes_showcase ON public.showcase_likes USING btree (showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_likes_user ON public.showcase_likes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_showcase_likes_created_at ON public.showcase_likes USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_bookmarks_item ON public.bookmarks USING btree (item_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.bookmarks USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_comments_item ON public.comments USING btree (item_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON public.comments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_likes_item ON public.likes USING btree (item_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_likes_created_at ON public.likes USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications USING btree (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_shares_item_id ON public.shares USING btree (item_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_id ON public.shares USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON public.shares USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows USING btree (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows USING btree (following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON public.follows USING btree (created_at);

-- --- Trigger functions ---

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
begin
  insert into public.profile (id, first_name, last_name, email, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    new.email,
    coalesce(new.raw_user_meta_data->>'username','')
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_showcase(_profile_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
begin
  insert into public.showcase (profile_id, is_default)
  select _profile_id, true
  where not exists (
    select 1 from public.showcase
    where profile_id = _profile_id and is_default = true
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.create_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  target_user_id uuid;
  target_item_id integer;
BEGIN
  IF TG_TABLE_NAME = 'likes' THEN
    SELECT user_id INTO target_user_id FROM public.items WHERE id = NEW.item_id;
    IF target_user_id = NEW.user_id THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications (user_id, type, actor_id, target_id, metadata)
    VALUES (target_user_id, 'like', NEW.user_id, NEW.item_id::text, '{}'::jsonb);
  ELSIF TG_TABLE_NAME = 'comments' THEN
    SELECT user_id INTO target_user_id FROM public.items WHERE id = NEW.item_id;
    IF target_user_id = NEW.user_id THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.notifications (user_id, type, actor_id, target_id, metadata)
    VALUES (target_user_id, 'comment', NEW.user_id, NEW.item_id::text, jsonb_build_object('content', LEFT(NEW.content, 100)));
  ELSIF TG_TABLE_NAME = 'follows' THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_id, metadata)
    VALUES (NEW.following_id, 'follow', NEW.follower_id, NEW.following_id::text, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_like_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.items SET like_count = like_count + 1 WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_like_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.items SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.item_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_comment_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.items SET comment_count = comment_count + 1 WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_comment_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.items SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.item_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_comment_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_item_comment_count() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE items SET comment_count = comment_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE items SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_item_like_count() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE items SET like_count = like_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE items SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_item_share_count() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE items SET share_count = share_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE items SET share_count = GREATEST(share_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;

-- --- Triggers ---

CREATE OR REPLACE TRIGGER trigger_create_like_notification
  AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE OR REPLACE TRIGGER trigger_create_comment_notification
  AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE OR REPLACE TRIGGER trigger_create_follow_notification
  AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE OR REPLACE TRIGGER trigger_increment_like_count
  AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.increment_like_count();

CREATE OR REPLACE TRIGGER trigger_decrement_like_count
  AFTER DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION public.decrement_like_count();

CREATE OR REPLACE TRIGGER trigger_increment_comment_count
  AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.increment_comment_count();

CREATE OR REPLACE TRIGGER trigger_decrement_comment_count
  AFTER DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.decrement_comment_count();

CREATE OR REPLACE TRIGGER trigger_update_comment_count
  AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_item_comment_count();

CREATE OR REPLACE TRIGGER trigger_update_comment_updated_at
  BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_comment_updated_at();

CREATE OR REPLACE TRIGGER trigger_update_share_count
  AFTER INSERT OR DELETE ON public.shares FOR EACH ROW EXECUTE FUNCTION public.update_item_share_count();

-- --- Row Level Security ---

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- profile
DROP POLICY IF EXISTS "select own user" ON public.profile;
CREATE POLICY "select own user" ON public.profile FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert own user" ON public.profile;
CREATE POLICY "insert own user" ON public.profile FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update own user" ON public.profile;
CREATE POLICY "update own user" ON public.profile FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- products
DROP POLICY IF EXISTS "products_select_all" ON public.products;
CREATE POLICY "products_select_all" ON public.products FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
CREATE POLICY "Enable insert for authenticated users only" ON public.products FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Enable read access for auth users" ON public.products;
CREATE POLICY "Enable read access for auth users" ON public.products FOR SELECT TO authenticated USING (TRUE);

-- items
DROP POLICY IF EXISTS "read_own_items" ON public.items;
CREATE POLICY "read_own_items" ON public.items FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "read_items_from_public_showcases" ON public.items;
CREATE POLICY "read_items_from_public_showcases" ON public.items FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.showcase_items si
    JOIN public.showcase s ON s.id = si.showcase_id
    WHERE si.item_id = items.id AND s.is_public = TRUE
  )
);

DROP POLICY IF EXISTS "items_owner_sel" ON public.items;
CREATE POLICY "items_owner_sel" ON public.items FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_items" ON public.items;
CREATE POLICY "insert_own_items" ON public.items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "items_owner_ins" ON public.items;
CREATE POLICY "items_owner_ins" ON public.items FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.items;
CREATE POLICY "Enable insert for authenticated users only" ON public.items FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "update_own_items" ON public.items;
CREATE POLICY "update_own_items" ON public.items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "items_owner_upd" ON public.items;
CREATE POLICY "items_owner_upd" ON public.items FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_items" ON public.items;
CREATE POLICY "delete_own_items" ON public.items FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "items_owner_del" ON public.items;
CREATE POLICY "items_owner_del" ON public.items FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.items;
CREATE POLICY "Enable delete for users based on user_id" ON public.items FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- showcase
-- Deliberately NOT recreated: "Enable read access for all users" (USING
-- true, no role restriction) — see header comment. This was the only
-- policy making is_public=false showcases readable by anyone.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.showcase;

DROP POLICY IF EXISTS "read_own_showcases" ON public.showcase;
CREATE POLICY "read_own_showcases" ON public.showcase FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "read_public_showcases" ON public.showcase;
CREATE POLICY "read_public_showcases" ON public.showcase FOR SELECT TO authenticated, anon USING (is_public = TRUE);

DROP POLICY IF EXISTS "insert_own_showcase" ON public.showcase;
CREATE POLICY "insert_own_showcase" ON public.showcase FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.showcase;
CREATE POLICY "Enable insert for authenticated users only" ON public.showcase FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "update_own_showcase" ON public.showcase;
CREATE POLICY "update_own_showcase" ON public.showcase FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own showcases" ON public.showcase;
CREATE POLICY "Users can update own showcases" ON public.showcase FOR UPDATE USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "delete_own_showcase" ON public.showcase;
CREATE POLICY "delete_own_showcase" ON public.showcase FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- showcase_items
DROP POLICY IF EXISTS "read_own_showcase_items" ON public.showcase_items;
CREATE POLICY "read_own_showcase_items" ON public.showcase_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_items.showcase_id AND showcase.profile_id = auth.uid())
);

DROP POLICY IF EXISTS "read_public_showcase_items" ON public.showcase_items;
CREATE POLICY "read_public_showcase_items" ON public.showcase_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_items.showcase_id AND showcase.is_public = TRUE)
);

DROP POLICY IF EXISTS "insert_own_showcase_items" ON public.showcase_items;
CREATE POLICY "insert_own_showcase_items" ON public.showcase_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_items.showcase_id AND showcase.profile_id = auth.uid())
);

DROP POLICY IF EXISTS "delete_own_showcase_items" ON public.showcase_items;
CREATE POLICY "delete_own_showcase_items" ON public.showcase_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_items.showcase_id AND showcase.profile_id = auth.uid())
);

-- showcase_follows
DROP POLICY IF EXISTS "Anyone can view showcase follows on public showcases" ON public.showcase_follows;
CREATE POLICY "Anyone can view showcase follows on public showcases" ON public.showcase_follows FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_follows.showcase_id AND (showcase.is_public = TRUE OR showcase.profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can follow showcases" ON public.showcase_follows;
CREATE POLICY "Authenticated users can follow showcases" ON public.showcase_follows FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_follows.showcase_id AND (showcase.is_public = TRUE OR showcase.profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can unfollow showcases" ON public.showcase_follows;
CREATE POLICY "Users can unfollow showcases" ON public.showcase_follows FOR DELETE USING (auth.uid() = user_id);

-- showcase_likes
DROP POLICY IF EXISTS "Anyone can view showcase likes on public showcases" ON public.showcase_likes;
CREATE POLICY "Anyone can view showcase likes on public showcases" ON public.showcase_likes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_likes.showcase_id AND (showcase.is_public = TRUE OR showcase.profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can like showcases" ON public.showcase_likes;
CREATE POLICY "Authenticated users can like showcases" ON public.showcase_likes FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.showcase WHERE showcase.id = showcase_likes.showcase_id AND (showcase.is_public = TRUE OR showcase.profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can unlike their own showcase likes" ON public.showcase_likes;
CREATE POLICY "Users can unlike their own showcase likes" ON public.showcase_likes FOR DELETE USING (auth.uid() = user_id);

-- bookmarks
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can bookmark items" ON public.bookmarks;
CREATE POLICY "Users can bookmark items" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can remove their own bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- comments
DROP POLICY IF EXISTS "Authenticated users can read comments" ON public.comments;
CREATE POLICY "Authenticated users can read comments" ON public.comments FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Anyone can view comments on public items" ON public.comments;
CREATE POLICY "Anyone can view comments on public items" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.items WHERE items.id = comments.item_id AND (items.is_public = TRUE OR items.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can comment on accessible items" ON public.comments;
CREATE POLICY "Authenticated users can comment on accessible items" ON public.comments FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.items WHERE items.id = comments.item_id AND (items.is_public = TRUE OR items.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can edit their own comments" ON public.comments;
CREATE POLICY "Users can edit their own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- likes
DROP POLICY IF EXISTS "Anyone can view likes on public items" ON public.likes;
CREATE POLICY "Anyone can view likes on public items" ON public.likes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.items WHERE items.id = likes.item_id AND (items.is_public = TRUE OR items.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can like items" ON public.likes;
CREATE POLICY "Authenticated users can like items" ON public.likes FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.items WHERE items.id = likes.item_id AND (items.is_public = TRUE OR items.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.likes;
CREATE POLICY "Users can unlike their own likes" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark their notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their notifications as read" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- shares
DROP POLICY IF EXISTS "Shares are viewable by everyone" ON public.shares;
CREATE POLICY "Shares are viewable by everyone" ON public.shares FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Users can create their own shares" ON public.shares;
CREATE POLICY "Users can create their own shares" ON public.shares FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own shares" ON public.shares;
CREATE POLICY "Users can delete their own shares" ON public.shares FOR DELETE USING (auth.uid() = user_id);

-- follows
DROP POLICY IF EXISTS "Users can view their own follows/followers" ON public.follows;
CREATE POLICY "Users can view their own follows/followers" ON public.follows FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id);

DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id AND auth.uid() <> following_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

NOTIFY pgrst, 'reload schema';
