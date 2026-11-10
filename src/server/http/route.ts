import {
  isAuthorizationError,
} from "@/server/auth/guards";
import {
  isReservationError,
  toErrorBody,
} from "@/lib/reservations/errors";
import { HttpError } from "./errors";
import {
  errorLogContext,
  logger,
  requestIdFrom,
} from "@/server/observability/logger";

export interface RequestContext {
  requestId: string;
}

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Array<{ path: string; message: string }>;
  };
};

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

/** Stable public errors; internal messages and causes never cross the wire. */
export function safeErrorResponse(
  error: unknown,
  requestId: string,
): Response {
  if (isReservationError(error)) {
    const body = toErrorBody(error);
    return jsonResponse(
      {
        error: { ...body.error, requestId },
      },
      error.status,
    );
  }

  if (isAuthorizationError(error)) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message:
            error.status === 401
              ? "Please sign in to continue."
              : "You do not have access to this resource.",
          requestId,
        },
      },
      error.status,
    );
  }

  if (error instanceof HttpError) {
    const body: ErrorBody = {
      error: { code: error.code, message: error.message, requestId },
    };
    return jsonResponse(body, error.status, error.headers);
  }

  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    },
    500,
  );
}

function withResponseHeaders(response: Response, requestId: string): Response {
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Add a correlation ID, structured timing and safe error mapping to a route.
 * Only static route names and status codes are logged, never URLs or bodies.
 */
export function observedRoute<TContext>(
  route: string,
  handler: (
    request: Request,
    context: TContext,
    requestContext: RequestContext,
  ) => Promise<Response>,
): (request: Request, context: TContext) => Promise<Response> {
  return async (request, context) => {
    const requestId = requestIdFrom(request.headers);
    const startedAt = Date.now();
    try {
      const response = await handler(request, context, { requestId });
      logger.info("http.request.completed", {
        requestId,
        route,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return withResponseHeaders(response, requestId);
    } catch (error) {
      const response = safeErrorResponse(error, requestId);
      const context = {
        requestId,
        route,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
        ...errorLogContext(error),
      };
      if (response.status >= 500) {
        logger.error("http.request.failed", context);
      } else {
        logger.warn("http.request.rejected", context);
      }
      return withResponseHeaders(response, requestId);
    }
  };
}
