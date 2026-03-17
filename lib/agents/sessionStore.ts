import { MemorySession } from "@openai/agents";

/**
 * Process-level in-memory store mapping sessionId → MemorySession.
 *
 * This is intentionally simple: sessions live as long as the Next.js process
 * is running. Replace with a persistent store (Redis, DB) when needed without
 * changing any call sites — just swap the Map operations in getOrCreateSession.
 */
const store = new Map<string, MemorySession>();

/**
 * Returns the existing MemorySession for a given ID, or creates and registers
 * a new one if none exists yet.
 */
export function getOrCreateSession(sessionId: string): MemorySession {
  let session = store.get(sessionId);
  if (!session) {
    session = new MemorySession({ sessionId });
    store.set(sessionId, session);
  }
  return session;
}

/** Remove a session from the store (e.g. on logout or explicit reset). */
export function deleteSession(sessionId: string): void {
  store.delete(sessionId);
}

/** Total number of active in-memory sessions (useful for observability). */
export function activeSessionCount(): number {
  return store.size;
}
