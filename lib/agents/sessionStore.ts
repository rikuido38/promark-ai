import { MemorySaver } from "@langchain/langgraph";

/**
 * Shared MemorySaver instance used as the LangGraph checkpointer.
 *
 * A single instance is shared across all agent runs so that conversation
 * history is retained per thread_id across multiple turns. Replace with a
 * persistent checkpointer (e.g. PostgresSaver, RedisSaver) when needed
 * without changing any call sites — just swap this export.
 */
export const memorySaver = new MemorySaver();

/**
 * Process-level set of known session IDs.
 *
 * LangGraph manages actual message history via the checkpointer; this set is
 * kept only for counting and explicit-deletion semantics.
 */
const sessionIds = new Set<string>();

/**
 * Registers a session ID if not already known and returns it.
 * Call this once per conversation turn before invoking the agent.
 */
export function getOrCreateSession(sessionId: string): string {
  sessionIds.add(sessionId);
  return sessionId;
}

/** Remove a session from the store (e.g. on logout or explicit reset). */
export function deleteSession(sessionId: string): void {
  sessionIds.delete(sessionId);
}

/** Total number of active in-memory sessions (useful for observability). */
export function activeSessionCount(): number {
  return sessionIds.size;
}
