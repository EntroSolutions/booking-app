import { expect, readOutbox, signIn, test } from "./fixtures";

const FIRST_SLOT = "2026-01-05 14:00 UTC";

test("@critical coach configures availability reflected in generated slots", async ({
  page,
  testData,
}) => {
  await signIn(page, testData.users.coach.token);
  await page.goto("/coach");
  await page.getByLabel("Time zone").fill("UTC");
  await page.getByLabel("Session duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("status")).toHaveText("Availability saved.");

  await page.goto(`/coaches/${testData.coachId}`);
  await expect(page.getByLabel("Session slots").locator("li")).toHaveCount(6);
  await expect(page.getByText("2026-01-05 09:00 UTC", { exact: true })).toBeVisible();
});

test("@critical client browses deterministic available slots", async ({
  page,
  testData,
}) => {
  await signIn(page, testData.users.client.token);
  await page.goto("/coaches");
  await page.getByRole("link", { name: "View available sessions" }).click();
  await expect(page.getByRole("heading", { name: "Available sessions" })).toBeVisible();
  await expect(page.getByLabel("Session slots").locator("li")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: `Book ${FIRST_SLOT}` }),
  ).toBeVisible();
});

test("@critical client successfully books a session", async ({
  page,
  testData,
}) => {
  await signIn(page, testData.users.client.token);
  await page.goto(`/coaches/${testData.coachId}`);
  await page.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(page.getByRole("status")).toContainText("Session booked");
  await expect(
    page.getByRole("button", { name: `Book ${FIRST_SLOT}` }),
  ).toHaveCount(0);
});

test("@critical concurrent stale booking receives a double-booking conflict", async ({
  browser,
  baseURL,
  testData,
}) => {
  const firstContext = await browser.newContext({
    baseURL,
    timezoneId: "UTC",
    locale: "en-US",
  });
  const secondContext = await browser.newContext({
    baseURL,
    timezoneId: "UTC",
    locale: "en-US",
  });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await signIn(first, testData.users.client.token, baseURL);
  await signIn(second, testData.users.otherClient.token, baseURL);
  await Promise.all([
    first.goto(`/coaches/${testData.coachId}`),
    second.goto(`/coaches/${testData.coachId}`),
  ]);

  await first.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(first.getByRole("status")).toContainText("Session booked");
  await second.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(second.getByRole("alert")).toContainText("just booked");
  await expect(
    second.getByRole("button", { name: `Book ${FIRST_SLOT}` }),
  ).toHaveCount(0);
  await Promise.all([firstContext.close(), secondContext.close()]);
});

test("@critical client and coach dashboards display reservation details", async ({
  browser,
  page,
  baseURL,
  testData,
}) => {
  await signIn(page, testData.users.client.token);
  await page.goto(`/coaches/${testData.coachId}`);
  await page.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(page.getByRole("status")).toContainText("Session booked");
  await page.goto("/client");
  const reservation = page.getByTestId(/reservation-/).first();
  await expect(reservation).toContainText("E2E Coach");
  await expect(reservation).toContainText("CONFIRMED");
  await reservation.getByText("Reservation details").click();
  await expect(reservation).toContainText("Reservation ID:");

  const coachContext = await browser.newContext({ baseURL, timezoneId: "UTC" });
  const coach = await coachContext.newPage();
  await signIn(coach, testData.users.coach.token, baseURL);
  await coach.goto("/coach");
  await expect(coach.getByTestId(/reservation-/).first()).toContainText(
    "E2E Client",
  );
  await coachContext.close();
});

test("@critical cancellation updates dashboard and releases the slot", async ({
  page,
  testData,
}) => {
  await signIn(page, testData.users.client.token);
  await page.goto(`/coaches/${testData.coachId}`);
  await page.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(page.getByRole("status")).toContainText("Session booked");
  await page.goto("/client");
  await page
    .getByRole("button", { name: "Cancel session with E2E Coach" })
    .click();
  await expect(page.getByRole("status")).toContainText("Reservation cancelled");
  await expect(page.getByTestId(/reservation-/).first()).toContainText("CANCELLED");

  await page.goto(`/coaches/${testData.coachId}`);
  await expect(
    page.getByRole("button", { name: `Book ${FIRST_SLOT}` }),
  ).toBeVisible();
});

test("@critical booking and cancellation create transactional outbox emails", async ({
  page,
  request,
  testData,
}) => {
  await signIn(page, testData.users.client.token);
  await page.goto(`/coaches/${testData.coachId}`);
  await page.getByRole("button", { name: `Book ${FIRST_SLOT}` }).click();
  await expect(page.getByRole("status")).toContainText("Session booked");
  const afterBooking = await readOutbox(request);
  expect(afterBooking.emails).toHaveLength(1);
  expect(afterBooking.emails[0]).toMatchObject({
    kind: "BOOKING_CONFIRMATION",
    recipient: "client@e2e.test",
    status: "PENDING",
  });

  await page.goto("/client");
  await page
    .getByRole("button", { name: "Cancel session with E2E Coach" })
    .click();
  await expect(page.getByRole("status")).toContainText("Reservation cancelled");
  const afterCancellation = await readOutbox(request);
  expect(afterCancellation.emails.map((email) => email.kind)).toEqual([
    "BOOKING_CONFIRMATION",
    "CANCELLATION_CONFIRMATION",
  ]);
  expect(new Set(afterCancellation.emails.map((email) => email.reservationId)).size).toBe(1);
});
