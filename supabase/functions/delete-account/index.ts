// Permanently deletes the authenticated user's account and data.
// Required for App Store review (in-app account deletion).
//
// Deploy: npx supabase functions deploy delete-account
//
// Deletion order matters: child rows are removed before their parents in
// case foreign keys don't cascade. Steps are best-effort where the table
// may not exist yet in a given environment.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    // 1. Collect the user's item ids (needed to clear rows keyed by item).
    const { data: items } = await admin
      .from("items")
      .select("id")
      .eq("user_id", userId);
    const itemIds = (items ?? []).map((item) => item.id);

    // 2. Interactions on the user's items (other users' likes/comments/
    //    bookmarks would otherwise block the item delete via FKs).
    if (itemIds.length > 0) {
      for (const table of ["likes", "bookmarks", "comments", "showcase_items"]) {
        await admin.from(table).delete().in("item_id", itemIds);
      }
    }

    // 3. Rows the user created on other people's content.
    for (const table of ["likes", "bookmarks", "comments"]) {
      await admin.from(table).delete().eq("user_id", userId);
    }
    await admin.from("follows").delete().eq("follower_id", userId);
    await admin.from("follows").delete().eq("following_id", userId);

    // 4. The user's own content and billing rows.
    await admin.from("items").delete().eq("user_id", userId);
    await admin.from("showcase").delete().eq("profile_id", userId);
    await admin.from("subscriptions").delete().eq("user_id", userId);
    await admin.from("billing_customers").delete().eq("user_id", userId);
    await admin.from("profile").delete().eq("id", userId);

    // 5. Uploaded images (uploads are scoped to <user_id>/...).
    try {
      const { data: files } = await admin.storage
        .from("item-images")
        .list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        await admin.storage
          .from("item-images")
          .remove(files.map((file) => `${userId}/${file.name}`));
      }
    } catch (storageError) {
      // Non-fatal: orphaned files can be cleaned up out of band.
      console.error("[delete-account] Storage cleanup failed:", storageError);
    }

    // 6. Finally the auth user itself.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ deleted: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return json({ error: "Failed to delete account" }, 500);
  }
});
