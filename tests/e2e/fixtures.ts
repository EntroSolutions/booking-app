import {
  expect,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  E2E_NOW,
  E2E_SECRET,
} from "../../playwright.config";

export type TestData = {
  coachId: string;
  users: Record<"coach" | "client" | "otherClient", { id: string; token: string }>;
};

export const test = base.extend<{ testData: TestData }>({
  testData: [
    async ({ request }, use) => {
      const response = await request.post("/api/test/reset", {
        headers: { "x-e2e-secret": E2E_SECRET },
      });
      expect(response.ok()).toBe(true);
      await use((await response.json()) as TestData);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date(E2E_NOW) });
    await use(page);
  },
});

export { expect };

export async function signIn(
  page: Page,
  token: string,
  baseURL = "http://127.0.0.1:3000",
): Promise<void> {
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function readOutbox(request: APIRequestContext) {
  const response = await request.get("/api/test/outbox", {
    headers: { "x-e2e-secret": E2E_SECRET },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    emails: Array<{
      id: string;
      reservationId: string;
      kind: "BOOKING_CONFIRMATION" | "CANCELLATION_CONFIRMATION";
      recipient: string;
      status: string;
    }>;
  };
}
