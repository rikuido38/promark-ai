"use server";

import { DEFAULT_ORG_ID } from "@/utils/constants";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { revalidatePath } from "next/cache";
import type { OrgIntegrationCredentials, ConnectedTool } from "@/types/models";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/utils/mongodb/client";


export async function getIntegrations() {
  const db = await getDb();

  const integrations = await db
    .collection(COLLECTIONS.INTEGRATIONS)
    .find()
    .sort({ name: 1 })
    .toArray();

  const orgIntegrations = await db
    .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
    .find({ org_id: DEFAULT_ORG_ID })
    .toArray();

  // Fetch tags for each integration via integration_tags
  const integrationIds = integrations.map((i) => i._id);
  const integrationTags = await db
    .collection(COLLECTIONS.INTEGRATION_TAGS)
    .find({ integration_id: { $in: integrationIds } })
    .toArray();

  const tagIds = integrationTags.map((it) => it.tag_id);
  const tags = await db
    .collection(COLLECTIONS.TAGS)
    .find({ _id: { $in: tagIds } })
    .toArray();
  const tagMap = new Map(tags.map((t) => [t._id as string, t.name as string]));

  const mappedIntegrations = integrations.map((integration: any) => {
    const orgConnection = orgIntegrations.find(
      (oi) => oi.integration_id === (integration._id as string),
    );
    const tagNames = integrationTags
      .filter((it) => it.integration_id === (integration._id as string))
      .map((it) => tagMap.get(it.tag_id) ?? "");

    return {
      ...integration,
      id: integration._id,
      tags: tagNames,
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
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  if (connect) {
    await db.collection(COLLECTIONS.USER_INTEGRATIONS).updateOne(
      { user_id: user.id, integration_id: integrationId },
      {
        $set: {
          user_id: user.id,
          org_id: DEFAULT_ORG_ID,
          integration_id: integrationId,
          status: "connected",
          credentials: {},
        },
      },
      { upsert: true },
    );
  } else {
    await db
      .collection(COLLECTIONS.USER_INTEGRATIONS)
      .deleteOne({ user_id: user.id, integration_id: integrationId });
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function toggleOrgIntegration(
  integrationId: string,
  enabled: boolean,
) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  if (enabled) {
    await db.collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS).updateOne(
      { org_id: DEFAULT_ORG_ID, integration_id: integrationId },
      {
        $set: {
          org_id: DEFAULT_ORG_ID,
          integration_id: integrationId,
          status: "enabled",
        },
      },
      { upsert: true },
    );
  } else {
    await db
      .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
      .deleteOne({ org_id: DEFAULT_ORG_ID, integration_id: integrationId });
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function updateOrgIntegrationCredentials(
  integrationId: string,
  credentials: OrgIntegrationCredentials,
) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  await db.collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS).updateOne(
    { org_id: DEFAULT_ORG_ID, integration_id: integrationId },
    {
      $set: { credentials },
      $setOnInsert: {
        org_id: DEFAULT_ORG_ID,
        integration_id: integrationId,
        status: "enabled",
      },
    },
    { upsert: true },
  );

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function getConnectedUserTools(): Promise<ConnectedTool[]> {
  const user = await getUser();
  const db = await getDb();

  const orgRows = await db
    .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
    .find({ org_id: DEFAULT_ORG_ID, status: "enabled" })
    .toArray();

  if (!orgRows || orgRows.length === 0) return [];

  const integrationIds = orgRows.map((r) => r.integration_id);
  const integrationDocs = await db
    .collection(COLLECTIONS.INTEGRATIONS)
    .find({ _id: { $in: integrationIds } })
    .toArray();
  const integrationMap = new Map(
    integrationDocs.map((i) => [i._id as string, i]),
  );

  const userConnectedIds = new Set<string>();
  if (user) {
    const userRows = await db
      .collection(COLLECTIONS.USER_INTEGRATIONS)
      .find({ user_id: user.id, status: "connected" })
      .toArray();
    userRows.forEach((r) => userConnectedIds.add(r.integration_id));
  }

  return orgRows
    .map((row) => {
      const integration = integrationMap.get(row.integration_id);
      if (!integration) return null;
      return {
        id: integration._id as string,
        name: integration.name as string,
        slug: integration.slug as string,
        logo_url: (integration.logo_url as string | null) ?? null,
        userConnected: userConnectedIds.has(row.integration_id),
      };
    })
    .filter((t): t is ConnectedTool => t !== null);
}


export async function getOrgIntegrationCredentials(
  integrationId: string,
): Promise<OrgIntegrationCredentials | null> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = await getDb();

  const doc = await db
    .collection(COLLECTIONS.ORGANIZATION_INTEGRATIONS)
    .findOne(
      { org_id: DEFAULT_ORG_ID, integration_id: integrationId },
      { projection: { credentials: 1 } },
    );

  return (doc?.credentials as OrgIntegrationCredentials | null) ?? null;
}
