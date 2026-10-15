// Google ID tokens from Google Identity Services, checked the way Novawerk's admin does
// (Novawerk/novawerk-workspace, apps/api/src/auth.ts): signature against Google's keys, our
// client id as audience, Google as issuer, unexpired, and a verified email.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
/** Google issues ID tokens under either spelling. */
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/** `sub` is Google's account id. We don't check `hd`: 聆镜 use personal Google accounts. */
export type GoogleVerifier = (idToken: string) => Promise<{ email: string; sub: string }>;

/** `keys` is injectable so the checks can be tested offline. */
export function googleVerifier(clientId: string, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))): GoogleVerifier {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, keys, { issuer: GOOGLE_ISSUERS, audience: clientId, algorithms: ["RS256"] });
    if (payload.email_verified !== true || typeof payload.email !== "string" || !payload.sub) throw new Error("no verified email");
    return { email: payload.email.trim().toLowerCase(), sub: payload.sub };
  };
}
