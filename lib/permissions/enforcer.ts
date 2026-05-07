/**
 * Casbin enforcer singleton.
 * Uses a custom MongoDB adapter (compatible with MongoDB driver 7.x).
 *
 * Roles (per domain):
 *   owner   — read + write + share
 *   editor  — read + write
 *   viewer  — read only
 *
 * Domain format:
 *   org:ORG_ID      e.g.  org:default
 *   project:PROJ_ID e.g.  project:4f386161-...
 */
import { newEnforcer, Enforcer } from "casbin";
import path from "node:path";
import { MongoAdapter } from "./adapter";
import { getDb } from "@/utils/mongodb/client";

type AssetAction = "read" | "write";
type AssetRole = "owner" | "editor" | "viewer";

const MODEL_PATH = path.join(process.cwd(), "lib/permissions/model.conf");

// Singleton cache (reused across Next.js hot-reload in dev via globalThis)
const globalWithEnforcer = globalThis as typeof globalThis & {
  _casbinEnforcer?: Enforcer;
};

async function buildEnforcer(): Promise<Enforcer> {
  const adapter = new MongoAdapter();
  const enforcer = await newEnforcer(MODEL_PATH, adapter);

  // Seed role → permission policies if the collection is empty.
  // Using "*" as the domain so one set of policies covers all org/project domains.
  // Per-project control is handled entirely by role assignments (g rules).
  const allPolicies = await enforcer.getPolicy();
  if (allPolicies.length === 0) {
    await enforcer.addPolicies([
      ["owner",  "*", "asset", "read",  "allow"],
      ["owner",  "*", "asset", "write", "allow"],
      ["editor", "*", "asset", "read",  "allow"],
      ["editor", "*", "asset", "write", "allow"],
      ["viewer", "*", "asset", "read",  "allow"],
    ]);
  }

  return enforcer;
}

export async function getEnforcer(): Promise<Enforcer> {
  if (process.env.NODE_ENV === "development") {
    globalWithEnforcer._casbinEnforcer ??= await buildEnforcer();
    return globalWithEnforcer._casbinEnforcer;
  }
  return buildEnforcer();
}

// ---------------------------------------------------------------------------
// Role management helpers
// ---------------------------------------------------------------------------

/** Assign a role to a user within a project. Also syncs project_users.role. */
export async function assignRole(
  userId: string,
  role: AssetRole,
  domain: string
): Promise<void> {
  const enforcer = await getEnforcer();
  await enforcer.addRoleForUser(`user:${userId}`, role, domain);

  // Sync project_users.role if this is a project domain
  if (domain.startsWith("project:")) {
    const projectId = domain.slice("project:".length);
    const db = await getDb();
    await db.collection("project_users").updateOne(
      { user_id: userId, project_id: projectId },
      { $set: { role } },
      { upsert: false }
    );
  }
}

/** Remove a user's role within a project. Clears project_users.role. */
export async function revokeRole(
  userId: string,
  role: AssetRole,
  domain: string
): Promise<void> {
  const enforcer = await getEnforcer();
  await enforcer.deleteRoleForUser(`user:${userId}`, role, domain);

  // Clear project_users.role if this is a project domain
  if (domain.startsWith("project:")) {
    const projectId = domain.slice("project:".length);
    const db = await getDb();
    await db.collection("project_users").updateOne(
      { user_id: userId, project_id: projectId },
      { $unset: { role: "" } }
    );
  }
}

/** Get all roles a user holds across all domains. */
export async function getUserRoles(
  userId: string
): Promise<{ role: string; domain: string }[]> {
  const enforcer = await getEnforcer();
  const roles = await enforcer.getRolesForUserInDomain(`user:${userId}`, "*");
  return roles.map((r) => {
    const [role, domain] = r.split(":");
    return { role, domain };
  });
}

// ---------------------------------------------------------------------------
// Permission check
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's Casbin role in any of the given domains permits
 * the action. Policies are stored with domain "*" so one policy set covers all
 * org/project domains — the matcher resolves wildcards automatically.
 */
export async function checkRolePermission(
  userId: string,
  domains: string[],
  action: AssetAction
): Promise<boolean> {
  const enforcer = await getEnforcer();
  for (const domain of domains) {
    const allowed = await enforcer.enforce(`user:${userId}`, domain, "asset", action);
    if (allowed) return true;
  }
  return false;
}
