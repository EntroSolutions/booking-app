import { HttpError } from "./errors";

export const JSON_BODY_LIMIT = 16 * 1024;

/** Read JSON with a real byte limit; route handlers do not have a body cap. */
export async function readJsonBody(
  request: Request,
  maxBytes = JSON_BODY_LIMIT,
): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected JSON input.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  if (!text.trim()) {
    throw new HttpError(400, "INVALID_JSON", "A JSON body is required.");
  }

  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The JSON body is invalid.");
  }
}
