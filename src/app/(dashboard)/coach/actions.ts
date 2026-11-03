"use server";

import { prisma } from "@/server/db";
import { requireCoach } from "@/server/auth/guards";
import { availabilitySchema } from "@/lib/validations/availability";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export type AvailabilityActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> };

/** Replaces the complete schedule atomically; the coach is always taken from the session. */
export async function updateAvailability(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const coach = await requireCoach({ onFail: "throw" });
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("availability") ?? "")); } catch { return { ok: false, message: "The schedule could not be read." }; }
  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors: flattened.fieldErrors as Record<string, string[]> };
  }
  const value = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.coachProfile.findUnique({ where: { userId: coach.id }, select: { id: true } });
      if (!profile) throw new Error("Coach profile not found");
      await tx.coachProfile.update({ where: { id: profile.id }, data: { timezone: value.timezone, sessionDurationMinutes: value.sessionDurationMinutes } });
      await tx.weeklyAvailability.deleteMany({ where: { coachId: profile.id } });
      await tx.availabilityException.deleteMany({ where: { coachId: profile.id } });
      await tx.weeklyAvailability.createMany({ data: value.weekly.map((row) => ({ ...row, coachId: profile.id })) });
      await tx.availabilityException.createMany({ data: value.exceptions.map((row) => ({ ...row, coachId: profile.id, startMinute: row.startMinute ?? null, endMinute: row.endMinute ?? null, reason: row.reason ?? null, date: new Date(`${row.date}T00:00:00.000Z`) })) });
    });
    revalidatePath("/coach");
    return { ok: true, message: "Availability saved." };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, message: "Invalid schedule." };
    return { ok: false, message: "Unable to save availability. Nothing was changed." };
  }
}
