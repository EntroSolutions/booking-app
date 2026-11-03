import { describe, expect, it } from "vitest";
import { resolveRedirectUrl, safeCallbackPath } from "@/lib/auth/redirect";

const APP_URL = "http://localhost:3000";

describe("safeCallbackPath", () => {
  it("keeps same-site relative paths with query and hash", () => {
    expect(safeCallbackPath("/coach?tab=1#top", APP_URL)).toBe("/coach?tab=1#top");
  });

  it("accepts absolute URLs on the APP_URL origin and returns the path", () => {
    expect(safeCallbackPath("http://localhost:3000/client", APP_URL)).toBe("/client");
  });

  it.each([
    "https://evil.example.com/steal",
    "//evil.example.com",
    "/\\evil.example.com",
    "javascript:alert(1)",
    "http://localhost:3000.evil.com/",
    "/foo\nbar",
    "",
  ])("falls back for unsafe value %j", (value) => {
    expect(safeCallbackPath(value, APP_URL)).toBe("/dashboard");
  });

  it("falls back for non-string input", () => {
    expect(safeCallbackPath(null, APP_URL)).toBe("/dashboard");
    expect(safeCallbackPath(["/a"], APP_URL)).toBe("/dashboard");
  });

  it("uses a custom fallback", () => {
    expect(safeCallbackPath("https://evil.com", APP_URL, "/")).toBe("/");
  });
});

describe("resolveRedirectUrl", () => {
  it("returns absolute URLs on the APP_URL origin", () => {
    expect(resolveRedirectUrl("/coach", APP_URL)).toBe("http://localhost:3000/coach");
    expect(resolveRedirectUrl("http://localhost:3000/x", APP_URL)).toBe(
      "http://localhost:3000/x",
    );
  });

  it("never redirects off-origin", () => {
    expect(resolveRedirectUrl("https://evil.example.com", APP_URL)).toBe(
      "http://localhost:3000/dashboard",
    );
  });
});
