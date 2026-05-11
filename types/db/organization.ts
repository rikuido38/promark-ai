export interface Organization {
  _id: string;
  name: string;
  assistant_name?: string;
  avatar_url?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUser {
  _id: string;
  org_id: string;
  user_id: string;
  is_owner: boolean;
  is_default?: boolean;
  created_at: string;
  updated_at: string;
}
