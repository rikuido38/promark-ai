import { NextResponse } from "next/server";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();

  const integration = await db
    .collection(COLLECTIONS.INTEGRATIONS)
    .findOne({ slug: "figma" });

  if (!integration) {
    return NextResponse.json(
      { error: "Figma integration not configured" },
      { status: 404 },
    );
  }

  const orgIntegration = await db
    .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
    .findOne({
      org_id: DEFAULT_ORG_ID,
      integration_id: integration._id,
      status: "enabled",
    });

  const creds = orgIntegration?.credentials as Record<string, unknown> | null;
  if (!creds?.client_id) {
    return NextResponse.json(
      { error: "Figma credentials not configured for this organization" },
      { status: 400 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/integrations/figma/callback`;

  const authUrl = new URL("https://www.figma.com/oauth");
  authUrl.searchParams.set("client_id", creds.client_id as string);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "projects:read library_assets:read library_content:read team_library_content:read");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  const cookieStore = await cookies();
  cookieStore.set("figma_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return NextResponse.json({ url: authUrl.toString() });
}
