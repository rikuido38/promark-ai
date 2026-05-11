"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUser } from "@/utils/cognito/auth";
import { getDb } from "@/repository/mongodb/client";
import { getOrganizationMembership, upsertOrganizationUser, removeOrganizationUser } from "@/repository/mongodb/models/organization-user";
import { COLLECTIONS } from "@/utils/supabase/constant";
import { DEFAULT_ORG_ID, SUPABASE_BUCKET_NAME } from "@/utils/constants";
import { createStorageClient } from "@/utils/s3/storage";
import { resolveSignedUrl } from "@/lib/storage";
import { ORG_COOKIE_NAME } from "@/hooks/use-active-org";
import type { UserProfile } from "@/types/models";
import type { OrgMember } from "@/components/ui/org/org-member-panel";

interface UserProfileDoc {
  _id: unknown;
  name?: string;
  email?: string;
  avatar_url?: string | null;
}

async function getActiveOrgId(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(ORG_COOKIE_NAME)?.value ?? DEFAULT_ORG_ID;
}

async function requireOwner(orgId: string) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  const membership = await getOrganizationMembership(user.id, orgId);
  if (!membership?.is_owner) throw new Error("Forbidden");
  return user;
}

export async function getOrgGeneralData(): Promise<{
  orgId: string;
  name: string;
  logo_path: string | null;
  logo_url: string | null;
  members: OrgMember[];
  currentUserId: string;
}> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const orgId = await getActiveOrgId();
  const db = await getDb();

  const [org, orgUsers, profiles] = await Promise.all([
    db.collection(COLLECTIONS.ORGANIZATIONS).findOne(
      { _id: orgId } as unknown as import("mongodb").Filter<import("mongodb").Document>,
      { projection: { name: 1, logo_url: 1 } }
    ),
    db.collection("organization_users").find({ org_id: orgId }).toArray(),
    db.collection<UserProfileDoc>("user_profiles")
      .find({})
      .toArray(),
  ]);

  const profileMap = new Map(profiles.map((p) => [p._id as string, p]));

  const members: OrgMember[] = orgUsers.map((u) => {
    const profile = profileMap.get(u.user_id as string);
    return {
      id: u.user_id as string,
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      avatar_url: profile?.avatar_url ?? null,
      is_owner: u.is_owner as boolean,
    };
  });

  const rawLogoPath = (org?.logo_url as string | null) ?? null;
  const logoSignedUrl = (await resolveSignedUrl(createStorageClient(), rawLogoPath, SUPABASE_BUCKET_NAME)) ?? null;

  return {
    orgId,
    name: (org?.name as string) ?? "",
    logo_path: rawLogoPath,
    logo_url: logoSignedUrl,
    members,
    currentUserId: user.id,
  };
}

export async function saveOrgGeneralSettings(name: string, logo_url?: string | null): Promise<void> {
  const orgId = await getActiveOrgId();
  await requireOwner(orgId);

  const db = await getDb();
  const fields: Record<string, unknown> = { name: name.trim(), updated_at: new Date().toISOString() };
  if (logo_url !== undefined) fields.logo_url = logo_url;
  await db.collection(COLLECTIONS.ORGANIZATIONS).updateOne(
    { _id: orgId } as unknown as import("mongodb").Filter<import("mongodb").Document>,
    { $set: fields }
  );

  revalidatePath("/orgs/settings/general");
}

export async function uploadOrgLogo(formData: FormData): Promise<string> {
  const orgId = await getActiveOrgId();
  await requireOwner(orgId);

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const fileExt = file.name.split(".").pop();
  const filePath = `${orgId}/images/${crypto.randomUUID()}.${fileExt}`;
  const storage = createStorageClient();

  const db = await getDb();
  const orgData = await db
    .collection(COLLECTIONS.ORGANIZATIONS)
    .findOne(
      { _id: orgId } as unknown as import("mongodb").Filter<import("mongodb").Document>,
      { projection: { logo_url: 1 } }
    );

  if (orgData?.logo_url && !(orgData.logo_url as string).startsWith("http")) {
    await storage.storage.from(SUPABASE_BUCKET_NAME).remove([orgData.logo_url as string]);
  }

  const { error } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: true });

  if (error) throw new Error("Failed to upload logo");

  const { data: signedUrlData, error: signedUrlError } = await storage.storage
    .from(SUPABASE_BUCKET_NAME)
    .createSignedUrl(filePath, 3600);

  if (signedUrlError || !signedUrlData) throw new Error("Failed to generate signed URL");

  return JSON.stringify({ signedUrl: signedUrlData.signedUrl, path: filePath });
}

export async function setOrgMemberAsOwner(userId: string): Promise<void> {
  const orgId = await getActiveOrgId();
  await requireOwner(orgId);
  await upsertOrganizationUser(orgId, userId, true);
  revalidatePath("/orgs/settings/general");
}

export async function searchUsersForOrg(query: string): Promise<UserProfile[]> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  if (!query || query.trim().length < 2) return [];

  const db = await getDb();
  const docs = await db
    .collection<{ _id: string; name?: string; email?: string; avatar_url?: string | null }>("user_profiles")
    .find({
      _id: { $ne: user.id } as unknown as string,
      $or: [
        { name: { $regex: query.trim(), $options: "i" } },
        { email: { $regex: query.trim(), $options: "i" } },
      ],
    })
    .limit(10)
    .toArray();

  return docs.map((d) => ({
    id: d._id,
    name: d.name ?? "",
    email: d.email ?? "",
    avatar_url: d.avatar_url ?? null,
  }));
}

export async function addOrgMembers(userIds: string[]): Promise<void> {
  const orgId = await getActiveOrgId();
  await requireOwner(orgId);

  await Promise.all(userIds.map((uid) => upsertOrganizationUser(orgId, uid, false)));
  revalidatePath("/orgs/settings/general");
}

export async function removeOrgMember(userId: string): Promise<void> {
  const orgId = await getActiveOrgId();
  await requireOwner(orgId);
  await removeOrganizationUser(orgId, userId);
  revalidatePath("/orgs/settings/general");
}
