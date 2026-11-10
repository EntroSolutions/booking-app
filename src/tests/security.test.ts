import { afterEach, describe, expect, it } from "vitest";
import { readJsonBody } from "@/server/http/body";
import { assertCsrfHeaders } from "@/server/http/csrf";
import { HttpError } from "@/server/http/errors";
import { safeErrorResponse } from "@/server/http/route";

const originalAppUrl = process.env.APP_URL;
afterEach(() => {
  process.env.APP_URL = originalAppUrl;
});

describe("request hardening", () => {
  it("rejects cross-origin cookie mutations", () => {
    process.env.APP_URL = "https://booking.example";
    expect(() =>
      assertCsrfHeaders(
        new Headers({
          origin: "https://attacker.example",
          "content-type": "application/json",
        }),
        { requireJson: true },
      ),
    ).toThrowError(HttpError);
  });

  it("accepts the configured same origin", () => {
    process.env.APP_URL = "https://booking.example";
    expect(() =>
      assertCsrfHeaders(
        new Headers({
          origin: "https://booking.example",
          "content-type": "application/json; charset=utf-8",
        }),
        { requireJson: true },
      ),
    ).not.toThrow();
  });

  it("enforces a byte limit even when content-length is absent", async () => {
    const request = new Request("http://localhost/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100) }),
    });
    await expect(readJsonBody(request, 32)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("does not serialize internal error messages", async () => {
    const response = safeErrorResponse(
      new Error("secret-token@example.com"),
      "request-12345678",
    );
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret-token");
    expect(JSON.parse(text).error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId: "request-12345678",
    });
  });
});
