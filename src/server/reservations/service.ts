import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { generateSlots } from "@/lib/scheduling";
import {
  isExclusionViolation,
  isUniqueViolation,
  requestFingerprint,
  scopedIdempotencyKey,
} from "@/lib/reservations/idempotency";
import {
  RESERVATION_ERROR_MESSAGES,
  ReservationError,
  type ReservationErrorCode,
} from "@/lib/reservations/errors";
import {
  isCancellationAllowed,
  policyFromEnv,
  type BookingPolicy,
} from "@/lib/reservations/policy";
import { prisma } from "@/server/db";
import { serverNow } from "@/server/clock";

export interface ReservationDto {
  id: string;
  coachId: string;
  clientId: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  cancelledAt: string | null;
  cancelReason: string | null;
}

type CoachSchedule = Prisma.CoachProfileGetPayload<{
  include: {
    user: true;
    weeklyAvailability: true;
    availabilityExceptions: true;
  };
}>;

type ReservationRow = Prisma.ReservationGetPayload<Record<string, never>>;

function domainError(code: ReservationErrorCode, cause?: unknown): ReservationError {
  return new ReservationError(code, {
    message:
      RESERVATION_ERROR_MESSAGES[code] ??
      (code === "INVALID_INPUT"
        ? "The request is invalid."
        : "The reservation request could not be completed."),
    ...(cause === undefined ? {} : { cause }),
  });
}

function dto(row: ReservationRow): ReservationDto {
  return {
    id: row.id,
    coachId: row.coachId,
    clientId: row.clientId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
  };
}

function scheduleInput(coach: CoachSchedule) {
  return {
    timezone: coach.timezone,
    sessionDurationMinutes: coach.sessionDurationMinutes,
    weeklyAvailability: coach.weeklyAvailability.map(
      ({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      }),
    ),
    exceptions: coach.availabilityExceptions.map((exception) => ({
      date: exception.date.toISOString().slice(0, 10),
      isUnavailable: exception.isUnavailable,
      startMinute: exception.startMinute,
      endMinute: exception.endMinute,
    })),
  };
}

async function findSchedule(
  tx: Prisma.TransactionClient,
  coachId: string,
): Promise<CoachSchedule> {
  const coach = await tx.coachProfile.findUnique({
    where: { id: coachId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      weeklyAvailability: true,
      availabilityExceptions: true,
    },
  });
  if (!coach) throw domainError("COACH_NOT_FOUND");
  // The narrowed include is compatible with CoachSchedule while selecting only
  // the public coach fields needed for notifications.
  return coach as CoachSchedule;
}

