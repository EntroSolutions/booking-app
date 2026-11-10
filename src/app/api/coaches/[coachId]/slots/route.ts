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

export const GET = observedRoute<RouteContext>(
  "slots.list",
  async (request, { params }) => {
    const decision = await enforceRateLimit("slots", clientIp(request.headers));
    const { coachId } = await params;
    const parsed = listSlotsSchema.safeParse({ coachId });
    if (!parsed.success) throw invalidInput(parsed.error);
    const slots = await listCoachSlots(parsed.data.coachId);
    return jsonResponse({ slots }, 200, rateLimitHeaders(decision));
  },
);
