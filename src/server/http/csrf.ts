import { HttpError } from "./errors";

function expectedOrigin(): string {
  return new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
}

/**
 * Defense in depth for cookie-authenticated mutations. Auth.js and Next server
 * actions have their own CSRF checks; JSON APIs use Origin/Fetch Metadata plus
 * a non-simple content type. Requests without browser metadata remain usable
 * by same-origin server clients and are still subject to authentication.
 */
export function assertCsrfHeaders(
  headers: Headers,
  { requireJson = false }: { requireJson?: boolean } = {},
): void {
  const origin = headers.get("origin");
  const fetchSite = headers.get("sec-fetch-site");

  if (origin) {
    let actual: string;
    try {
      actual = new URL(origin).origin;
    } catch {
      throw new HttpError(403, "CSRF_REJECTED", "The request origin is invalid.");
    }
    if (actual !== expectedOrigin()) {
      throw new HttpError(403, "CSRF_REJECTED", "The request origin is not allowed.");
    }
  } else if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new HttpError(403, "CSRF_REJECTED", "Cross-site requests are not allowed.");
  }

  if (
    requireJson &&
    headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  ) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected JSON input.");
  }
}

export function assertSameOriginRequest(request: Request): void {
  assertCsrfHeaders(request.headers, { requireJson: true });
}
