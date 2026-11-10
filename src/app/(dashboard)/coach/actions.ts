"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireCoach } from "@/server/auth/guards";
import { availabilitySchema } from "@/lib/validations/availability";
import { assertCsrfHeaders } from "@/server/http/csrf";
import { clientIp, enforceRateLimit } from "@/server/rate-limit";
import { logger } from "@/server/observability/logger";

export type AvailabilityActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const MAX_AVAILABILITY_BYTES = 100 * 1024;

/** Replace the complete schedule atomically; coach identity comes from session. */
export async function updateAvailability(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const requestHeaders = await headers();
  assertCsrfHeaders(requestHeaders);
  const coach = await requireCoach({ onFail: "throw" });
  await enforceRateLimit(
    "availability",
    `${coach.id}:${clientIp(requestHeaders)}`,
  );

  const serialized = String(formData.get("availability") ?? "");
  if (new TextEncoder().encode(serialized).byteLength > MAX_AVAILABILITY_BYTES) {
    return { ok: false, message: "The schedule is too large." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return { ok: false, message: "The schedule could not be read." };
  }
  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const value = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.coachProfile.findUnique({
        where: { userId: coach.id },
        select: { id: true },
      });
      if (!profile) throw new Error("Coach profile not found");
      await tx.coachProfile.update({
        where: { id: profile.id },
        data: {
          timezone: value.timezone,
          sessionDurationMinutes: value.sessionDurationMinutes,
        },
      });
      await tx.weeklyAvailability.deleteMany({ where: { coachId: profile.id } });
      await tx.availabilityException.deleteMany({
        where: { coachId: profile.id },
      });
      await tx.weeklyAvailability.createMany({
        data: value.weekly.map((row) => ({ ...row, coachId: profile.id })),
      });
      await tx.availabilityException.createMany({
        data: value.exceptions.map((row) => ({
          ...row,
          coachId: profile.id,
          startMinute: row.startMinute ?? null,
          endMinute: row.endMinute ?? null,
          reason: row.reason ?? null,
          date: new Date(`${row.date}T00:00:00.000Z`),
        })),
      });
    });
    revalidatePath("/coach");
    revalidatePath(`/coaches/${coach.id}`);
    return { ok: true, message: "Availability saved." };
  } catch {
    logger.warn("availability.update.failed", { userId: coach.id });
    return {
      ok: false,
      message: "Unable to save availability. Nothing was changed.",
    };
  }
}
