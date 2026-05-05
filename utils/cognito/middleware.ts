import { jwtVerify, createRemoteJWKSet } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const REGION = process.env.COGNITO_REGION!;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!;

const COOKIE_ACCESS = "cognito_access_token";
const COOKIE_ID = "cognito_id_token";
const COOKIE_REFRESH = "cognito_refresh_token";

const JWKS = createRemoteJWKSet(
  new URL(
    `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  ),
);

/**
 * Compute Cognito SECRET_HASH using the Web Crypto API (Edge-compatible).
 */
async function computeSecretHash(username: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(username + CLIENT_ID));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function isValidToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    });
    return (payload as Record<string, unknown>)["client_id"] === CLIENT_ID;
  } catch {
    return false;
  }
}

async function tryRefresh(
  refreshToken: string,
  sub: string,
): Promise<{ accessToken: string; idToken: string } | null> {
  try {
    const secretHash = await computeSecretHash(sub);
    const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
      },
      body: JSON.stringify({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: secretHash,
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const at = data.AuthenticationResult?.AccessToken;
    const it = data.AuthenticationResult?.IdToken;
    if (!at || !it) return null;
    return { accessToken: at, idToken: it };
  } catch {
    return null;
  }
}

/**
 * Session guard middleware.
 * Verifies the Cognito access token cookie on each request.
 * Attempts a silent refresh when the token is expired.
 * Redirects to /login when no valid session exists.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });

  const accessToken = request.cookies.get(COOKIE_ACCESS)?.value;

  if (accessToken && (await isValidToken(accessToken))) {
    return response;
  }

  // Token missing or expired — try refresh
  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value;
  const idToken = request.cookies.get(COOKIE_ID)?.value;

  if (refreshToken && idToken) {
    let sub: string | undefined;
    try {
      const parts = idToken.split(".");
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      sub = payload.sub as string;
    } catch {
      // ignore
    }

    if (sub) {
      const refreshed = await tryRefresh(refreshToken, sub);
      if (refreshed) {
        const cookieOpts = {
          httpOnly: true,
          secure: true,
          sameSite: "lax" as const,
          path: "/",
        };
        response.cookies.set(COOKIE_ACCESS, refreshed.accessToken, cookieOpts);
        response.cookies.set(COOKIE_ID, refreshed.idToken, cookieOpts);
        return response;
      }
    }
  }

  // No valid session — redirect to login unless already on a public route
  const pathname = request.nextUrl.pathname;
  if (
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
