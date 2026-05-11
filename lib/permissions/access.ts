/**
 * Asset permission guard.
 *
 * Three-stage check — first match wins:
 *
 *   Stage 1 — Creator: the user who created the asset always has full access.
 *
 *   Stage 2 — Direct user grant: an explicit record in `asset_permissions`
 *             with subject_type "user" for this user on this asset.
 *
 *   Stage 3 — Cross-context project share: the asset is explicitly shared to a
 *             project the user belongs to (asset_permissions subject_type "project"),
 *             AND the user's Casbin role in that specific project allows the action.
 */
import { getDb } from "@/repository/mongodb/client";
import { checkRolePermission } from "./enforcer";
import {
  findUserAssetGrant,
  findProjectAssetGrants,
  upsertAssetPermission,
  deleteAssetPermission,
} from "@/repository/mongodb/models/asset-permission";

export type AssetAction = "read" | "write";

export interface UserRoleContext {
  userId: string;
  /** Project IDs the user is a member of */
  projectIds: string[];
  /** All domains the user belongs to, e.g. ["org:default", "project:abc"] */
  domains: string[];
}

async function checkStage2(assetId: string, userId: string, action: AssetAction): Promise<boolean> {
  const grant = await findUserAssetGrant(assetId, userId);
  if (!grant) return false;
  if (action === "read") return true;
  return ["owner", "editor", "write"].includes(grant.permission);
}

async function checkStage3(ctx: UserRoleContext, assetId: string, action: AssetAction): Promise<boolean> {
  if (ctx.projectIds.length === 0) return false;
  const grants = await findProjectAssetGrants(assetId, ctx.projectIds);
  if (grants.length === 0) return false;
  const domains = grants.map((g) => `project:${g.subject_id}`);
  return checkRolePermission(ctx.userId, domains, action);
}

export async function canAccessAsset(
  ctx: UserRoleContext,
  assetId: string,
  action: AssetAction
): Promise<boolean> {
  const db = await getDb();

  const asset = await db
    .collection<{ created_by: string }>("assets")
    .findOne({ _id: assetId }, { projection: { created_by: 1 } });

  if (!asset) return false;

  // Stage 1: creator always has full access
  if (asset.created_by === ctx.userId) return true;

  // Stage 2 → 3: first match wins
  return (
    (await checkStage2(assetId, ctx.userId, action)) ||
    (await checkStage3(ctx, assetId, action))
  );
}

/**
 * Grant explicit access to an asset for a user or project.
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
  await upsertAssetPermission({ assetId, subjectType, subjectId, permission, grantedBy, expiresAt });
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
  await deleteAssetPermission({ assetId, subjectType, subjectId });
}
