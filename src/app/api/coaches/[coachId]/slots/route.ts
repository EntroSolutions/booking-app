import { listSlotsSchema } from "@/lib/validations/reservations";
import { observedRoute, jsonResponse } from "@/server/http/route";
import { invalidInput } from "@/server/http/validation";
import {
  clientIp,
  enforceRateLimit,
  rateLimitHeaders,
} from "@/server/rate-limit";
import { listCoachSlots } from "@/server/reservations/service";

type RouteContext = { params: Promise<{ coachId: string }> };

/**
 * List a coach's bookable slots.
 *
 * Optional `from` and `to` query params (ISO 8601 instants with offsets) bound
 * the response to a half-open [from, to) window. The client booking calendar
 * pages through the horizon in one-week ranges instead of fetching every slot
 * for the next 30 days at once.
 */
export const GET = observedRoute<RouteContext>(
  "slots.list",
  async (request, { params }) => {
    const decision = await enforceRateLimit("slots", clientIp(request.headers));
    const { coachId } = await params;
    const url = new URL(request.url);
    const parsed = listSlotsSchema.safeParse({
      coachId,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) throw invalidInput(parsed.error);
    let slots = await listCoachSlots(parsed.data.coachId);
    if (parsed.data.from) {
      const fromMs = Date.parse(parsed.data.from);
      slots = slots.filter((slot) => Date.parse(slot.startsAt) >= fromMs);
    }
    if (parsed.data.to) {
      const toMs = Date.parse(parsed.data.to);
      slots = slots.filter((slot) => Date.parse(slot.startsAt) < toMs);
    }
    return jsonResponse({ slots }, 200, rateLimitHeaders(decision));
  },
);
