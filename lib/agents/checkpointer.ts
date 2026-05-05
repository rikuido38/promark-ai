// ---------------------------------------------------------------------------
// LangGraph Checkpointer — Supabase Postgres
//
// Replaces the in-memory MemorySaver with a persistent PostgresSaver backed
// by the Supabase Postgres database. Conversation history survives process
// restarts, serverless cold starts, and multi-instance deployments.
//
// Required environment variable:
//   DATABASE_URL — Supabase session-pooler or direct connection string.
//   Format: postgresql://postgres.[ref]:[password]@[host]:5432/postgres
//   ⚠  Use the Session Pooler (port 5432), NOT the Transaction Pooler
//      (port 6543), because pg.Pool uses persistent connections that are
//      incompatible with PgBouncer transaction mode.
//
// The setup() call creates the required LangGraph tables on first run:
//   checkpoints, checkpoint_blobs, checkpoint_writes
// Subsequent calls are no-ops once the tables exist.
// ---------------------------------------------------------------------------

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let _checkpointer: PostgresSaver | null = null;

/**
 * Returns a singleton PostgresSaver. Creates the LangGraph checkpoint tables
 * on the first call. Thread-safe within a single process; multiple serverless
 * instances each maintain their own pool (this is expected and harmless).
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (_checkpointer) return _checkpointer;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Supabase session-pooler connection string to .env.local.",
    );
  }

  const saver = PostgresSaver.fromConnString(connectionString);
  await saver.setup();
  _checkpointer = saver;
  return _checkpointer;
}
