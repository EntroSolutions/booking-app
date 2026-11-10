import { prisma } from "@/server/db";
import { jsonResponse, observedRoute } from "@/server/http/route";

async function databaseReady(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("readiness timeout")), 2_000);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, deadline]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Minimal readiness: process is serving and a real database query succeeds. */
export const GET = observedRoute("health.readiness", async () => {
  const database = await databaseReady();
  return jsonResponse(
    {
      status: database ? "ok" : "unavailable",
      checks: { application: "ok", database: database ? "ok" : "unavailable" },
    },
    database ? 200 : 503,
  );
});
