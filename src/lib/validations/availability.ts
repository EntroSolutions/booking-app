import { z } from "zod";
import { assertValidTimezone } from "@/lib/scheduling/timezone";
import { WEEKDAYS } from "@/lib/scheduling/types";

const interval = z.object({
  weekday: z.enum(WEEKDAYS),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});
const exception = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isUnavailable: z.boolean(),
    startMinute: z.number().int().min(0).max(1439).nullable().optional(),
    endMinute: z.number().int().min(1).max(1440).nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.startMinute != null &&
      value.endMinute != null &&
      value.startMinute >= value.endMinute
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endMinute"],
        message: "End must be after start",
      });
    }
    if ((value.startMinute == null) !== (value.endMinute == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["startMinute"],
        message: "Start and end must be supplied together",
      });
    }
    if (!value.isUnavailable && value.startMinute == null) {
      ctx.addIssue({
        code: "custom",
        path: ["startMinute"],
        message: "Extra availability needs a time window",
      });
    }
  });

export const availabilitySchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((zone) => {
      try {
        assertValidTimezone(zone);
        return true;
      } catch {
        return false;
      }
    }, "Use a valid IANA time zone"),
  sessionDurationMinutes: z.number().int().min(1).max(480),
  weekly: z
    .array(interval)
    .max(50)
    .superRefine((rows, ctx) => {
      const byDay = new Map<string, typeof rows>();
      rows.forEach((row) =>
        byDay.set(row.weekday, [...(byDay.get(row.weekday) ?? []), row]),
      );
      byDay.forEach((dayRows, weekday) => {
        dayRows.sort((a, b) => a.startMinute - b.startMinute);
        dayRows.forEach((row, index) => {
          if (index && row.startMinute < dayRows[index - 1].endMinute) {
            ctx.addIssue({
              code: "custom",
              path: [weekday],
              message: "Intervals may not overlap",
            });
          }
          if (row.startMinute >= row.endMinute) {
            ctx.addIssue({
              code: "custom",
              path: [index, "endMinute"],
              message: "End must be after start",
            });
          }
        });
      });
    }),
  exceptions: z
    .array(exception)
    .max(100)
    .superRefine((rows, ctx) => {
      const byDate = new Map<
        string,
        Array<{ startMinute: number; endMinute: number; index: number }>
      >();
      rows.forEach((row, index) => {
        if (row.startMinute == null || row.endMinute == null) return;
        const entries = byDate.get(row.date) ?? [];
        entries.push({
          startMinute: row.startMinute,
          endMinute: row.endMinute,
          index,
        });
        byDate.set(row.date, entries);
      });
      byDate.forEach((entries) => {
        entries.sort((a, b) => a.startMinute - b.startMinute);
        entries.forEach((entry, position) => {
          if (
            position &&
            entry.startMinute < entries[position - 1].endMinute
          ) {
            ctx.addIssue({
              code: "custom",
              path: [entry.index],
              message: "Exceptions on the same date may not overlap",
            });
          }
        });
      });
    }),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
