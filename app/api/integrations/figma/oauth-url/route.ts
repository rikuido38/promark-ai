import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { TABLES } from "@/utils/supabase/constant";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { cookies } from "next/headers";
import crypto from "node:crypto";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: integration } = await supabase
    .from(TABLES.INTEGRATIONS)
    .select("id")
    .eq("slug", "figma")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      { error: "Figma integration not configured" },
      { status: 404 },
    );
  }

  const { data: orgIntegration } = await supabase
    .from(TABLES.ORGANIZATION_INTEGRATIONS)
    .select("credentials")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("integration_id", integration.id)
    .eq("status", "enabled")
    .maybeSingle();

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
