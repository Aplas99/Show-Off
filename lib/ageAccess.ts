import { z } from "zod";

export const reportedAgeSchema = z.number().int().min(13, "Show Off is available to ages 13 and older.").max(120, "Please enter your current age.");

/** A lower bound: without a birthday, advance only on recording anniversaries. */
export function conservativeAge(reportedAge: number | null, recordedAt: string | null, now = new Date()): number | null {
  if (!reportedAgeSchema.safeParse(reportedAge).success || !recordedAt) return null;
  const recorded = new Date(recordedAt);
  if (!Number.isFinite(recorded.getTime()) || recorded > now) return null;
  let years = now.getUTCFullYear() - recorded.getUTCFullYear();
  if (now.getUTCMonth() < recorded.getUTCMonth() ||
    (now.getUTCMonth() === recorded.getUTCMonth() && now.getUTCDate() < recorded.getUTCDate())) years--;
  return reportedAge! + years;
}
