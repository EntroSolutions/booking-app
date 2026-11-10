import type { ZodError } from "zod";
import { ReservationError } from "@/lib/reservations/errors";

export function invalidInput(error: ZodError): ReservationError {
  return new ReservationError("INVALID_INPUT", {
    message: "Please correct the request fields.",
    details: error.issues.slice(0, 30).map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}
