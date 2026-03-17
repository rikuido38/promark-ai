// ---------------------------------------------------------------------------
// Intent Router
//
// Classifies a user message into one of three routing modes:
//   - direct   → single specialist agent (1:1 mapping, known intent)
//   - pipeline → multi-step developer-defined workflow
//   - agentic  → open-ended, LLM reasons freely with all available tools
//
// Strategy: rule-based first (fast, zero LLM cost). Unmatched messages fall
// back to agentic mode. Add patterns here as new direct/pipeline workflows are
// registered in the tool registry.
// ---------------------------------------------------------------------------

export type RouteMode = "agentic" | "pipeline" | "direct";

export interface RoutingDecision {
  mode: RouteMode;
  /**
   * Workflow/agent target ID — matches a key in the tool registry.
   * Only set for "pipeline" and "direct" modes.
   */
  target?: string;
}

// ---------------------------------------------------------------------------
// Route map: ordered list of rules checked top-to-bottom.
// The first match wins.
// ---------------------------------------------------------------------------

interface RouteRule {
  mode: RouteMode;
  target: string;
  // At least one pattern must match to trigger this rule.
  patterns: RegExp[];
}

const ROUTE_RULES: RouteRule[] = [
  {
    mode: "direct",
    target: "generate_illustration",
    patterns: [
      /\b(generate|create|make|draw|design)\b.*\b(illustration|image|picture|artwork|visual)\b/i,
      /\billustrat/i,
    ],
  },
  // Add new pipeline/direct rules here. Example:
  // {
  //   mode: "pipeline",
  //   target: "compile_brand_context",
  //   patterns: [/\b(compile|rebuild|refresh)\b.*\bbrand\b/i],
  // },
];

// ---------------------------------------------------------------------------
// Public classifier
// ---------------------------------------------------------------------------

export function classifyIntent(message: string): RoutingDecision {
  for (const rule of ROUTE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(message))) {
      return { mode: rule.mode, target: rule.target };
    }
  }
  return { mode: "agentic" };
}
