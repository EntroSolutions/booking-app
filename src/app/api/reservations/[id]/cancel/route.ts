import { requireUser } from "@/server/auth/guards";
import { readJsonBody } from "@/server/http/body";
import { assertSameOriginRequest } from "@/server/http/csrf";
import { jsonResponse, observedRoute } from "@/server/http/route";
import { invalidInput } from "@/server/http/validation";
import { cancelReservationSchema } from "@/lib/validations/reservations";
import {
  clientIp,
  enforceRateLimit,
  rateLimitHeaders,
} from "@/server/rate-limit";
import { cancelReservation } from "@/server/reservations/service";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = observedRoute<RouteContext>(
  "reservations.cancel",
  async (request, { params }) => {
    assertSameOriginRequest(request);
    const user = await requireUser({ onFail: "throw" });
    const decision = await enforceRateLimit(
      "cancellation",
      `${user.id}:${clientIp(request.headers)}`,
    );
    const raw = (await readJsonBody(request, 8 * 1024)) as Record<
      string,
      unknown
    >;
    const { id } = await params;
    const parsed = cancelReservationSchema.safeParse({
      ...raw,
      reservationId: id,
      idempotencyKey:
        request.headers.get("idempotency-key") ?? raw.idempotencyKey,
    });
    if (!parsed.success) throw invalidInput(parsed.error);
    const reservation = await cancelReservation({
      ...parsed.data,
      user: { id: user.id, role: user.role },
    });
    return jsonResponse({ reservation }, 200, rateLimitHeaders(decision));
  },
);
