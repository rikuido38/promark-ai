export const TABLES = {
  PROJECTS: "projects",
  CAMPAIGNS: "campaigns",
  ORGANIZATIONS: "organizations",
  ORGANIZATION_SETTINGS: "organization_settings",
  ORG_CACHE_CONTEXT: "org_cache_context",
  PROJECT_SETTINGS: "project_settings",
  PROJECT_USERS: "project_users",
  TAGS: "tags",
  INTEGRATIONS: "integrations",
  INTEGRATION_TAGS: "integration_tags",
  ORGANIZATION_INTEGRATIONS: "organization_integrations",
  USER_INTEGRATIONS: "user_integrations",
  USER_DRAFTS: "user_drafts",
  TEMPLATES: "templates",
  STUDIO_THREADS: "studio_threads",
  STUDIO_THREAD_CHATS: "studio_thread_chats",
} as const;

/** MongoDB collection names — mirrors TABLES for the MongoDB layer. */
export const COLLECTIONS = TABLES;
