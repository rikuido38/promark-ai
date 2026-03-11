export interface AgentResponse {
  type: "text" | "ui" | "input_request";
  content: string;
  metadata?: AgentUIPayload | AgentInputPayload;
}

export interface AgentUIPayload {
  component_id: string;
  props: Record<string, any>;
}

export interface AgentInputPayload {
  action_id: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
  requires_confirmation?: boolean;
}
