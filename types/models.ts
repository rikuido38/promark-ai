export type CampaignStatus = "todo" | "in_progress" | "completed";

/**
 * Represents a media file. `url` is a bare Supabase storage path (no scheme)
 * when the asset lives in our bucket, or a full URL (starting with http/https)
 * when pointing to an external resource.
 */
export interface Media {
  filename: string;
  url: string;
}

export type ProjectRole = "owner" | "editor" | "viewer";

export interface MemberEntry {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: ProjectRole;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Campaign {
  id: string;
  project_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: CampaignStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectUser {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string | null;
}

export interface Organization {
  id: string;
  name: string;
  assistant_name?: string | null;
  avatar_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrganizationSetting {
  id: string;
  org_id: string;
  key: string;
  value: unknown; // Storing as JSONB
  created_at: string | null;
  updated_at: string | null;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface Integration {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  mcp_server_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Discriminated union for org-level credentials (stored as JSONB)
export type OrgIntegrationCredentials =
  | {
      type: "oauth";
      client_id: string;
      client_secret: string;
      scopes?: string[];
    }
  | { type: "api_key"; api_key: string; header_name?: string }
  | { type: "custom"; [key: string]: unknown };

export type OrganizationIntegrationStatus =
  | "enabled"
  | "disabled"
  | "installed";

export interface OrganizationIntegration {
  id: string;
  org_id: string;
  integration_id: string;
  status: OrganizationIntegrationStatus;
  credentials: OrgIntegrationCredentials | null;
  created_at: string | null;
  updated_at: string | null;
}

export type UserIntegrationStatus = "connected" | "error" | "expired";

export interface ConnectedTool {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  userConnected: boolean;
}

export interface UserIntegration {
  id: string;
  user_id: string;
  org_id: string;
  integration_id: string;
  status: UserIntegrationStatus;
  credentials: unknown; // JSONB (tokens)
  created_at: string | null;
  updated_at: string | null;
}
