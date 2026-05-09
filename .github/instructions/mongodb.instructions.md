---
description: "Use when writing any MongoDB code: queries, inserts, updates, collection helpers, server actions, or data migrations. Covers schema sync with types/models.ts, _id conventions, and type-safe collection access."
applyTo: "**/*.ts"
---
# MongoDB Conventions

## `types/models.ts` is the single source of truth

Before writing any MongoDB code that touches a collection, check `types/models.ts` for the matching interface.

- If the interface **exists** — use it; do not redefine the shape inline or in another file.
- If the interface **does not exist** — add it to `types/models.ts` first, then write the code.
- If you are **changing a collection's shape** (adding/removing fields) — update the interface in `types/models.ts` at the same time as the code change.

```ts
// ✅ correct — import from the central source
import type { Asset, AssetVersion } from "@/types/models";

// ❌ wrong — local re-declaration
interface AssetVersion { _id: string; ... }
```

## `_id` is always a UUID string, never an ObjectId

All collections in this project use string UUIDs as `_id`. Never insert an ObjectId or rely on MongoDB's auto-generated `_id`.

```ts
// ✅ correct
await collection.insertOne({ _id: crypto.randomUUID(), ... });

// ❌ wrong — omitting _id lets MongoDB assign an ObjectId
await collection.insertOne({ asset_id: "...", ... });
```

When querying by `_id`, pass a plain string — never wrap it in `{ $oid: ... }`:

```ts
// ✅ correct
collection.findOne({ _id: assetId })

// ❌ wrong
collection.findOne({ _id: new ObjectId(assetId) })
```

## Type-safe collection access

Use the generic overload `db.collection<T>()` so TypeScript validates documents against the model interface:

```ts
import type { AssetVersion } from "@/types/models";

const col = db.collection<AssetVersion>("asset_versions");
await col.insertOne({ _id: crypto.randomUUID(), asset_id, version, storage_path, created_at });
```

When raw MongoDB drivers force `as any` (e.g. custom `_id` type conflicts), keep the cast local and minimal — cast only the collection reference, not the whole document.

## Keep interface and collection in sync

| Scenario | Required action |
|---|---|
| Adding a new collection | Add interface to `types/models.ts` before writing helpers |
| Adding a field to a collection | Add it to the interface first, then the insert/update code |
| Removing a field | Remove from interface and all queries simultaneously |
| Renaming a field | Update interface, all queries, and any existing MongoDB documents |

## Inline types in actions.ts are view-layer only

`app/**/actions.ts` files may define narrow view-layer types (e.g. `AssetVersion` with a resolved `signedUrl`) that are distinct from the raw MongoDB document shape. These should **not** duplicate fields that belong in `types/models.ts`. If in doubt, extend the model type rather than redefine it:

```ts
// ✅ extend for view-layer extras
import type { AssetVersion as AssetVersionDoc } from "@/types/models";
export type AssetVersion = AssetVersionDoc & { signedUrl: string };
```
