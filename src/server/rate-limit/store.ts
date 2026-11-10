export interface RateLimitWindow {
  count: number;
  ttlMs: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitWindow>;
}

type MemoryEntry = { count: number; resetAt: number };

/** A bounded fixed-window store suitable for one local development process. */
export function createMemoryRateLimitStore(
  now: () => number = Date.now,
): RateLimitStore & { reset(): void; size(): number } {
  const entries = new Map<string, MemoryEntry>();
  const maxEntries = 10_000;

  return {
    async increment(key, windowMs) {
      const timestamp = now();
      const previous = entries.get(key);
      if (!previous || previous.resetAt <= timestamp) {
        entries.set(key, { count: 1, resetAt: timestamp + windowMs });
      } else {
        previous.count += 1;
      }

      // Opportunistic cleanup keeps a long-running local server bounded.
      if (entries.size > maxEntries) {
        for (const [entryKey, entry] of entries) {
          if (entry.resetAt <= timestamp) entries.delete(entryKey);
        }
        if (entries.size > maxEntries) {
          const oldest = entries.keys().next().value as string | undefined;
          if (oldest) entries.delete(oldest);
        }
      }

      const current = entries.get(key)!;
      return {
        count: current.count,
        ttlMs: Math.max(0, current.resetAt - timestamp),
      };
    },
    reset() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

const globalStore = globalThis as unknown as {
  bookingRateLimitStore?: ReturnType<typeof createMemoryRateLimitStore>;
};

export const memoryRateLimitStore =
  globalStore.bookingRateLimitStore ??
  (globalStore.bookingRateLimitStore = createMemoryRateLimitStore());

export function resetLocalRateLimits(): void {
  memoryRateLimitStore.reset();
}

/** Atomic Redis fixed window, executed through the Upstash REST API. */
export function createUpstashRateLimitStore(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): RateLimitStore {
  const endpoint = url.replace(/\/$/, "");
  return {
    async increment(key, windowMs) {
      const script =
        "local count = redis.call('INCR', KEYS[1]) " +
        "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
        "return {count, redis.call('PTTL', KEYS[1])}";
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["EVAL", script, "1", key, String(windowMs)]),
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error("Rate limit store unavailable");
      const body: unknown = await response.json();
      const result = (body as { result?: unknown })?.result;
      if (
        !Array.isArray(result) ||
        typeof result[0] !== "number" ||
        typeof result[1] !== "number"
      ) {
        throw new Error("Invalid rate limit store response");
      }
      return { count: result[0], ttlMs: Math.max(0, result[1]) };
    },
  };
}
