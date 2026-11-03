import { describe, expect, it } from "vitest";
import {
  generateSlots,
  mergeIntervals,
  SchedulingError,
  sliceSlots,
  subtractInterval,
  type GenerateSlotsInput,
  type Weekday,
  type WeeklyAvailabilityInput,
} from "@/lib/scheduling";

const berlinWeekdays: WeeklyAvailabilityInput[] = (
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as Weekday[]
).flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
]);

function baseInput(
  overrides: Partial<GenerateSlotsInput> = {},
): GenerateSlotsInput {
  return {
    timezone: "Europe/Berlin",
    weeklyAvailability: berlinWeekdays,
    sessionDurationMinutes: 60,
    leadTimeMinutes: 0,
    bookingHorizonDays: 7,
    now: "2026-02-16T08:00:00.000Z", // Monday 09:00 Berlin (CET)
    ...overrides,
  };
}

describe("interval helpers", () => {
  it("merges overlapping and adjacent intervals", () => {
    expect(
      mergeIntervals([
        { startMinute: 0, endMinute: 60 },
        { startMinute: 30, endMinute: 90 },
        { startMinute: 90, endMinute: 120 },
      ]),
    ).toEqual([{ startMinute: 0, endMinute: 120 }]);
  });

  it("subtracts a partial overlap from the middle", () => {
    expect(
      subtractInterval(
        { startMinute: 9 * 60, endMinute: 17 * 60 },
        { startMinute: 12 * 60, endMinute: 13 * 60 },
      ),
    ).toEqual([
      { startMinute: 9 * 60, endMinute: 12 * 60 },
      { startMinute: 13 * 60, endMinute: 17 * 60 },
    ]);
  });

  it("slices only slots that fit entirely inside the interval", () => {
    expect(
      sliceSlots({ startMinute: 9 * 60, endMinute: 11 * 60 + 30 }, 60),
    ).toEqual([
      { startMinute: 540, endMinute: 600 },
      { startMinute: 600, endMinute: 660 },
    ]);
  });
});

describe("generateSlots — normal weeks", () => {
  it("emits UTC ISO slots for a normal winter week", () => {
    const slots = generateSlots(baseInput({ bookingHorizonDays: 1 }));
    // Monday 09:00–12:00 and 13:00–17:00 Berlin → 08:00–11:00 / 12:00–16:00 UTC
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-02-16T08:00:00.000Z",
      "2026-02-16T09:00:00.000Z",
      "2026-02-16T10:00:00.000Z",
      "2026-02-16T12:00:00.000Z",
      "2026-02-16T13:00:00.000Z",
      "2026-02-16T14:00:00.000Z",
      "2026-02-16T15:00:00.000Z",
    ]);
    expect(slots.every((s) => s.endsAt > s.startsAt)).toBe(true);
  });

  it("respects lead time and skips past slots", () => {
    const slots = generateSlots(
      baseInput({
        now: "2026-02-16T09:30:00.000Z", // 10:30 Berlin
        leadTimeMinutes: 60,
        bookingHorizonDays: 1,
      }),
    );
    // Earliest bookable: 10:30 + 60min = 11:30 Berlin → first slot 13:00 Berlin
    expect(slots[0]?.startsAt).toBe("2026-02-16T12:00:00.000Z");
    expect(
      slots.every((s) => Date.parse(s.startsAt) >= Date.parse("2026-02-16T10:30:00.000Z")),
    ).toBe(true);
  });

  it("excludes weekends when only weekdays are configured", () => {
    const slots = generateSlots(
      baseInput({
        now: "2026-02-20T08:00:00.000Z", // Friday
        bookingHorizonDays: 3,
      }),
    );
    const starts = slots.map((s) => s.startsAt);
    expect(starts.some((s) => s.startsWith("2026-02-21"))).toBe(false); // Sat
    expect(starts.some((s) => s.startsWith("2026-02-22"))).toBe(false); // Sun
    expect(starts.some((s) => s.startsWith("2026-02-20"))).toBe(true); // Fri
  });
});

