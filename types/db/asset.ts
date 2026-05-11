export type AssetPermissionLevel = "read" | "write" | "owner";
export type AssetPermissionSubjectType = "user" | "project" | "org";

export interface AssetPermission {
  _id: string;
  asset_id: string;
  subject_type: AssetPermissionSubjectType;
  subject_id: string;
  permission: AssetPermissionLevel;
  granted_by: string;
  expires_at: string | null;
  created_at: string;
  updated_at?: string;
}

export type AssetMediaType = "image" | "video" | "illustration";

export interface Asset {
  _id: string;
  name: string;
  type: AssetMediaType;
  thread_id?: string;
  created_by: string;
  tags: string[];
  last_version_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AssetVersion {
  _id: string;
  asset_id: string;
  version: number;
  filename: string;
  storage_path: string;
  source_path?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}
