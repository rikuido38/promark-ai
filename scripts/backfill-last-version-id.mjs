/**
 * One-off backfill: for every asset that has no `last_version_id` set,
 * find its latest asset_version (by highest `version` number) and write
 * the version's _id back onto the asset as `last_version_id`.
 *
 * Safe to run multiple times — skips assets that already have the field.
 *
 * Usage:
 *   node scripts/backfill-last-version-id.mjs
 */
import { MongoClient } from "mongodb";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const client = new MongoClient(process.env.MONGODB_URL);

async function main() {
  await client.connect();
  const db = client.db("promark-ai");
  const assets = db.collection("assets");
  const versions = db.collection("asset_versions");

  // Find all assets missing last_version_id
  const missing = await assets
    .find({ last_version_id: { $exists: false } }, { projection: { _id: 1 } })
    .toArray();

  console.log(`Assets missing last_version_id: ${missing.length}`);
  if (missing.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const assetIds = missing.map((a) => a._id);

  // Aggregate: for each asset_id, get the doc with the highest version number
  const latestVersions = await versions
    .aggregate([
      { $match: { asset_id: { $in: assetIds } } },
      { $sort: { asset_id: 1, version: -1 } },
      { $group: { _id: "$asset_id", versionId: { $first: "$_id" } } },
    ])
    .toArray();

  console.log(`Versions found for ${latestVersions.length} of those assets.`);

  let updated = 0;
  for (const row of latestVersions) {
    await assets.updateOne(
      { _id: row._id },
      { $set: { last_version_id: row.versionId } },
    );
    updated++;
  }

  const noVersion = missing.length - latestVersions.length;
  console.log(`Updated: ${updated}  |  Assets with no versions at all: ${noVersion}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