describe("generateSlots — midnight boundaries", () => {
  it("supports availability ending at midnight (1440)", () => {
    const slots = generateSlots({
      timezone: "UTC",
      weeklyAvailability: [
        { weekday: "MONDAY", startMinute: 22 * 60, endMinute: 1440 },
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      now: "2026-02-16T00:00:00.000Z",
    });
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-02-16T22:00:00.000Z",
      "2026-02-16T23:00:00.000Z",
    ]);
    expect(slots[1]?.endsAt).toBe("2026-02-17T00:00:00.000Z");
  });

  it("supports availability starting at local midnight", () => {
    const slots = generateSlots({
      timezone: "UTC",
      weeklyAvailability: [
        { weekday: "MONDAY", startMinute: 0, endMinute: 120 },
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      now: "2026-02-16T00:00:00.000Z",
    });
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-02-16T00:00:00.000Z",
      "2026-02-16T01:00:00.000Z",
    ]);
  });
});

describe("generateSlots — DST spring-forward", () => {
  // America/New_York springs forward 2026-03-08 02:00 → 03:00.
  it("skips local times that fall in the spring-forward gap", () => {
    const slots = generateSlots({
      timezone: "America/New_York",
      weeklyAvailability: [
        { weekday: "SUNDAY", startMinute: 60, endMinute: 4 * 60 }, // 01:00–04:00
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      now: "2026-03-08T05:00:00.000Z", // Sunday local
    });
    const starts = slots.map((s) => s.startsAt);
    // 01:00 EST = 06:00Z exists; end at 02:00 does not → that slot dropped.
    // 02:00 does not exist → dropped. 03:00 EDT = 07:00Z is bookable.
    expect(starts).toEqual(["2026-03-08T07:00:00.000Z"]);
  });

  it("keeps slots entirely before the gap", () => {
    const slots = generateSlots({
      timezone: "America/New_York",
      weeklyAvailability: [
        { weekday: "SUNDAY", startMinute: 0, endMinute: 60 }, // 00:00–01:00
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      // 05:00Z == 00:00 EST on the spring-forward Sunday.
      now: "2026-03-08T05:00:00.000Z",
    });
    expect(slots).toEqual([
      {
        startsAt: "2026-03-08T05:00:00.000Z",
        endsAt: "2026-03-08T06:00:00.000Z",
      },
    ]);
  });
});

describe("generateSlots — DST fall-back", () => {
  // America/New_York falls back 2026-11-01 02:00 → 01:00.
  it("emits a deterministic slot for ambiguous local times", () => {
    const slots = generateSlots({
      timezone: "America/New_York",
      weeklyAvailability: [
        { weekday: "SUNDAY", startMinute: 60, endMinute: 3 * 60 }, // 01:00–03:00
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      now: "2026-11-01T04:00:00.000Z",
    });
    // Luxon resolves ambiguous 01:00 to the earlier offset (EDT, UTC−4).
    // 02:00 is unambiguous EST (UTC−5) after the fold.
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-11-01T05:00:00.000Z", // 01:00 EDT
      "2026-11-01T07:00:00.000Z", // 02:00 EST
    ]);
    // Each slot is exactly 60 minutes in UTC.
    for (const s of slots) {
      expect(Date.parse(s.endsAt) - Date.parse(s.startsAt)).toBe(60 * 60 * 1000);
    }
  });
});

describe("generateSlots — exceptions", () => {
  it("clears the day on a full-day closure", () => {
    const slots = generateSlots(
      baseInput({
        bookingHorizonDays: 1,
        exceptions: [
          { date: "2026-02-16", isUnavailable: true },
        ],
      }),
    );
    expect(slots).toEqual([]);
  });

  it("subtracts a partial closure window", () => {
    const slots = generateSlots(
      baseInput({
        bookingHorizonDays: 1,
        exceptions: [
          {
            date: "2026-02-16",
            isUnavailable: true,
            startMinute: 10 * 60,
            endMinute: 14 * 60,
          },
        ],
      }),
    );
    // Weekly 09–12 & 13–17 minus block 10–14 → 09–10 and 14–17.
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-02-16T08:00:00.000Z", // 09:00
      "2026-02-16T13:00:00.000Z", // 14:00
      "2026-02-16T14:00:00.000Z", // 15:00
      "2026-02-16T15:00:00.000Z", // 16:00
    ]);
  });

  it("adds extra override availability on a closed weekday", () => {
    const slots = generateSlots(
      baseInput({
        now: "2026-02-21T08:00:00.000Z", // Saturday
        bookingHorizonDays: 1,
        exceptions: [
          {
            date: "2026-02-21",
            isUnavailable: false,
            startMinute: 10 * 60,
            endMinute: 12 * 60,
          },
        ],
      }),
    );
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-02-21T09:00:00.000Z",
      "2026-02-21T10:00:00.000Z",
    ]);
  });
});

