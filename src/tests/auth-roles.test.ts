import { describe, expect, it } from "vitest";
import {
  authorize,
  homePathForRole,
  parseEmailList,
  resolveInitialRole,
  type SessionUser,
} from "@/lib/auth/roles";

const user = (role: SessionUser["role"]): SessionUser => ({
  id: "u1",
  email: "u@example.com",
  name: null,
  role,
});

describe("authorize", () => {
  it("treats a missing user as unauthenticated", () => {
    expect(authorize(null, ["COACH"])).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
    expect(authorize(undefined)).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
  });

  it("treats an unknown role as unauthenticated", () => {
    const bad = { ...user("CLIENT"), role: "ROOT" } as unknown as SessionUser;
    expect(authorize(bad)).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
  });

  it("allows any signed-in user when no roles are required", () => {
    expect(authorize(user("CLIENT")).ok).toBe(true);
  });

  it("allows a matching role", () => {
    expect(authorize(user("COACH"), ["COACH"]).ok).toBe(true);
  });

  it("forbids a client from coach-only access and vice versa", () => {
    expect(authorize(user("CLIENT"), ["COACH"])).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(authorize(user("COACH"), ["CLIENT"])).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("does not grant coach access to admins implicitly", () => {
    expect(authorize(user("ADMIN"), ["COACH"])).toEqual({ ok: false, reason: "FORBIDDEN" });
  });
});

describe("initial role assignment", () => {
  it("defaults to CLIENT", () => {
    expect(resolveInitialRole("a@example.com", new Set())).toBe("CLIENT");
  });

  it("promotes allowlisted emails to COACH case-insensitively", () => {
    const coaches = parseEmailList(" Coach@Example.com , other@example.com ");
    expect(resolveInitialRole("COACH@example.com", coaches)).toBe("COACH");
    expect(resolveInitialRole("client@example.com", coaches)).toBe("CLIENT");
  });

  it("parses an undefined list as empty", () => {
    expect(parseEmailList(undefined).size).toBe(0);
  });
});

describe("homePathForRole", () => {
  it("maps roles to dashboards", () => {
    expect(homePathForRole("COACH")).toBe("/coach");
    expect(homePathForRole("CLIENT")).toBe("/client");
    expect(homePathForRole("ADMIN")).toBe("/");
  });
});
