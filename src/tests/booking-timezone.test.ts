import { describe, expect, it } from "vitest";
import {
  FALLBACK_TIMEZONES,
  formatDayKeyLabel,
  formatTime,
  groupSlotsByDay,
  slotLabel,
} from "@/app/coaches/[coachId]/booking/timezone";

const utc = "UTC";
const tokyo = "Asia/Tokyo";

describe("formatTime", () => {
  it("formats hours and minutes with a zone label", () => {
    const { time, zoneLabel } = formatTime(
      "2026-06-01T09:00:00.000Z",
      "Europe/Berlin",
    );
    expect(time).toMatch(/11:?00/);
    expect(zoneLabel).toBeTruthy();
  });

  it("falls back to the raw input for invalid instants", () => {
    const result = formatTime("not-a-date", utc);
    expect(result.time).toBe("not-a-date");
    expect(result.zoneLabel).toBe(utc);
  });
});

describe("groupSlotsByDay", () => {
  const slot = (id: string, iso: string) => ({
    id,
    startsAt: iso,
    endsAt: iso,
  });

  it("groups slots under their calendar day in the viewer's zone", () => {
    const groups = groupSlotsByDay(
      [
        slot("a", "2026-06-01T09:00:00.000Z"),
        slot("b", "2026-06-01T10:00:00.000Z"),
        slot("c", "2026-06-02T09:00:00.000Z"),
      ],
      utc,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2026-06-01");
    expect(groups[0].slots.map((s) => s.id)).toEqual(["a", "b"]);
    expect(groups[1].date).toBe("2026-06-02");
    expect(groups[0].label).toContain("June");
  });

  it("assigns the same instant to different days in different zones", () => {
    const instant = "2026-06-01T20:00:00.000Z";
    const inUtc = groupSlotsByDay([slot("a", instant)], utc);
    const inTokyo = groupSlotsByDay([slot("a", instant)], tokyo);
    expect(inUtc[0].date).toBe("2026-06-01");
    expect(inTokyo[0].date).toBe("2026-06-02");
  });

  it("preserves slot order within a group", () => {
    const groups = groupSlotsByDay(
      [
        slot("late", "2026-06-01T18:00:00.000Z"),
        slot("early", "2026-06-01T08:00:00.000Z"),
      ],
      utc,
    );
    expect(groups[0].slots.map((s) => s.id)).toEqual(["late", "early"]);
  });

  it("returns an empty list for no slots", () => {
    expect(groupSlotsByDay([], utc)).toEqual([]);
  });
});

describe("formatDayKeyLabel", () => {
  it("renders a human label for a day key without shifting the date", () => {
    expect(formatDayKeyLabel("2026-03-03", utc)).toMatch(/March 3, 2026|3 March 2026/);
  });

  it("keeps the same calendar day regardless of the zone (noon UTC)", () => {
    expect(formatDayKeyLabel("2026-03-03", tokyo)).toMatch(/March 3, 2026|3 March 2026/);
    expect(formatDayKeyLabel("2026-03-03", "America/Los_Angeles")).toMatch(
      /March 3, 2026|3 March 2026/,
    );
  });
});

describe("slotLabel", () => {
  it("formats a slot as time plus zone label", () => {
    const label = slotLabel(
      { id: "a", startsAt: "2026-06-01T09:00:00.000Z", endsAt: "" },
      utc,
    );
    expect(label).toMatch(/09:?00/);
    expect(label).toContain("UTC");
  });
});

describe("FALLBACK_TIMEZONES", () => {
  it("contains valid IANA zone identifiers including UTC", () => {
    expect(FALLBACK_TIMEZONES).toContain("UTC");
    for (const zone of FALLBACK_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone })).not.toThrow();
    }
  });
});
