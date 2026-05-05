import { NextResponse } from "next/server";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { cookies } from "next/headers";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("figma_oauth_state")?.value;

  // Always clear the state cookie
  cookieStore.delete("figma_oauth_state");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_auth_denied`,
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_invalid_state`,
    );
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const db = await getDb();

  const integration = await db
    .collection(COLLECTIONS.INTEGRATIONS)
    .findOne({ slug: "figma" });

  if (!integration) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_not_found`,
    );
  }

  const orgIntegration = await db
    .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
    .findOne({ org_id: DEFAULT_ORG_ID, integration_id: integration._id });

  const creds = orgIntegration?.credentials as Record<string, unknown> | null;
  if (!creds?.client_id || !creds?.client_secret) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_credentials_missing`,
    );
  }

  const redirectUri = `${origin}/api/integrations/figma/callback`;

  const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id as string,
      client_secret: creds.client_secret as string,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Figma token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_token_exchange_failed`,
    );
  }

  const tokenData = (await tokenRes.json()) as Record<string, unknown>;

  try {
    await db.collection(COLLECTIONS.USER_INTEGRATIONS).updateOne(
      { user_id: user.id, integration_id: integration._id },
      {
        $set: {
          user_id: user.id,
          org_id: DEFAULT_ORG_ID,
          integration_id: integration._id,
          status: "connected",
          credentials: tokenData,
          updated_at: new Date().toISOString(),
        },
        $setOnInsert: { created_at: new Date().toISOString() },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error("Failed to store Figma credentials:", err);
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=figma_store_failed`,
    );
  }

  return NextResponse.redirect(`${origin}/?connected=figma`);
}
