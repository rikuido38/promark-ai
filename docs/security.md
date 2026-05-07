# Asset Security & Permissions

This document describes how asset access control works in Promark AI — covering the Casbin RBAC policy layer, the MongoDB `asset_permissions` ACL, and how the two are combined in the four-stage permission check.

---

## Overview

Access control is a **hybrid** of two systems:

| Layer | Purpose | Storage |
|---|---|---|
| **Casbin RBAC** | Maps roles (`owner`, `editor`, `viewer`) to actions (`read`, `write`) per project | `casbin_rule` collection |
| **MongoDB ACL** | Records explicit grants of an asset to a user or project | `asset_permissions` collection |

Casbin handles *what a role can do*. MongoDB handles *who holds that role or explicit grant for a given asset*.

---

## Casbin Model

**File:** `lib/permissions/model.conf`

```ini
[request_definition]
r = sub, project, obj, act

[policy_definition]
p = sub, project, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.project) && (r.project == p.project || p.project == "*") && r.obj == p.obj && r.act == p.act
```

- `r.sub` — the requesting user, prefixed `user:{userId}`
- `r.project` — the project being checked, e.g. `project:abc`
- `r.obj` — always `"asset"` for asset checks
- `r.act` — `"read"` or `"write"`
- The `p.project == "*"` wildcard in the matcher means a single set of policy rows covers all projects. Per-project control is done exclusively via role assignments (`g` rules), not by duplicating `p` rules per project.

### Policy rules (`p`)

Five static rows seeded on first run (stored with `dom = "*"`):

| Role | Project | Object | Action | Effect |
|---|---|---|---|---|
| `owner` | `*` | `asset` | `read` | allow |
| `owner` | `*` | `asset` | `write` | allow |
| `editor` | `*` | `asset` | `read` | allow |
| `editor` | `*` | `asset` | `write` | allow |
| `viewer` | `*` | `asset` | `read` | allow |

### Role assignments (`g`)

Stored as `g` rules with three parts: `(user:userId, role, project)`.

```
g, user:4d105efb-..., owner, project:4f386161-...
```

Role assignments are created via `assignRole(userId, role, project)` and removed via `revokeRole(userId, role, project)` in `lib/permissions/enforcer.ts`.

### Project format

| Format | Example |
|---|---|
| `project:{projectId}` | `project:4f386161-aee9-41fc-981e-c0446c7610fe` |

---

## MongoDB Adapter

**File:** `lib/permissions/adapter.ts`

A custom `FilteredAdapter` implementation that reads and writes Casbin policies from the `casbin_rule` MongoDB collection. It was written to replace the incompatible `casbin-mongodb-adapter` package, which does not support MongoDB driver 7.x.

### `casbin_rule` document schema

```ts
{
  ptype: "p" | "g",
  v0?: string,   // p: role / g: user:userId
  v1?: string,   // p: project / g: role
  v2?: string,   // p: object / g: project
  v3?: string,   // p: action
  v4?: string,   // p: effect ("allow" | "deny")
  v5?: string,
}
```

---

## Asset Context & Ownership

Every asset has a `context` field that determines where it lives:

```ts
context: {
  type: "user" | "project" | "campaign",
  ref_id: string | null,   // userId | projectId | campaignId
}
```

- **`user`** — asset belongs to a single user's personal workspace
- **`project`** — asset belongs to a project; all project members have implicit access
- **`campaign`** — asset belongs to a campaign

---

## `asset_permissions` Collection

Explicit grants that extend access beyond the asset's context. Used for cross-context sharing (e.g. a user-owned asset shared into a project).

```ts
{
  _id: string,
  asset_id: string,
  subject_type: "user" | "project" | "org",
  subject_id: string,
  permission: "read" | "write" | "owner",
  granted_by: string,
  expires_at: string | null,   // ISO timestamp or null = never
  created_at: string,
}
```

---

## Four-Stage Access Check

**Function:** `canAccessAsset(ctx, assetId, action)` in `lib/permissions/access.ts`

The check is **first-match-wins** — as soon as one stage grants access, the remaining stages are skipped.

```
UserRoleContext = {
  userId: string,
  projectIds: string[],   // all projects the user is a member of
  domains: string[],      // e.g. ["project:abc"]
}
```

### Stage 1 — Creator

```
asset.created_by === ctx.userId  →  full access (read + write)
```

The user who created the asset always has unconditional access. No Casbin lookup needed.

---

### Stage 2 — Project membership (implicit)

```
asset.context.type === "project"
&& ctx.projectIds.includes(asset.context.ref_id)
→  checkRolePermission(userId, ["project:{ref_id}"], action)
```

If the asset *belongs to* a project the user is a member of, access is implicit — no `asset_permissions` row is required. The user's Casbin role in that project governs whether `read` or `write` is allowed.

---

### Stage 3 — Direct user grant

```
asset_permissions: { asset_id, subject_type: "user", subject_id: ctx.userId }
→  read: always allowed
→  write: allowed if permission ∈ ["owner", "editor", "write"]
```

An explicit row in `asset_permissions` granting this user access to this specific asset. Expiry is checked (`expires_at > now` or `null`).

---

### Stage 4 — Cross-context project share

```
asset_permissions: { asset_id, subject_type: "project", subject_id ∈ ctx.projectIds }
→  checkRolePermission(userId, ["project:{subject_id}", ...], action)
```

The asset has been explicitly shared to one or more projects the user belongs to. The user's Casbin role in *those specific projects* determines whether the action is allowed. This is the primary path for user-owned assets shared into a project.

---

## Sharing Rules

`grantAssetPermission()` enforces one hard rule:

> **User-owned assets (`context.type === "user"`) cannot be shared directly to another individual user. They must be shared to a project.**

This prevents ad-hoc user-to-user sharing outside of a project collaboration context.

```ts
// ✅ Allowed
grantAssetPermission({ assetId, subjectType: "project", subjectId: projectId, ... })

// ❌ Throws — user-owned asset cannot be shared to another user
grantAssetPermission({ assetId, subjectType: "user", subjectId: otherUserId, ... })
```

---

## Decision Flow Diagram

```
canAccessAsset(ctx, assetId, action)
│
├── [Stage 1] created_by === userId?
│       YES → ALLOW
│
├── [Stage 2] context.type === "project" && projectId ∈ ctx.projectIds?
│       YES → Casbin: enforce(user:userId, project:{ref_id}, asset, action)
│               ALLOW / DENY
│
├── [Stage 3] asset_permissions[subject_type=user, subject_id=userId] exists?
│       YES → read: ALLOW
│             write: ALLOW if permission ∈ {owner, editor, write}
│
├── [Stage 4] asset_permissions[subject_type=project, subject_id ∈ projectIds] exists?
│       YES → Casbin: enforce(user:userId, project:{grantedProjectId}, asset, action)
│               ALLOW / DENY
│
└── DENY
```

---

## Key Files

| File | Purpose |
|---|---|
| `lib/permissions/model.conf` | Casbin RBAC-with-project model |
| `lib/permissions/adapter.ts` | Custom MongoDB 7.x Casbin adapter |
| `lib/permissions/enforcer.ts` | Enforcer singleton, `assignRole`, `revokeRole`, `checkRolePermission` |
| `lib/permissions/access.ts` | `canAccessAsset`, `grantAssetPermission`, `revokeAssetPermission` |
| `lib/permissions/index.ts` | Barrel export |
| `utils/mongodb/assets.ts` | Asset + AssetVersion CRUD helpers |
| `utils/supabase/constant.ts` | MongoDB collection name constants |
