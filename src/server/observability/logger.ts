import { randomUUID } from "node:crypto";

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /(?:^|[_-])(?:token|secret|password|passwd|authorization|cookie|api[_-]?key|email|recipient|verification|magic[_-]?link)(?:$|[_-])/i;
const SENSITIVE_QUERY =
  /([?&](?:token|secret|code|key|signature|sig|email)=)[^&\s]+/gi;
const EMAIL_ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_TOKEN = /(bearer\s+)[A-Z0-9._~+\/-]+=*/gi;

/** Redact secrets and email addresses, including values nested in URLs. */
export function redactString(value: string): string {
  return value
    .replace(SENSITIVE_QUERY, `$1${REDACTED}`)
    .replace(BEARER_TOKEN, `$1${REDACTED}`)
    .replace(EMAIL_ADDRESS, REDACTED);
}

/**
 * Convert arbitrary log metadata to bounded, JSON-safe data. Error messages,
 * request bodies and headers are never logged by the request wrapper.
 */
export function redactLogValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return redactString(value.slice(0, 2_000));
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    // Stack traces and messages can contain provider responses or query data.
    return { name: value.name };
  }
  if (depth >= 4) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactLogValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : redactLogValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

export interface LogContext {
  requestId?: string;
  route?: string;
  [key: string]: unknown;
}

function write(
  level: "info" | "warn" | "error",
  event: string,
  context: LogContext = {},
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redactLogValue(context) as Record<string, unknown>),
  };
  const line = JSON.stringify(entry);
  // eslint-disable-next-line no-console
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  sink(line);
}

export const logger = {
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context),
};

/** Accept only a conservative correlation-id alphabet from callers. */
export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{8,80}$/.test(supplied)
    ? supplied
    : randomUUID();
}

/** Log only non-sensitive error classification, never error text or stacks. */
export function errorLogContext(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { name?: unknown; code?: unknown };
  return {
    ...(typeof candidate.name === "string"
      ? { errorName: candidate.name.slice(0, 80) }
      : {}),
    ...(typeof candidate.code === "string" &&
    /^[A-Z0-9_]{2,40}$/.test(candidate.code)
      ? { errorCode: candidate.code }
      : {}),
  };
}
