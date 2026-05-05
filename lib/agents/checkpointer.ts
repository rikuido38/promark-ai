// ---------------------------------------------------------------------------
// LangGraph Checkpointer — MongoDB
//
// Replaces the Supabase PostgresSaver with a MongoDBSaver backed by the
// existing MongoDB cluster. Conversation history survives process restarts,
// serverless cold starts, and multi-instance deployments.
//
// Uses the same MONGODB_URL env var as the rest of the app.
// LangGraph checkpoint data is stored in the "checkpoints" collection inside
// the "promark-ai" database.
// ---------------------------------------------------------------------------

import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

let _checkpointer: MongoDBSaver | null = null;
let _client: MongoClient | null = null;

/**
 * Returns a singleton MongoDBSaver. Creates the LangGraph checkpoint
 * collections on the first call.
 */
export async function getCheckpointer(): Promise<MongoDBSaver> {
  if (_checkpointer) return _checkpointer;

  const connectionString = process.env.MONGODB_URL;
  if (!connectionString) {
    throw new Error(
      "MONGODB_URL is not set. Add your MongoDB connection string to .env.local.",
    );
  }

  _client = new MongoClient(connectionString);
  await _client.connect();

  const saver = new MongoDBSaver({ client: _client, dbName: "promark-ai" });

  // Patch putWrites to guard against the "Batch cannot be empty" MongoDB error
  // that occurs when LangGraph calls putWrites with an empty writes array.
  const originalPutWrites = saver.putWrites.bind(saver);
  saver.putWrites = async (config, writes, taskId) => {
    if (!writes || writes.length === 0) return;
    return originalPutWrites(config, writes, taskId);
  };

  _checkpointer = saver;
  return _checkpointer;
}
