import { MongoClient, Db } from "mongodb";

const MONGODB_URL = process.env.MONGODB_URL!;
const DB_NAME = "promark-ai";

if (!MONGODB_URL) {
  throw new Error("MONGODB_URL environment variable is not set");
}

// In development, reuse the connection across hot reloads via the global object.
// In production, a module-level singleton is safe.
const globalWithMongo = global as typeof globalThis & {
  _mongoClient?: MongoClient;
};

let client: MongoClient;

if (process.env.NODE_ENV === "development") {
  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(MONGODB_URL);
  }
  client = globalWithMongo._mongoClient;
} else {
  client = new MongoClient(MONGODB_URL);
}

export async function getDb(): Promise<Db> {
  await client.connect();
  return client.db(DB_NAME);
}
