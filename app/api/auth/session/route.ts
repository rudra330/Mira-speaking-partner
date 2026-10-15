import { api, identity, database, json } from "@/lib/server";
import { browserToken, browserOwner } from "@/lib/browser-session";
import { env } from "@/lib/runtime-env";

export async function POST(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const legacyToken = browserToken(request);
    // Preserve this browser's existing anonymous history. Once claimed, a row
    // can never be claimed by another account through the same browser cookie.
    if (legacyToken && env.DB) await database().prepare("UPDATE conversations SET owner_id = ? WHERE owner_id = ?")
      .bind(user.userId, await browserOwner(legacyToken)).run();
    return json({ ready: true });
  });
}
