import { describe, expect, it } from "vitest";
import { exampleSchema } from "@/lib/validations";

describe("exampleSchema", () => {
  it("accepts a valid value", () => {
    expect(exampleSchema.safeParse({ name: "coach" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(exampleSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
