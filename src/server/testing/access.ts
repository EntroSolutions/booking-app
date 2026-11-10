import { timingSafeEqual } from "node:crypto";
import { isE2eHarnessEnabled } from "@/server/clock";
import { HttpError } from "@/server/http/errors";

function secretsMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Test-only routes return 404 unless every production safeguard is present. */
export function assertE2eRequest(request: Request): void {
  const secret = process.env.E2E_SECRET ?? "";
  const supplied = request.headers.get("x-e2e-secret") ?? "";
  if (!isE2eHarnessEnabled() || !secretsMatch(supplied, secret)) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }
}
