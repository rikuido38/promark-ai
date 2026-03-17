# Agent Workflow Design

## Overview

The AI system is built around a **Main Orchestrator Agent** that is the only agent visible to the end user. Specialized agents in `lib/agents/` are invisible — the user only knows there is a single AI assistant understanding their request, session, state, and memory.

```
User Request
    ↓
Main Orchestrator Agent
    ↓ enriches with session, state, memory
Intent Router
    ↓              ↓              ↓
Agentic Loop   Pipeline       Direct Agent
(LLM plans    (dev-defined   (single specialist,
 dynamically)  steps)         returns immediately)
```

---

## Context Object

The orchestrator enriches every request before dispatching downstream. Each agent receives only what it needs:

```ts
interface AgentContext {
  session: Message[]          // conversation history (trimmed)
  state: Record<string, any>  // current structured data (brand, campaign, etc.)
  memory: MemorySnapshot      // long-term knowledge relevant to the task
  task: string                // the specific instruction for this agent
}
```

---

## Intent Router

The router is a first-class concept that classifies intent and returns a `RoutingDecision` before any downstream work begins.

```ts
type RouteMode = 'agentic' | 'pipeline' | 'direct'

interface RoutingDecision {
  mode: RouteMode
  target?: string   // pipeline ID or agent ID (for modes: pipeline, direct)
  confidence: number
}
```

### Router strategy (hybrid)

1. **Rule-based** — pattern matching on intent keywords (fast, predictable, zero LLM cost)
2. **LLM classifier** — a cheap, small model call just to classify if no rule matches
3. Falls back to `agentic` mode when classification is ambiguous

---

## Workflow 1 — Agentic Loop

Used for: open-ended, ambiguous, or multi-step tasks where the path isn't known in advance.

The orchestrator uses LLM reasoning to plan dynamically. To prevent hallucinated workflows, it selects only from the **Agent Registry** — a closed set of known agents and their capabilities.

```ts
// lib/agents/registry.ts
const AGENT_REGISTRY = [
  {
    id: 'brand-illustration',
    description: 'Generates brand illustrations from a prompt and brand DNA',
    mode: 'direct',
  },
  {
    id: 'brand-context',
    description: 'Compiles brand DNA into a structured LLM context object',
    mode: 'pipeline',
  },
  // ...
]
```

The LLM selects agents from this registry and chains them as needed. It does not invent new agents.

---

## Workflow 2 — Pipeline (Deterministic)

Used for: known, structured, multi-step workflows defined by the developer.

The developer defines the steps in code as a DAG or sequential pipeline. The router targets a named pipeline ID. Steps are predictable, testable, and do not require LLM reasoning to sequence.

Example: Brand context compilation involves defined steps — fetch brand data → extract themes → generate context → store result. These steps don't require the LLM to decide the order.

---

## Workflow 3 — Direct Agent Dispatch

Used for: simple, atomic tasks that map 1:1 to a single specialist agent.

The router targets a specific agent ID directly. The agent receives the `AgentContext`, executes its focused task, and returns a result. No orchestration overhead.

Example: `generate illustration` → router targets `brand-illustration` agent directly.

> **Note:** Workflows 2 and 3 share the same dispatch mechanism — a pipeline is just a target with multiple steps, a direct agent is a target with one step.

---

## Tools vs Agents

Not everything downstream needs to be an agent:

| Concept | Has LLM | Use when |
|---|---|---|
| **Tool** | No | Deterministic operation — DB query, API call, file transform |
| **Agent** | Yes | Needs its own reasoning, prompt, and tool access |

Agents in `lib/agents/` should only be agents when they need to reason internally. Otherwise, implement them as tools the orchestrator calls directly.

---

## Agent Registry (Manifest)

All available agents are registered at `lib/agents/registry.ts`. This manifest:
- Bounds what the agentic loop can call (no hallucinated workflows)
- Serves as the source of truth for the router's rule-based matching
- Documents each agent's purpose and expected routing mode

---

## Structured Output

Every user request — regardless of which workflow or agents were involved — produces a single `AssistantOutput` object. The Main Orchestrator Agent is solely responsible for assembling this final output from the results of downstream agents and tools.

```ts
type MediaType = 'image' | 'video' | 'link'

interface MediaItem {
  filename: string
  signedUrl: string   // pre-signed or public URL for download / display
  type: MediaType
}

interface AssistantOutput {
  text: string                      // final message to the user; may contain HTML
  medias: MediaItem[]               // images, videos, or links to display alongside text
  confidenceScore: number           // 0.0 (no confidence) → 1.0 (fully confident)
  metadata: Record<string, unknown> // additional structured data from any agent
}
```

### Field notes

| Field | Description |
|---|---|
| `text` | The human-readable reply. HTML is allowed for rich formatting. |
| `medias` | Ordered list of assets. `signedUrl` must be a valid, time-limited pre-signed URL for private storage assets, or a stable public URL. |
| `confidenceScore` | Set by the orchestrator after reviewing all agent outputs. Low scores (< 0.5) should surface a disclaimer in the UI. |
| `metadata` | Open-ended bag for agent traces, brand context IDs, pipeline step results, or any data the UI or downstream systems need. No required shape. |

### Assembly responsibility

Downstream agents do **not** produce `AssistantOutput`. They return their own focused results (e.g. an illustration URL, a brand context object). The orchestrator collects those results, reasons over them, and constructs the single `AssistantOutput` returned to the client.
