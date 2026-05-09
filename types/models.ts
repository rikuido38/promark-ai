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

// ── Studio assets ─────────────────────────────────────────────────────────────

/** Matches the `type` field stored on Asset documents. */
export type AssetType = "illustration" | "image" | "video";
export type AssetContextType = "user" | "project" | "campaign";

/**
 * MongoDB `assets` collection document.
 * `_id` is a UUID string (not an ObjectId).
 * `thread_id` equals `_id` for all assets (set at creation or backfilled).
 */
export interface Asset {
  /** UUID string — also used as the URL route param and equals `thread_id`. */
  _id: string;
  type: AssetType;
  /** Internal LangGraph / chat thread ID. Always equals `_id`. */
  thread_id: string;
  name?: string;
  filename?: string;
  org_id?: string;
  context?: { type: AssetContextType; ref_id: string | null };
  visibility?: "private" | "org" | "public";
  tags?: string[];
  /** User ID of the creator. */
  created_by: string;
  /** FK → AssetVersion._id — points to the most recently published version. */
  last_version_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * MongoDB `asset_versions` collection document.
 * `_id` is a UUID string (not an ObjectId).
 * Each publish action creates one record; the latest version is determined by
 * sorting on `version` descending.
 */
export interface AssetVersion {
  /** UUID string — never an ObjectId. */
  _id: string;
  /** FK → Asset._id */
  asset_id: string;
  /** Monotonically increasing per asset, starting at 1. */
  version: number;
  /** S3/Supabase storage path, e.g. "default/assets/uuid.png". */
  storage_path: string;
  created_at: string;
}

// ── Studio threads ────────────────────────────────────────────────────────────

export type StudioThreadType = "illustration" | "image" | "video";

/**
 * MongoDB `studio_threads` collection document.
 * `_id` equals `thread_id` equals `asset_id` — all three are the same UUID.
 */
export interface StudioThread {
  /** UUID string = assetId. */
  _id: string;
  /** Always equals `_id`. Used as the LangGraph / chat session key. */
  thread_id: string;
  /** Always equals `_id`. Used as the URL route param. */
  asset_id: string;
  user_id: string;
  type: StudioThreadType;
  prompt: string | null;
  model: string | null;
  /** True until the first AI reply is saved; used to trigger auto-send on page load. */
  is_new_chat: boolean;
  created_at: string;
}

/**
 * A single media attachment stored inside a `studio_thread_chats` document.
 * `storagePath` is relative to the S3/Supabase bucket root.
 * `seed_details` is a serialized JSON description used to re-seed edits.
 */
export interface StudioMediaRecord {
  storagePath: string;
  seed_details?: string;
}

/**
 * MongoDB `studio_thread_chats` collection document.
 * Signed URLs are resolved at query time and not stored here.
 */
export interface StudioThreadChat {
  _id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  medias: StudioMediaRecord[];
  created_at: string;
}
