"use server";

import { createClient } from "@/utils/supabase/server";
import { DEFAULT_ORG_ID } from "@/utils/constants";
import { TABLES } from "@/utils/supabase/constant";
import { revalidatePath } from "next/cache";
import type { OrgIntegrationCredentials, ConnectedTool } from "@/types/models";


export async function getIntegrations() {
  const supabase = await createClient();

  // Admin check could go here if needed, but for now we follow the user's lead

  const { data: integrations, error: integrationsError } = await supabase
    .from(TABLES.INTEGRATIONS)
    .select(
      `
      *,
      integration_tags(tags(name))
    `,
    )
    .order("name", { ascending: true });

  const { data: orgIntegrations, error: orgError } = await supabase
    .from(TABLES.ORGANIZATION_INTEGRATIONS)
    .select("*")
    .eq("org_id", DEFAULT_ORG_ID);


  if (integrationsError)
    console.error("Error fetching integrations", integrationsError);
  if (orgError) console.error("Error fetching org integrations", orgError);

  const mappedIntegrations = (integrations || []).map((integration: any) => {
    const orgConnection = orgIntegrations?.find(
      (oi) => oi.integration_id === integration.id,
    );

    return {
      ...integration,
      tags: integration.integration_tags.map((it: any) => it.tags.name),
      orgStatus: orgConnection?.status || "disabled",
      orgCredentials: orgConnection?.credentials || null,
    };
  });

  return mappedIntegrations;
}

export async function toggleUserIntegration(
  integrationId: string,
  connect: boolean,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (connect) {
    const { error } = await supabase.from(TABLES.USER_INTEGRATIONS).upsert(
      {
        user_id: user.id,
        org_id: DEFAULT_ORG_ID,
        integration_id: integrationId,
        status: "connected",
        credentials: {}, // This would normally happen via OAuth/Figma logic
      },
      { onConflict: "user_id, integration_id" },
    );

    if (error) {
      console.error(error);
      throw new Error("Failed to connect integration");
    }
  } else {
    const { error } = await supabase
      .from(TABLES.USER_INTEGRATIONS)
      .delete()
      .eq("user_id", user.id)
      .eq("integration_id", integrationId);

    if (error) {
      console.error(error);
      throw new Error("Failed to disconnect integration");
    }
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function toggleOrgIntegration(
  integrationId: string,
  enabled: boolean,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (enabled) {
    const { error } = await supabase
      .from(TABLES.ORGANIZATION_INTEGRATIONS)
      .upsert(
        {
          org_id: DEFAULT_ORG_ID,
          integration_id: integrationId,
          status: "enabled",
        },
        { onConflict: "org_id, integration_id" },
      );

    if (error) throw new Error("Failed to enable integration for organization");
  } else {
    const { error } = await supabase
      .from(TABLES.ORGANIZATION_INTEGRATIONS)
      .delete()
      .eq("org_id", DEFAULT_ORG_ID)
      .eq("integration_id", integrationId);

    if (error)
      throw new Error("Failed to disable integration for organization");
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function updateOrgIntegrationCredentials(
  integrationId: string,
  credentials: OrgIntegrationCredentials,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data: existingOrgIntegration, error: existingError } = await supabase
    .from(TABLES.ORGANIZATION_INTEGRATIONS)
    .select("id, status")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (existingError) {
    throw new Error("Failed to load organization integration");
  }

  if (existingOrgIntegration) {
    const { error: updateError } = await supabase
      .from(TABLES.ORGANIZATION_INTEGRATIONS)
      .update({ credentials })
      .eq("id", existingOrgIntegration.id);

    if (updateError) {
      throw new Error("Failed to update credentials");
    }
  } else {
    const { error: insertError } = await supabase
      .from(TABLES.ORGANIZATION_INTEGRATIONS)
      .insert({
        org_id: DEFAULT_ORG_ID,
        integration_id: integrationId,
        status: "enabled",
        credentials,
      });

    if (insertError) {
      throw new Error("Failed to save credentials");
    }
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

interface OrgIntegrationJoinRow {
  integration_id: string;
  integrations: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
}

export async function getConnectedUserTools(): Promise<ConnectedTool[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orgRows } = await supabase
    .from(TABLES.ORGANIZATION_INTEGRATIONS)
    .select("integration_id, integrations(id, name, slug, logo_url)")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("status", "enabled");

  if (!orgRows || orgRows.length === 0) return [];

  const userConnectedIds = new Set<string>();
  if (user) {
    const { data: userRows } = await supabase
      .from(TABLES.USER_INTEGRATIONS)
      .select("integration_id")
      .eq("user_id", user.id)
      .eq("status", "connected");
    userRows?.forEach((r) => userConnectedIds.add(r.integration_id));
  }

  return (orgRows as unknown as OrgIntegrationJoinRow[])
    .map((row) => {
      const integration = row.integrations;
      if (!integration) return null;
      return {
        ...integration,
        userConnected: userConnectedIds.has(row.integration_id),
      };
    })
    .filter((t): t is ConnectedTool => t !== null);
}

export async function getOrgIntegrationCredentials(
  integrationId: string,
): Promise<OrgIntegrationCredentials | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from(TABLES.ORGANIZATION_INTEGRATIONS)
    .select("credentials")
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to fetch integration credentials");
  }

  return (data?.credentials as OrgIntegrationCredentials | null) ?? null;
}
