-- User-authored posts for the Discover feed. Items are no longer surfaced
-- in the feed automatically — users compose posts (media + caption) and can
-- optionally reference an item from their showcase. Social interactions for
-- posts live in dedicated post_* tables rather than reusing the legacy
-- item-keyed likes/bookmarks/comments tables (which are untracked and have
-- unknown triggers), so nothing about item interactions changes.

CREATE TABLE IF NOT EXISTS public.posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  item_id BIGINT REFERENCES public.items (id) ON DELETE SET NULL,
  caption TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_created_at_idx
  ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_id_idx
  ON public.posts (user_id);

CREATE TABLE IF NOT EXISTS public.post_media (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS post_media_post_id_idx
  ON public.post_media (post_id, position);

CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id BIGINT NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  post_id BIGINT NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_id_idx
  ON public.post_comments (post_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read posts" ON public.posts;
CREATE POLICY "Authenticated users can read posts" ON public.posts
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can create own posts" ON public.posts;
CREATE POLICY "Users can create own posts" ON public.posts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can read post media" ON public.post_media;
CREATE POLICY "Authenticated users can read post media" ON public.post_media
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can add media to own posts" ON public.post_media;
CREATE POLICY "Users can add media to own posts" ON public.post_media
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id AND posts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete media from own posts" ON public.post_media;
CREATE POLICY "Users can delete media from own posts" ON public.post_media
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id AND posts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read post likes" ON public.post_likes;
CREATE POLICY "Authenticated users can read post likes" ON public.post_likes
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can like posts" ON public.post_likes;
CREATE POLICY "Users can like posts" ON public.post_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unlike posts" ON public.post_likes;
CREATE POLICY "Users can unlike posts" ON public.post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own bookmarks" ON public.post_bookmarks;
CREATE POLICY "Users can read own bookmarks" ON public.post_bookmarks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can bookmark posts" ON public.post_bookmarks;
CREATE POLICY "Users can bookmark posts" ON public.post_bookmarks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove own bookmarks" ON public.post_bookmarks;
CREATE POLICY "Users can remove own bookmarks" ON public.post_bookmarks
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can read post comments" ON public.post_comments;
CREATE POLICY "Authenticated users can read post comments" ON public.post_comments
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Users can comment on posts" ON public.post_comments;
CREATE POLICY "Users can comment on posts" ON public.post_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own comments" ON public.post_comments;
CREATE POLICY "Users can delete own comments" ON public.post_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_media TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_bookmarks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;

-- ---------------------------------------------------------------------------
-- Counter triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_post_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_post_like_count_trigger ON public.post_likes;
CREATE TRIGGER sync_post_like_count_trigger
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();

CREATE OR REPLACE FUNCTION public.sync_post_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_post_comment_count_trigger ON public.post_comments;
CREATE TRIGGER sync_post_comment_count_trigger
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_count();

-- ---------------------------------------------------------------------------
-- Storage bucket for post media (images + video), public read, per-user
-- folder writes.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read for post media" ON storage.objects;
CREATE POLICY "Public read for post media" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Users upload post media to own folder" ON storage.objects;
CREATE POLICY "Users upload post media to own folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users delete own post media" ON storage.objects;
CREATE POLICY "Users delete own post media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'post-media'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

NOTIFY pgrst, 'reload schema';
