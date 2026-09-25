import { connection } from "next/server";

import { getRemoteTimestamp } from "../../../lib/timestamps";

export const GET = async () => {
  // Read the cache on every request instead of once at build time.
  await connection();
  return Response.json({ timestamp: await getRemoteTimestamp() });
};
