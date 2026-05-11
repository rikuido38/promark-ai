"use client";

import { useState } from "react";
import { Search, Settings, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOrgIntegrationCredentials,
  toggleOrgIntegration,
  updateOrgIntegrationCredentials,
} from "./actions";
import { toast } from "sonner";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgIntegrationCredentials } from "@/types/models";

type IntegrationProps = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  tags: string[];
  orgStatus: "enabled" | "disabled" | "installed";
  orgCredentials: OrgIntegrationCredentials | null;
};

type CredentialType = "oauth" | "api_key";

export function IntegrationList({
  initialData,
}: {
  initialData: IntegrationProps[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeIntegration, setActiveIntegration] =
    useState<IntegrationProps | null>(null);
  const [credentialType, setCredentialType] = useState<CredentialType>("oauth");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headerName, setHeaderName] = useState("");

  const allTags = [
    "All",
    ...Array.from(new Set(initialData.flatMap((i) => i.tags))),
  ];

  const filteredData = initialData.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag === "All" || item.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const handleToggleOrg = async (id: string, currentStatus: string) => {
    try {
      setLoadingId(`org-${id}`);
      const enabling =
        currentStatus !== "enabled" && currentStatus !== "installed";
      await toggleOrgIntegration(id, enabling);
      toast.success(
        enabling
          ? "Integration enabled for organization"
          : "Integration disabled for organization",
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to update organization status");
    } finally {
      setLoadingId(null);
    }
  };

  const applyCredentialsToForm = (creds: OrgIntegrationCredentials | null) => {
    if (!creds) return;

    const raw = creds as Record<string, unknown>;
    const isOauth =
      creds.type === "oauth" || ("client_id" in raw && "client_secret" in raw);
    const isApiKey =
      creds.type === "api_key" || ("api_key" in raw && !("client_id" in raw));

    if (isOauth) {
      setCredentialType("oauth");
      setOauthClientId((raw.client_id as string) ?? "");
      setOauthClientSecret((raw.client_secret as string) ?? "");
      const scopesRaw = raw.scopes;
      setOauthScopes(
        Array.isArray(scopesRaw) ? scopesRaw.join(", ") : "",
      );
      setApiKey("");
      setHeaderName("");
      return;
    }

    if (isApiKey) {
      setCredentialType("api_key");
      setApiKey((raw.api_key as string) ?? "");
      setHeaderName((raw.header_name as string) ?? "");
      setOauthClientId("");
      setOauthClientSecret("");
      setOauthScopes("");
    }
  };

  const openCredentialDialog = async (integration: IntegrationProps) => {
    setActiveIntegration(integration);
    applyCredentialsToForm(integration.orgCredentials);

    try {
      setLoadingId(`credential-open-${integration.id}`);
      const creds = await getOrgIntegrationCredentials(integration.id);
      if (creds) applyCredentialsToForm(creds);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load current credentials");
    } finally {
      setLoadingId(null);
    }
  };

  const closeCredentialDialog = () => {
    if (loadingId === "credential-save") return;
    setActiveIntegration(null);
  };

  const handleSaveCredentials = async () => {
    if (!activeIntegration) return;

    let payload: OrgIntegrationCredentials;

    if (credentialType === "oauth") {
      if (!oauthClientId.trim() || !oauthClientSecret.trim()) {
        toast.error("Client ID and Client Secret are required for OAuth");
        return;
      }

      payload = {
        type: "oauth",
        client_id: oauthClientId.trim(),
        client_secret: oauthClientSecret.trim(),
        scopes: oauthScopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean),
      };
    } else {
      if (!apiKey.trim()) {
        toast.error("API key is required");
        return;
      }

      payload = {
        type: "api_key",
        api_key: apiKey.trim(),
        header_name: headerName.trim() || undefined,
      };
    }

    try {
      setLoadingId("credential-save");
      await updateOrgIntegrationCredentials(activeIntegration.id, payload);
      toast.success("Credentials updated");
      setActiveIntegration(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update credentials");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-10"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                selectedTag === tag
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredData.map((integration) => {
          const integrationIsEnabled = integration.orgStatus === "enabled";
          const actionLabel = integrationIsEnabled ? "Disable" : "Enable";

          return (
          <div
            key={integration.id}
            className={`flex flex-col bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow relative ${
              integrationIsEnabled ? "" : "opacity-75 grayscale-[0.5]"
            }`}
          >
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden p-2 relative">
                  {integration.logo_url ? (
                    <Image
                      src={integration.logo_url}
                      alt={integration.name}
                      fill
                      className="object-contain p-2"
                    />
                  ) : (
                    <span className="text-xl font-bold text-slate-400">
                      {integration.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {integration.orgStatus === "enabled" && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20">
                      <ShieldCheck className="h-3 w-3" /> Enabled
                    </span>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-lg">{integration.name}</h3>
              <p className="text-sm text-slate-500 mt-2 flex-1 line-clamp-2">
                {integration.description}
              </p>

              <div className="flex gap-2 mt-4">
                {integration.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-slate-50/50 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCredentialDialog(integration)}
                title={
                  integration.orgStatus === "disabled"
                    ? "Enable integration first to save credentials"
                    : "Edit credentials"
                }
                disabled={integration.orgStatus === "disabled"}
              >
                <Settings className="h-4 w-4" />
              </Button>

              <Button
                variant={integrationIsEnabled ? "outline" : "default"}
                size="sm"
                onClick={() =>
                  handleToggleOrg(integration.id, integration.orgStatus)
                }
                disabled={loadingId === `org-${integration.id}`}
              >
                {loadingId === `org-${integration.id}` ? "..." : actionLabel}
              </Button>
            </div>
          </div>
          );
        })}

        {filteredData.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
            No integrations found matching your filters.
          </div>
        )}
      </div>

      {activeIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl border">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Edit Credentials: {activeIntegration.name}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure organization-level credentials for this integration.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeCredentialDialog}
                disabled={loadingId === "credential-save"}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                <Label>Credential Type</Label>
                <div className="flex flex-wrap gap-2">
                  {(["oauth", "api_key"] as const).map((type) => (
                    <Button
                      key={type}
                      variant={credentialType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCredentialType(type)}
                      disabled={loadingId === "credential-save"}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              {credentialType === "oauth" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="oauth-client-id">Client ID</Label>
                    <Input
                      id="oauth-client-id"
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Enter client_id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oauth-client-secret">Client Secret</Label>
                    <Input
                      id="oauth-client-secret"
                      value={oauthClientSecret}
                      onChange={(e) => setOauthClientSecret(e.target.value)}
                      placeholder="Enter client_secret"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oauth-scopes">Scopes (comma-separated)</Label>
                    <Input
                      id="oauth-scopes"
                      value={oauthScopes}
                      onChange={(e) => setOauthScopes(e.target.value)}
                      placeholder="read, write, profile"
                    />
                  </div>
                </>
              )}

              {credentialType === "api_key" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key</Label>
                    <Input
                      id="api-key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter api_key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="header-name">Header Name (optional)</Label>
                    <Input
                      id="header-name"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="X-API-KEY"
                    />
                  </div>
                </>
              )}

            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4 bg-slate-50/70">
              <Button
                variant="outline"
                onClick={closeCredentialDialog}
                disabled={loadingId === "credential-save"}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCredentials}
                disabled={loadingId === "credential-save"}
              >
                {loadingId === "credential-save" ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
