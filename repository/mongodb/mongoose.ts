/**
 * Shared Mongoose connection for Next.js.
 * Caches the connection via globalThis to survive hot-reloads in development.
 */
import mongoose from "mongoose";

const MONGODB_URL = process.env.MONGODB_URL!;
const DB_NAME = "promark-ai";

if (!MONGODB_URL) {
  throw new Error("MONGODB_URL environment variable is not set");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  _mongoose?: MongooseCache;
};

if (!globalWithMongoose._mongoose) {
  globalWithMongoose._mongoose = { conn: null, promise: null };
}

const cached = globalWithMongoose._mongoose;

export async function connectMongoose(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URL, { dbName: DB_NAME });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
