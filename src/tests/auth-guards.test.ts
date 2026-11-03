import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Auth.js entry point (avoids Prisma/next-auth at test time) and
// next/navigation's redirect, which signals via a thrown error.
const authMock = vi.fn();
vi.mock("@/server/auth", () => ({ auth: () => authMock() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  AuthorizationError,
  getCurrentUser,
  requireClient,
  requireCoach,
  requireUser,
} from "@/server/auth/guards";

const sessionFor = (role: string) => ({
  user: { id: "u1", email: "u@example.com", name: "U", role },
  expires: "2099-01-01T00:00:00.000Z",
});

beforeEach(() => authMock.mockReset());

describe("getCurrentUser", () => {
  it("returns null without a session", async () => {
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns only id, email, name and role", async () => {
    authMock.mockResolvedValue({
      ...sessionFor("COACH"),
      user: { ...sessionFor("COACH").user, extra: "secret" },
    });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "u@example.com",
      name: "U",
      role: "COACH",
    });
  });
});

describe("redirect mode", () => {
  it("sends signed-out users to sign-in with an encoded callback", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser({ callbackPath: "/coach?a=1" })).rejects.toThrow(
      "REDIRECT:/sign-in?callbackUrl=%2Fcoach%3Fa%3D1",
    );
  });

  it("sends signed-out users to plain sign-in without a callback", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireCoach()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("redirects a client away from coach routes", async () => {
    authMock.mockResolvedValue(sessionFor("CLIENT"));
    await expect(requireCoach()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects a coach away from client routes", async () => {
    authMock.mockResolvedValue(sessionFor("COACH"));
    await expect(requireClient()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("returns the user when the role matches", async () => {
    authMock.mockResolvedValue(sessionFor("COACH"));
    await expect(requireCoach()).resolves.toMatchObject({ id: "u1", role: "COACH" });
  });
});

describe("throw mode", () => {
  it("throws a 401 AuthorizationError when signed out", async () => {
    authMock.mockResolvedValue(null);
    const error = await requireUser({ onFail: "throw" }).catch((e) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("throws a 403 AuthorizationError for the wrong role", async () => {
    authMock.mockResolvedValue(sessionFor("CLIENT"));
    const error = await requireCoach({ onFail: "throw" }).catch((e) => e);
    expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("allows the right role", async () => {
    authMock.mockResolvedValue(sessionFor("CLIENT"));
    await expect(requireClient({ onFail: "throw" })).resolves.toMatchObject({
      role: "CLIENT",
    });
  });
});
