import { jsonResponse, observedRoute } from "@/server/http/route";
import { assertE2eRequest } from "@/server/testing/access";
import {
  E2E_IDS,
  E2E_SESSION_TOKENS,
  resetDatabaseForTests,
} from "@/server/testing/data";
import { serverNow } from "@/server/clock";

export const POST = observedRoute("test.reset", async (request) => {
  assertE2eRequest(request);
  await resetDatabaseForTests(serverNow());
  return jsonResponse({
    coachId: E2E_IDS.coachProfile,
    users: {
      coach: { id: E2E_IDS.coachUser, token: E2E_SESSION_TOKENS.coach },
      client: { id: E2E_IDS.clientUser, token: E2E_SESSION_TOKENS.client },
      otherClient: {
        id: E2E_IDS.otherClientUser,
        token: E2E_SESSION_TOKENS.otherClient,
      },
    },
  });
});
