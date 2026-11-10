import { describe, expect, it } from "vitest";
import {
  REDACTED,
  redactLogValue,
  redactString,
  requestIdFrom,
} from "@/server/observability/logger";
import { isE2eHarnessEnabled, serverNow } from "@/server/clock";

describe("structured diagnostics", () => {
  it("redacts magic-link tokens, bearer credentials and email addresses", () => {
    const value = redactString(
      "https://app.test/callback?token=secret-value&x=1 client@example.com Bearer abc.def",
    );
    expect(value).not.toContain("secret-value");
    expect(value).not.toContain("client@example.com");
    expect(value).not.toContain("abc.def");
  });

  it("recursively redacts sensitive keys", () => {
    expect(
      redactLogValue({
        token: "one",
        nested: { api_key: "two", recipient: "client@example.com" },
        status: 200,
      }),
    ).toEqual({
      token: REDACTED,
      nested: { api_key: REDACTED, recipient: REDACTED },
      status: 200,
    });
  });

  it("accepts only bounded correlation IDs", () => {
    expect(
      requestIdFrom(new Headers({ "x-request-id": "request-12345678" })),
    ).toBe("request-12345678");
    expect(
      requestIdFrom(new Headers({ "x-request-id": "bad id\nwith newline" })),
    ).not.toContain("bad id");
  });
});

describe("deterministic test clock", () => {
  it("uses an explicit instant only for the loopback E2E harness", () => {
    const env = {
      E2E_TESTING: "1",
      E2E_SECRET: "x".repeat(32),
      E2E_NOW: "2026-01-05T08:00:00.000Z",
      APP_URL: "http://127.0.0.1:3000",
    };
    expect(isE2eHarnessEnabled(env)).toBe(true);
    expect(serverNow(env).toISOString()).toBe(env.E2E_NOW);
    expect(
      isE2eHarnessEnabled({ ...env, APP_URL: "https://booking.example" }),
    ).toBe(false);
  });
});
