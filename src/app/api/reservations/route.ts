import { Prisma } from "@prisma/client";
import { requireClient, requireUser } from "@/server/auth/guards";
import { serverNow } from "@/server/clock";
import { readJsonBody } from "@/server/http/body";
import { assertSameOriginRequest } from "@/server/http/csrf";
import { jsonResponse, observedRoute } from "@/server/http/route";
import { invalidInput } from "@/server/http/validation";
import {
  createReservationSchema,
  listReservationsSchema,
  reservationListParams,
} from "@/lib/validations/reservations";
import {
  clientIp,
  enforceRateLimit,
  rateLimitHeaders,
} from "@/server/rate-limit";
import { bookReservation } from "@/server/reservations/service";
import { prisma } from "@/server/db";

export const POST = observedRoute("reservations.create", async (request) => {
  assertSameOriginRequest(request);
  const user = await requireClient({ onFail: "throw" });
  const decision = await enforceRateLimit(
    "booking",
    `${user.id}:${clientIp(request.headers)}`,
  );
  const raw = (await readJsonBody(request)) as Record<string, unknown>;
  const parsed = createReservationSchema.safeParse({
    ...raw,
    idempotencyKey:
      request.headers.get("idempotency-key") ?? raw.idempotencyKey,
  });
  if (!parsed.success) throw invalidInput(parsed.error);
  const reservation = await bookReservation({
    ...parsed.data,
    clientId: user.id,
  });
  return jsonResponse({ reservation }, 201, rateLimitHeaders(decision));
});

export const GET = observedRoute("reservations.list", async (request) => {
  const user = await requireUser({ onFail: "throw" });
  const decision = await enforceRateLimit(
    "reservations",
    `${user.id}:${clientIp(request.headers)}`,
  );
  const parsed = listReservationsSchema.safeParse(
    reservationListParams(new URL(request.url).searchParams),
  );
  if (!parsed.success) throw invalidInput(parsed.error);
  const input = parsed.data;

  const where: Prisma.ReservationWhereInput = {};
  if (input.scope === "coach") {
    const profile = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) return jsonResponse({ reservations: [] });
    where.coachId = profile.id;
  } else {
    where.clientId = user.id;
    if (input.coachId) where.coachId = input.coachId;
  }
  if (!input.includePast) where.endsAt = { gte: serverNow() };
  if (input.status) where.status = { in: input.status };

  const rows = await prisma.reservation.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: input.limit,
  });
  return jsonResponse(
    {
      reservations: rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    },
    200,
    rateLimitHeaders(decision),
  );
});