describe("generateSlots — reservations and partial overlaps", () => {
  it("excludes slots overlapping active reservations", () => {
    const slots = generateSlots(
      baseInput({
        bookingHorizonDays: 1,
        reservations: [
          {
            startsAt: "2026-02-16T09:00:00.000Z",
            endsAt: "2026-02-16T10:00:00.000Z",
            status: "CONFIRMED",
          },
          {
            startsAt: "2026-02-16T12:30:00.000Z",
            endsAt: "2026-02-16T13:30:00.000Z",
            status: "PENDING",
          },
        ],
      }),
    );
    const starts = slots.map((s) => s.startsAt);
    expect(starts).not.toContain("2026-02-16T09:00:00.000Z");
    // 12:00–13:00 overlaps 12:30–13:30
    expect(starts).not.toContain("2026-02-16T12:00:00.000Z");
    // 13:00–14:00 overlaps 12:30–13:30
    expect(starts).not.toContain("2026-02-16T13:00:00.000Z");
    expect(starts).toContain("2026-02-16T08:00:00.000Z");
    expect(starts).toContain("2026-02-16T14:00:00.000Z");
  });

  it("ignores cancelled and completed reservations", () => {
    const slots = generateSlots(
      baseInput({
        bookingHorizonDays: 1,
        reservations: [
          {
            startsAt: "2026-02-16T08:00:00.000Z",
            endsAt: "2026-02-16T09:00:00.000Z",
            status: "CANCELLED",
          },
          {
            startsAt: "2026-02-16T09:00:00.000Z",
            endsAt: "2026-02-16T10:00:00.000Z",
            status: "COMPLETED",
          },
        ],
      }),
    );
    const starts = slots.map((s) => s.startsAt);
    expect(starts).toContain("2026-02-16T08:00:00.000Z");
    expect(starts).toContain("2026-02-16T09:00:00.000Z");
  });
});

describe("generateSlots — validation", () => {
  it("rejects malformed weekly intervals", () => {
    expect(() =>
      generateSlots(
        baseInput({
          weeklyAvailability: [
            { weekday: "MONDAY", startMinute: 100, endMinute: 50 },
          ],
        }),
      ),
    ).toThrow(SchedulingError);
  });

  it("rejects invalid time zones", () => {
    expect(() =>
      generateSlots(baseInput({ timezone: "Not/AZone" })),
    ).toThrow(SchedulingError);
  });

  it("rejects incomplete exception windows", () => {
    expect(() =>
      generateSlots(
        baseInput({
          exceptions: [
            { date: "2026-02-16", isUnavailable: true, startMinute: 60 },
          ],
        }),
      ),
    ).toThrow(SchedulingError);
  });

  it("never emits a slot that extends past the allowed interval", () => {
    const slots = generateSlots({
      timezone: "UTC",
      weeklyAvailability: [
        { weekday: "MONDAY", startMinute: 9 * 60, endMinute: 10 * 60 + 30 },
      ],
      sessionDurationMinutes: 60,
      leadTimeMinutes: 0,
      bookingHorizonDays: 1,
      now: "2026-02-16T00:00:00.000Z",
    });
    // Only 09:00–10:00 fits; 10:00–11:00 would cross 10:30.
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({
      startsAt: "2026-02-16T09:00:00.000Z",
      endsAt: "2026-02-16T10:00:00.000Z",
    });
  });
});
