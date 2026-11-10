// Auth.js owns magic-link token verification and CSRF. This wrapper adds only
// abuse controls, correlation IDs and safe diagnostics without reading bodies.
import { handlers } from "@/server/auth";
import { observedRoute } from "@/server/http/route";
import {
  clientIp,
  enforceRateLimit,
  rateLimitHeaders,
  type RateLimitDecision,
} from "@/server/rate-limit";

type AuthContext = { params: Promise<{ nextauth: string[] }> };
type AuthHandler = (request: Request, context: AuthContext) => Promise<Response>;

function needsLimit(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    request.method === "POST" ||
    path.includes("/api/auth/callback/") ||
    path.includes("/api/auth/signin/")
  );
}

function limited(
  response: Response,
  decision: RateLimitDecision | null,
): Response {
  if (!decision) return response;
  for (const [key, value] of Object.entries(rateLimitHeaders(decision))) {
    response.headers.set(key, value);
  }
  return response;
}

export const GET = observedRoute<AuthContext>(
  "auth.get",
  async (request, context) => {
    const decision = needsLimit(request)
      ? await enforceRateLimit("auth", clientIp(request.headers))
      : null;
    const response = await (handlers.GET as unknown as AuthHandler)(
      request,
      context,
    );
    return limited(response, decision);
  },
);

export const POST = observedRoute<AuthContext>(
  "auth.post",
  async (request, context) => {
    const decision = await enforceRateLimit("auth", clientIp(request.headers));
    const response = await (handlers.POST as unknown as AuthHandler)(
      request,
      context,
    );
    return limited(response, decision);
  },
);