async function nominalSlots(
  tx: Prisma.TransactionClient,
  coachId: string,
  now: Date,
  policy: BookingPolicy,
): Promise<{
  coach: CoachSchedule;
  slots: Array<{ startsAt: string; endsAt: string }>;
  active: ReservationRow[];
}> {
  const coach = await findSchedule(tx, coachId);
  const localNow = DateTime.fromJSDate(now, { zone: "utc" }).setZone(
    coach.timezone,
  );
  const from = localNow.minus({ days: 1 }).toUTC().toJSDate();
  const to = localNow
    .startOf("day")
    .plus({ days: policy.bookingHorizonDays + 1 })
    .toUTC()
    .toJSDate();
  const active = await tx.reservation.findMany({
    where: {
      coachId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    orderBy: { startsAt: "asc" },
  });
  const slots = generateSlots({
    ...scheduleInput(coach),
    reservations: [],
    leadTimeMinutes: policy.leadTimeMinutes,
    bookingHorizonDays: policy.bookingHorizonDays,
    now,
  });
  return { coach, slots, active };
}

export async function listCoachSlots(
  coachId: string,
  now = serverNow(),
): Promise<Array<{ startsAt: string; endsAt: string }>> {
  const policy = policyFromEnv();
  return prisma.$transaction(async (tx) => {
    const { slots, active } = await nominalSlots(tx, coachId, now, policy);
    return slots.filter(
      (slot) =>
        !active.some(
          (reservation) =>
            Date.parse(slot.startsAt) < reservation.endsAt.getTime() &&
            Date.parse(slot.endsAt) > reservation.startsAt.getTime(),
        ),
    );
  });
}

function overlaps(active: ReservationRow[], startsAt: number, endsAt: number) {
  return active.some(
    (row) => startsAt < row.endsAt.getTime() && endsAt > row.startsAt.getTime(),
  );
}

async function bookingReplay(
  tx: Prisma.TransactionClient,
  key: string,
  fingerprint: string,
  now: Date,
): Promise<ReservationDto | null> {
  await tx.idempotencyRecord.deleteMany({
    where: { key, expiresAt: { lte: now } },
  });
  const record = await tx.idempotencyRecord.findUnique({
    where: { key },
    include: { reservation: true },
  });
  if (!record) return null;
  if (record.fingerprint !== fingerprint) {
    throw domainError("IDEMPOTENCY_KEY_REUSED");
  }
  return dto(record.reservation);
}

/** Book and enqueue confirmation in one serializable database transaction. */
export async function bookReservation(input: {
  coachId: string;
  clientId: string;
  startsAt: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<ReservationDto> {
  const now = input.now ?? serverNow();
  const policy = policyFromEnv();
  const key = scopedIdempotencyKey(
    "book",
    input.clientId,
    input.idempotencyKey,
  );
  const fingerprint = requestFingerprint({
    coachId: input.coachId,
    startsAt: input.startsAt,
  });
  const startsAtMs = Date.parse(input.startsAt);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const replay = await bookingReplay(tx, key, fingerprint, now);
        if (replay) return replay;

        const { coach, slots, active } = await nominalSlots(
          tx,
          input.coachId,
          now,
          policy,
        );
        const earliest =
          now.getTime() + policy.leadTimeMinutes * 60_000;
        if (startsAtMs < earliest) throw domainError("LEAD_TIME_VIOLATION");
        const horizon = DateTime.fromJSDate(now, { zone: "utc" })
          .setZone(coach.timezone)
          .startOf("day")
          .plus({ days: policy.bookingHorizonDays })
          .toMillis();
        if (startsAtMs >= horizon) throw domainError("HORIZON_EXCEEDED");

        const slot = slots.find(
          (candidate) => Date.parse(candidate.startsAt) === startsAtMs,
        );
        if (!slot) throw domainError("SLOT_UNAVAILABLE");
        const endsAtMs = Date.parse(slot.endsAt);
        if (overlaps(active, startsAtMs, endsAtMs)) {
          throw domainError("SLOT_TAKEN");
        }

        const client = await tx.user.findUnique({
          where: { id: input.clientId },
          select: { email: true },
        });
        if (!client) throw domainError("UNAUTHENTICATED");

        const reservation = await tx.reservation.create({
          data: {
            coachId: input.coachId,
            clientId: input.clientId,
            startsAt: new Date(startsAtMs),
            endsAt: new Date(endsAtMs),
            status: "CONFIRMED",
            createdAt: now,
            updatedAt: now,
          },
        });
        await tx.idempotencyRecord.create({
          data: {
            key,
            reservationId: reservation.id,
            fingerprint,
            expiresAt: new Date(
              now.getTime() + policy.idempotencyTtlHours * 3_600_000,
            ),
            createdAt: now,
          },
        });
        await tx.emailOutbox.create({
          data: {
            reservationId: reservation.id,
            kind: "BOOKING_CONFIRMATION",
            recipient: client.email,
            subject: "Your coaching session is confirmed",
            text: `Your session with ${coach.user.name ?? "your coach"} is confirmed for ${slot.startsAt} (${Math.round((endsAtMs - startsAtMs) / 60_000)} minutes).`,
            availableAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        return dto(reservation);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof ReservationError) throw error;
    if (isExclusionViolation(error)) {
      throw domainError("SLOT_TAKEN", error);
    }
    if (isUniqueViolation(error)) {
      const replay = await prisma.idempotencyRecord.findUnique({
        where: { key },
        include: { reservation: true },
      });
      if (replay?.fingerprint === fingerprint) return dto(replay.reservation);
      throw domainError("IDEMPOTENCY_KEY_REUSED", error);
    }
    throw error;
  }
}

function canManage(
  user: { id: string; role: string },
  reservation: { clientId: string; coach: { userId: string } },
): boolean {
  return (
    user.role === "ADMIN" ||
    reservation.clientId === user.id ||
    reservation.coach.userId === user.id
  );
}

/** Cancel an owned reservation and enqueue its email atomically. */
export async function cancelReservation(input: {
  reservationId: string;
  user: { id: string; role: string };
  reason?: string;
  idempotencyKey?: string;
  now?: Date;
}): Promise<ReservationDto> {
  const now = input.now ?? serverNow();
  const policy = policyFromEnv();
  const key = input.idempotencyKey
    ? scopedIdempotencyKey("cancel", input.user.id, input.idempotencyKey)
    : null;
  const fingerprint = requestFingerprint({
    reservationId: input.reservationId,
    reason: input.reason ?? null,
  });

  return prisma.$transaction(
    async (tx) => {
      if (key) {
        await tx.idempotencyRecord.deleteMany({
          where: { key, expiresAt: { lte: now } },
        });
        const previous = await tx.idempotencyRecord.findUnique({
          where: { key },
          include: { reservation: true },
        });
        if (previous) {
          if (previous.fingerprint !== fingerprint) {
            throw domainError("IDEMPOTENCY_KEY_REUSED");
          }
          return dto(previous.reservation);
        }
      }

      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: { coach: true, client: { select: { email: true } } },
      });
      if (!reservation) throw domainError("RESERVATION_NOT_FOUND");
      if (!canManage(input.user, reservation)) {
        throw domainError("FORBIDDEN");
      }
      if (reservation.status === "CANCELLED") {
        if (key) {
          await tx.idempotencyRecord.create({
            data: {
              key,
              reservationId: reservation.id,
              fingerprint,
              expiresAt: new Date(
                now.getTime() + policy.idempotencyTtlHours * 3_600_000,
              ),
            },
          });
          return dto(reservation);
        }
        throw domainError("ALREADY_CANCELLED");
      }
      if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
        throw domainError("INVALID_STATUS_TRANSITION");
      }
      if (
        !isCancellationAllowed(
          reservation.startsAt,
          now,
          policy.cancellationCutoffMinutes,
        )
      ) {
        throw domainError("CANCELLATION_WINDOW_PASSED");
      }

      const changed = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: input.reason ?? null,
          updatedAt: now,
        },
      });
      if (changed.count === 0) {
        const current = await tx.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        });
        if (current.status === "CANCELLED") return dto(current);
        throw domainError("INVALID_STATUS_TRANSITION");
      }

      const cancelled = await tx.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      await tx.emailOutbox.upsert({
        where: {
          reservationId_kind: {
            reservationId: reservation.id,
            kind: "CANCELLATION_CONFIRMATION",
          },
        },
        update: {},
        create: {
          reservationId: reservation.id,
          kind: "CANCELLATION_CONFIRMATION",
          recipient: reservation.client.email,
          subject: "Your coaching session was cancelled",
          text: `Your session scheduled for ${cancelled.startsAt.toISOString()} was cancelled.`,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (key) {
        await tx.idempotencyRecord.create({
          data: {
            key,
            reservationId: reservation.id,
            fingerprint,
            expiresAt: new Date(
              now.getTime() + policy.idempotencyTtlHours * 3_600_000,
            ),
          },
        });
      }
      return dto(cancelled);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
