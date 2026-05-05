// ---------------------------------------------------------------------------
// Session Store
//
// Lightweight process-level registry of active session IDs.
// Conversation history is persisted by the PostgresSaver checkpointer in
// lib/agents/checkpointer.ts — LangGraph manages the actual message state.
// This module only tracks which session IDs are known to this process
// (used for observability and explicit-deletion semantics).
// ---------------------------------------------------------------------------

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

/** Total number of active sessions tracked in this process. */
export function activeSessionCount(): number {
  return sessionIds.size;
}
