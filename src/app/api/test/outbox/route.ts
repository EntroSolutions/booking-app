import { prisma } from "@/server/db";
import { jsonResponse, observedRoute } from "@/server/http/route";
import { assertE2eRequest } from "@/server/testing/access";

export const GET = observedRoute("test.outbox", async (request) => {
  assertE2eRequest(request);
  const emails = await prisma.emailOutbox.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reservationId: true,
      kind: true,
      recipient: true,
      status: true,
    },
  });
  return jsonResponse({ emails });
});
