import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { firebaseConfig } from "./firebase-config.ts";

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"), { timeoutDuration: 8000 });

export async function verifyFirebaseToken(token: string, key: JWTVerifyGetKey = keys) {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["RS256"], issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    audience: firebaseConfig.projectId, requiredClaims: ["sub", "iat", "exp", "auth_time"], clockTolerance: 5,
  });
  if (!payload.sub || payload.sub.length > 128 || typeof payload.auth_time !== "number" || payload.auth_time > Date.now() / 1000 + 5 || typeof payload.iat !== "number" || payload.iat > Date.now() / 1000 + 5) throw new Error("Invalid Firebase identity");
  return { userId: `firebase:${payload.sub}` };
}
