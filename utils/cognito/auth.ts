import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  UpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHmac } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";

// ── Config ────────────────────────────────────────────────────────────────────

const REGION = process.env.COGNITO_REGION!;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!;

const COOKIE_ACCESS = "cognito_access_token";
const COOKIE_ID = "cognito_id_token";
const COOKIE_REFRESH = "cognito_refresh_token";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CognitoUser {
  /** Cognito sub — permanent user identifier, used as `id` throughout the app. */
  id: string;
  sub: string;
  email: string;
  name?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cognito(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: REGION });
}

function computeSecretHash(username: string): string {
  return createHmac("sha256", CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest("base64");
}

const JWKS = createRemoteJWKSet(
  new URL(
    `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  ),
);

async function verifyAccessToken(token: string): Promise<CognitoUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
      // Cognito access tokens carry `client_id`, not `aud` — skip audience check here
    });

    // Validate client_id manually since access tokens don't have an `aud` claim
    if ((payload as Record<string, unknown>)["client_id"] !== CLIENT_ID) return null;

    const sub = payload.sub as string;
    const email = (payload.email ?? payload["cognito:username"] ?? "") as string;
    const name = payload.name as string | undefined;

    return { id: sub, sub, email, name };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sign in with email/password. Sets HTTP-only cookies on success.
 * Returns the user on success, or throws on failure.
 */
export async function signIn(email: string, password: string): Promise<CognitoUser> {
  const result = await cognito().send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: computeSecretHash(email),
      },
    }),
  );

  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
    throw new Error("Authentication failed: missing tokens");
  }

  const cookieStore = await cookies();
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
  cookieStore.set(COOKIE_ACCESS, auth.AccessToken, cookieOpts);
  cookieStore.set(COOKIE_ID, auth.IdToken, cookieOpts);
  cookieStore.set(COOKIE_REFRESH, auth.RefreshToken, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });

  const user = await verifyAccessToken(auth.AccessToken);
  if (!user) throw new Error("Failed to decode token after sign-in");
  return user;
}

/**
 * Sign out the current user. Clears cookies and revokes the access token.
 */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_ACCESS)?.value;

  if (accessToken) {
    try {
      await cognito().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch {
      // Ignore revocation errors — always clear cookies
    }
  }

  cookieStore.delete(COOKIE_ACCESS);
  cookieStore.delete(COOKIE_ID);
  cookieStore.delete(COOKIE_REFRESH);
}

/**
 * Get the currently authenticated user from cookies (Server Components / Actions).
 * Returns null if no valid session exists.
 * Token refresh is handled by middleware — this function is read-only.
 */
export async function getUser(): Promise<CognitoUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_ACCESS)?.value;
  if (!accessToken) return null;

  return verifyAccessToken(accessToken);
}

/**
 * Update Cognito user attributes. Requires a valid access token.
 */
export async function updateUserAttributes(
  attributes: Array<{ Name: string; Value: string }>,
): Promise<void> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_ACCESS)?.value;
  if (!accessToken) throw new Error("Unauthorized");

  await cognito().send(
    new UpdateUserAttributesCommand({
      AccessToken: accessToken,
      UserAttributes: attributes,
    }),
  );
}

export { COOKIE_ACCESS, COOKIE_ID, COOKIE_REFRESH };
