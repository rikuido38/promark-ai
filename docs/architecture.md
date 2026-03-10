# Promark AI Architecture

## Overview

Promark AI is a multi-agent system designed to work together to generate personalized marketing content. The architecture follows a **State Machine with Human-in-the-Loop (HITL)** pipeline, representing a real-world organizational Standard Operating Procedure (SOP) where human approvals are required at key transition points.

## Pipeline Phases

The process is broken down into four distinct phases, orchestrated by a central **Campaign Manager Agent**.

### Orchestrator: Campaign Manager Agent

- **Input:** Campaign and product write-ups.
- **Role:** Plans and executes, manages workflow/SOP, takes human input. Functions as the central router and state manager.
- **Output:** The final draft and status of each stage progress.

---

### Phase 1: Intake & Analysis (The Foundation)

This phase digests raw inputs and establishes the foundational rules, facts, and visual directions.

#### 1. Vision Agent

- **Input:** Campaign key visual.
- **Role:** Analyzing image colors, mood, and objects.
- **Output:** `VisualBlueprint` (The visual brand blueprint, mood, colors).

#### 2. Product Agent

- **Input:** Campaign and product write-ups.
- **Role:** Digests the campaign brief and product specs to extract USPs, pricing, and mandatory inclusions.
- **Output:** `ProductFactSheet`.

#### 3. Brand Guardian Agent

- **Input:** Brand guidelines, campaign write-up.
- **Role:** Protect the brand identity. If this agent detects a critical brand violation, it halts the pipeline and forces a **Human Takeover**.
- **Output:** `VoiceAndToneMandate` OR `Brand_Violation_Alert`.

---

### Phase 2: The Personalisation

This phase takes the established foundation and maps it to specific customer segments.

#### Persona Agent

- **Input:** Output from Phase 1 (`VisualBlueprint`, `ProductFactSheet`, `VoiceAndToneMandate`) and customer segmentation.
- **Role:** Takes the foundation and maps them to each customer segment.
- **Output:** Array of `SegmentBrief` (A unique creative brief personalisation and content for each segment).

---

### Phase 3: The Production

This phase generates the actual assets based on the strategic briefs.

#### 1. SEM Agent

- **Input:** `SegmentBrief` + `ProductFactSheet`.
- **Role:** Create optimized ads for search engines.
- **Output:** Headlines and descriptions for Google.

#### 2. Social Media Agents

- **Input:** `SegmentBrief` + `ProductFactSheet`.
- **Role:** Create optimized ads for FB, Instagram, TikTok.
- **Output:** High-energy "hooks", body copy, and emoji-inclusive captions.

#### 3. Creative Visual Agent

- **Input:** `SegmentBrief` + `ProductFactSheet` + `VisualBlueprint`.
- **Role:** Create key visuals for each segment-specific image or video.
- **Output:** Key visual for each segment.

---

### Phase 4: Quality Gate

This phase ensures everything produced meets the required standards before final delivery.

#### Quality Auditor Agent

- **Input:** The generated copy from production, `ProductFactSheet`, and `VoiceAndToneMandate`.
- **Role:** Review every single piece of production copy against the facts and brand rules.
- **Output:** Pass or Fail. If Fail, it **reroutes the specific asset back to its origin agent** (e.g., failed SEM copy goes back to SEM Agent via Campaign Manager) for revision.

## Data Contracts (I/O Schemas)

To ensure reliable communication between agents, strict data contracts (JSON/TypeScript schemas) are used instead of raw text.

### Phase 1 Outputs

#### VisualBlueprint

```typescript
interface VisualBlueprint {
  primary_colors_hex: string[];
  mood_keywords: string[];
  lighting_style: string;
  mandatory_objects_detected: string[];
  composition_rules: string;
}
```

#### VoiceAndToneMandate

```typescript
interface VoiceAndToneMandate {
  formality_index: number; // Scale 1-10
  humor_index: number; // Scale 1-10
  allowed_emojis: string[];
  banned_words: string[];
  mandatory_vocabulary: string[];
  sentence_length_preference: string;
}
```

#### ProductFactSheet

```typescript
interface ProductFactSheet {
  product_name: string;
  core_usps: string[];
  pricing: {
    amount: number;
    currency: string;
    discounts_available: boolean;
  };
  call_to_action: string;
}
```

