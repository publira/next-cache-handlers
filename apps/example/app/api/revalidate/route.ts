import { revalidateTags } from "@publira/next-cache-handlers/revalidate";
import type { NextRequest } from "next/server";

export const POST = (request: NextRequest) => revalidateTags(request);
