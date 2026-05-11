/**
 * Asset permission guard.
 *
 * Four-stage check — first match wins:
 *
 *   Stage 1 — Creator: the user who created the asset always has full access.
 *
 *   Stage 2 — Project membership (implicit): if the asset's context.type is
 *             "project" and context.ref_id is one of the user's projects, the
 *             user's Casbin role in THAT project determines access. No explicit
 *             asset_permissions record is needed — membership is sufficient.
 *
 *   Stage 3 — Direct user grant: an explicit record in `asset_permissions`
 *             with subject_type "user" for this user on this asset.
 *             (Only reachable for project/campaign assets shared to a specific
 *             user, or for the creator's own owner grant on user-owned assets.)
 *
 *   Stage 4 — Cross-context project share: the asset is explicitly shared to a
 *             project the user belongs to (asset_permissions subject_type "project"),
 *             AND the user's Casbin role in that specific project allows the action.
 *             This handles user-owned assets shared into a project.
 *
 * Sharing rule (enforced in grantAssetPermission):
 *   Assets with context.type "user" can only be shared to projects, never
 *   directly to other individual users.
 */
import { getDb } from "@/repository/mongodb/client";
import { checkRolePermission } from "./enforcer";

export type AssetAction = "read" | "write";

export interface UserRoleContext {
  userId: string;
  /** Project IDs the user is a member of */
  projectIds: string[];
  /** All domains the user belongs to, e.g. ["org:default", "project:abc"] */
  domains: string[];
}

export async function canAccessAsset(
  ctx: UserRoleContext,
  assetId: string,
  action: AssetAction
): Promise<boolean> {
  const db = await getDb();
  const now = new Date().toISOString();
  const notExpired = [
    { expires_at: null },
    { expires_at: { $exists: false } },
    { expires_at: { $gt: now } },
  ];

  // Fetch asset once — needed for Stages 1 and 2
  const asset = await db
    .collection<{ created_by: string; context: { type: string; ref_id: string | null } }>("assets")
    .findOne({ _id: assetId }, { projection: { created_by: 1, context: 1 } });

  if (!asset) return false;

  // Stage 1: creator always has full access
  if (asset.created_by === ctx.userId) return true;

  // Stage 2: asset BELONGS to a project the user is a member of
  // → access is implicit from project membership; role in that project governs read/write
  if (
    asset.context.type === "project" &&
    asset.context.ref_id &&
    ctx.projectIds.includes(asset.context.ref_id)
  ) {
    const projectDomain = `project:${asset.context.ref_id}`;
    const roleAllowed = await checkRolePermission(ctx.userId, [projectDomain], action);
    if (roleAllowed) return true;
  }

  // Stage 3: explicit direct user grant on this asset
  const userGrant = await db.collection("asset_permissions").findOne({
    asset_id: assetId,
    subject_type: "user",
    subject_id: ctx.userId,
    $or: notExpired,
  });
  if (userGrant) {
    const writable = ["owner", "editor", "write"];
    if (action === "read") return true;
    if (action === "write") return writable.includes(userGrant.permission as string);
  }

  // Stage 4: asset explicitly shared to a project the user belongs to (cross-context)
  if (ctx.projectIds.length > 0) {
    const projectGrants = await db
      .collection("asset_permissions")
      .find({
        asset_id: assetId,
        subject_type: "project",
        subject_id: { $in: ctx.projectIds },
        $or: notExpired,
      })
      .toArray();

    if (projectGrants.length > 0) {
      const grantedProjectDomains = projectGrants.map(
        (g) => `project:${g.subject_id as string}`
      );
      const roleAllowed = await checkRolePermission(
        ctx.userId,
        grantedProjectDomains,
        action
      );
      if (roleAllowed) return true;
    }
  }

  return false;
}

/**
 * Grant explicit access to an asset for a user or project.
 *
 * Sharing rule: assets with context.type "user" cannot be shared directly
 * to other users — they must be shared to a project.
 */
export async function grantAssetPermission({
  assetId,
  subjectType,
  subjectId,
  permission,
  grantedBy,
  expiresAt,
}: {
  assetId: string;
  subjectType: "user" | "project" | "org";
  subjectId: string;
  permission: "read" | "write" | "owner";
  grantedBy: string;
  expiresAt?: string | null;
}): Promise<void> {
  const db = await getDb();

  // Enforce sharing rule: user-owned assets cannot be shared to other users
  if (subjectType === "user" && subjectId !== grantedBy) {
    const asset = await db
      .collection<{ context: { type: string }; created_by: string }>("assets")
      .findOne({ _id: assetId }, { projection: { context: 1, created_by: 1 } });
    if (asset?.context?.type === "user") {
      throw new Error(
        "User-owned assets cannot be shared directly to another user. Share to a project instead."
      );
    }
  }

  await db.collection("asset_permissions").updateOne(
    { asset_id: assetId, subject_type: subjectType, subject_id: subjectId },
    {
      $set: {
        permission,
        granted_by: grantedBy,
        expires_at: expiresAt ?? null,
        updated_at: new Date().toISOString(),
      },
      $setOnInsert: {
        asset_id: assetId,
        subject_type: subjectType,
        subject_id: subjectId,
        created_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

/** Revoke explicit access to an asset. */
export async function revokeAssetPermission({
  assetId,
  subjectType,
  subjectId,
}: {
  assetId: string;
  subjectType: "user" | "project" | "org";
  subjectId: string;
}): Promise<void> {
  const db = await getDb();
  await db.collection("asset_permissions").deleteOne({
    asset_id: assetId,
    subject_type: subjectType,
    subject_id: subjectId,
  });
}

}