### Phase 2 Outputs

#### SegmentBrief

```typescript
interface SegmentBrief {
  segment_name: string;
  emotional_hook: string;
  ideal_channels: string[];
  key_benefit_focus: string;
  tone_override_notes: string;
}
```

## Workflow Execution

1. **Initialization:** The user provides the initial campaign details, product info, brand guidelines, and target segments to the Campaign Manager.
2. **Foundation Generation (Phase 1):** The Campaign Manager triggers Phase 1 agents concurrently. If the Brand Guardian Agent fails the input, the process halts for **Manual Human Review**.
3. **Phase 1 Approval Gate:** A human reviews the generated `VisualBlueprint`, `ProductFactSheet`, and `VoiceAndToneMandate` before approving the pipeline to continue.
4. **Personalisation Formulation (Phase 2):** Once Phase 1 is approved, the Campaign Manager passes all Phase 1 outputs to the Persona Agent, which generates customized `SegmentBrief`s.
5. **Phase 2 Approval Gate:** A human reviews the generated strategic `SegmentBrief`s.
6. **Asset Production (Phase 3):** The Campaign Manager routes the approved `SegmentBrief`s and Foundation data to the appropriate Production agents (SEM, Social Media, Creative Visual).
7. **Quality Assurance (Phase 4):** All produced assets are passed to the Quality Auditor Agent. If an asset fails, feedback is **rerouted directly back to the specific Phase 3 agent** for revision without human intervention.
8. **Final Delivery & Approval:** The Campaign Manager compiles all passed assets and presents the final draft to the user for final human approval and publishing.

## State Invalidation and Dependency Tracking

Because the user can edit inputs (like campaign write-ups) mid-flight, the architecture implements a **Reactive Dataflow** (similar to a build system like Bazel or Make).

- **Dependency Invalidation:** When a user alters an upstream input (e.g., changes the product promotion in Phase 1) and reruns Phase 1, the downstream components (Phase 2 and 3) that depend on those specific outputs are **invalidated**.
- **Execution Policy:** If Phase 1 is rerun:
  - Phase 2 (Persona Agent) **must** be re-evaluated since its foundation changed.
  - Phase 3 (Production) **must** be regenerated based on the new Phase 2 Briefs.
- **Smart Caching:** If Phase 1 is rerun but the generated data contracts (`ProductFactSheet`, etc.) are semantically identical to the previous run, the re-run of Phases 2 and 3 can be safely bypassed to save time and API costs.

## UI/UX Vision: The Dual-Pane Campaign Manager

To ensure visibility, trust, and control, the Campaign Manager is exposed to the user through a dual-pane "Artifacts" style interface.

### The Left Pane: The AI Co-Pilot (Chat Interface)

- **Conversational Interface:** The primary interaction model where the user talks to the system (e.g., "Let's launch a summer shoe campaign").
- **Proactive Prompts:** The AI drives the workflow status forward. When a phase completes, it proactively prompts the user: _"Phase 1 complete! Please review the artifacts on the right. Should we proceed to Personalisation?"_
- **Action Buttons:** Chat bubbles contain rich UI elements (e.g., `[Approve Phase 1]`, `[Rerun Vision Agent]`) embedded within the conversation flow to trigger state transitions.

### The Right Pane: The Campaign Canvas (Workspace)

- **Visual Pipeline Map:** An interactive progress tracker showing the 4 phases (`[Intake] -> [Personalisation] -> [Production] -> [Quality]`). Nodes pulse or display spinners during active generation.
- **Interactive Artifact Cards:** Generated JSON data contracts are rendered as beautiful, human-readable summary cards (e.g., color swatches for the `VisualBlueprint`, sliders for the `VoiceAndToneMandate`).
- **Human-in-the-Loop Editability:** The user can click into any generated artifact card to manually edit its contents (e.g., adding a missed product USP). The AI will use the _human-edited_ artifact as the definitive input for the subsequent phase.
- **Contextual Feedback:** If Phase 4 (Quality Gate) fails an asset, the corresponding card in the right pane highlights the error, and the left pane chatbot explains the explicit reason for the failure.
