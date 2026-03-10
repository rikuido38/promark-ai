export type CampaignStatus = "todo" | "in_progress" | "completed";

export interface Project {
  id: string;
  name: string;
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
  created_at: string | null;
}
