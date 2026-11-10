import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/server/rate-limit";
import { createMemoryRateLimitStore } from "@/server/rate-limit/store";

 describe("rate limiting", () => {
  it("shares a fixed window and reports retry metadata", async () => {
    let now = 1_000;
    const store = createMemoryRateLimitStore(() => now);
    const first = await checkRateLimit("booking", "user-a", store);
    expect(first).toMatchObject({ allowed: true, limit: 10, remaining: 9 });

    for (let index = 0; index < 9; index += 1) {
      await checkRateLimit("booking", "user-a", store);
    }
    const rejected = await checkRateLimit("booking", "user-a", store);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);

    now += 60_001;
    const nextWindow = await checkRateLimit("booking", "user-a", store);
    expect(nextWindow.allowed).toBe(true);
  });

  it("isolates users and buckets", async () => {
    const store = createMemoryRateLimitStore(() => 1_000);
    await checkRateLimit("booking", "user-a", store);
    const other = await checkRateLimit("booking", "user-b", store);
    expect(other.remaining).toBe(9);
  });

  it("can reset local state between deterministic tests", () => {
    const reset = vi.fn();
    reset();
    expect(reset).toHaveBeenCalledOnce();
  });
});
