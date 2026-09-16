import { useAuthStore } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

export const reportTypes = ["account", "item", "showcase", "post", "comment", "post_comment"] as const;
export type ReportType = typeof reportTypes[number];
export const reportReasons = ["harassment", "hate", "sexual", "violence", "child_safety", "scam", "privacy", "other"] as const;
const reportInput = z.object({ type: z.enum(reportTypes), id: z.string().min(1), reason: z.enum(reportReasons), details: z.string().max(2000) });
export function useReportContent() {
  return useMutation({ mutationFn: async (input: z.infer<typeof reportInput>) => {
    const value = reportInput.parse(input);
    const { data, error } = await supabase.rpc("report_content", { p_type: value.type, p_id: value.id, p_reason: value.reason, p_details: value.details });
    if (error) throw new Error(error.message);
    return data;
  } });
}
export function useSetUserBlock() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
    const { error } = await supabase.rpc("set_user_block", { p_user_id: userId, p_blocked: blocked });
    if (error) throw new Error(error.message);
  }, onSuccess: () => { void qc.invalidateQueries(); } });
}
export function useBlockedUsers() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({ queryKey: ["safety", "blocks", userId], enabled: !!userId, queryFn: async () => {
    const { data, error } = await supabase.from("user_blocks").select("blocked_id,created_at").eq("blocker_id", userId!).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return z.array(z.object({ blocked_id: z.string(), created_at: z.string() })).parse(data);
  } });
}
export function useModeratorAccess() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({ queryKey: ["safety", "moderator", userId], enabled: !!userId, queryFn: async () => {
    const { data, error } = await supabase.rpc("is_moderator");
    if (error) throw new Error(error.message);
    return data === true;
  } });
}
const reportSchema = z.object({ id: z.string(), target_type: z.enum(reportTypes), target_id: z.string(), target_owner: z.string().nullable(), reason: z.string(), details: z.string(), context: z.record(z.string(), z.unknown()), status: z.string(), resolution: z.string().nullable(), created_at: z.string() });
export function useModerationReports() {
  const access = useModeratorAccess();
  return useQuery({ queryKey: ["safety", "reports"], enabled: access.data === true, queryFn: async () => {
    const { data, error } = await supabase.from("content_reports").select("id,target_type,target_id,target_owner,reason,details,context,status,resolution,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return z.array(reportSchema).parse(data);
  } });
}
export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { reportId: string; action: string; note: string }) => {
    const { error } = await supabase.rpc("resolve_content_report", { p_report_id: input.reportId, p_action: input.action, p_note: input.note });
    if (error) throw new Error(error.message);
  }, onSuccess: () => { void qc.invalidateQueries(); } });
}
