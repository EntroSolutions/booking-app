// Unit tests for the client booking API helper module: URL construction,
// error extraction and conflict-code classification. Network calls use the
// mocked global fetch available in the jsdom test environment.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchSlots,
  SLOT_CONFLICT_CODES,
  signInUrl,
} from "@/app/coaches/[coachId]/booking/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SLOT_CONFLICT_CODES", () => {
  it("covers the codes the client should treat as stale-slot conflicts", () => {
    expect(SLOT_CONFLICT_CODES.has("SLOT_TAKEN")).toBe(true);
    expect(SLOT_CONFLICT_CODES.has("SLOT_UNAVAILABLE")).toBe(true);
    expect(SLOT_CONFLICT_CODES.has("LEAD_TIME_VIOLATION")).toBe(true);
    expect(SLOT_CONFLICT_CODES.has("INVALID_INPUT")).toBe(false);
  });
});

describe("signInUrl", () => {
  it("preserves the coach and selected slot through the redirect", () => {
    const url = signInUrl("coach_1", "2026-06-01T09:00:00.000Z");
    expect(url).toContain("/sign-in?callbackUrl=");
    const callback = decodeURIComponent(url.split("callbackUrl=")[1]);
    expect(callback).toBe(
      "/coaches/coach_1?slot=2026-06-01T09:00:00.000Z",
    );
  });

  it("encodes slot values safely", () => {
    const url = signInUrl("coach_1", "2026-06-01T09:00:00.000+02:00");
    expect(url).not.toContain("+02:00");
  });
});

describe("fetchSlots", () => {
  it("returns slots from a successful response", async () => {
    const slots = [{ id: "s1", startsAt: "x", endsAt: "y" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ slots }), { status: 200 }),
      ),
    );
    await expect(fetchSlots("coach_1", "2026-06-01", "2026-06-02")).resolves.toEqual(
      slots,
    );
  });

  it("requests the right endpoint with the from/to window", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ slots: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await fetchSlots("coach_1", "2026-06-01", "2026-06-02");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/coaches/coach_1/slots?from=2026-06-01&to=2026-06-02");
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("throws an ApiError carrying the stable server error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "COACH_NOT_FOUND", message: "Nope" } }),
          { status: 404 },
        ),
      ),
    );
    const error = await fetchSlots("coach_1", "2026-06-01", "2026-06-02").catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("COACH_NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("falls back to UNKNOWN when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })),
    );
    const error = await fetchSlots("coach_1", "a", "b").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
  });

  it("throws UNKNOWN for a malformed success payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
      ),
    );
    const error = await fetchSlots("coach_1", "a", "b").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNKNOWN");
  });
});
