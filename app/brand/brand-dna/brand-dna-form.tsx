"use client";

import { useState, useEffect, useRef, useCallback } from "react";
// Note: this component uses `key` prop (set by page.tsx) to remount when
// initialIsStale / initialStatus change, so no useEffect sync is needed.
import { BrandVisualSettings, IllustrationSettings } from "@/types/settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MasterBrandTab } from "./master-brand-tab";
import { IllustrationsTab } from "./illustrations-tab";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TriangleAlertIcon, RefreshCwIcon, CheckIcon, LoaderCircleIcon } from "lucide-react";
import type { ContextState } from "@/app/brand/actions";

type Status = ContextState["status"];

export function BrandDnaForm({
  initialSettings,
  initialIllustrationSettings,
  isStale: initialIsStale,
  initialStatus,
}: {
  initialSettings: BrandVisualSettings | null;
  initialIllustrationSettings: IllustrationSettings | null;
  isStale: boolean;
  initialStatus: Status;
}) {
  const [isStale, setIsStale] = useState(initialIsStale);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [compileError, setCompileError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /api/brand/context/status while in_progress
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/brand/context");
        if (!res.ok) return;
        const data: { status: Status; is_stale: boolean } = await res.json();
        setStatus(data.status);
        if (data.status !== "in_progress") {
          stopPolling();
          if (data.status === "completed" && !data.is_stale) {
            setIsStale(false);
          }
        }
      } catch {
        // silently swallow network errors during polling
      }
    }, 5000);
  }, [stopPolling]);

  // Auto-start polling if page loads while generation is already running
  useEffect(() => {
    if (initialStatus === "in_progress") startPolling();
    return stopPolling;
  }, [initialStatus, startPolling, stopPolling]);

  async function handleRegenerate() {
    setCompileError(null);
    setStatus("in_progress");
    startPolling();

    // Fire-and-forget — user doesn't need to wait on this page
    fetch("/api/brand/context", { method: "POST" })
      .then(async (res) => {
        if (res.ok) {
          setStatus("completed");
          setIsStale(false);
        } else {
          const body = await res.json().catch(() => ({}));
          setCompileError((body as { error?: string }).error ?? "Request failed");
          setStatus("error");
        }
        stopPolling();
      })
      .catch((err) => {
        setCompileError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
        stopPolling();
      });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand DNA</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Define the core visual rules and aesthetics for your organization.
          These settings will be used by the Vision and Creative APIs.
        </p>
      </div>

      {status === "in_progress" && (
        <Alert className="max-w-4xl border-blue-200 bg-blue-50 text-blue-900 [&>svg]:text-blue-600">
          <LoaderCircleIcon className="animate-spin" />
          <AlertTitle>AI brand context is being generated</AlertTitle>
          <AlertDescription>
            This may take a minute or two. You can navigate away and come back
            later — the assistant will use the latest guidelines once it&apos;s done.
          </AlertDescription>
        </Alert>
      )}

      {status !== "in_progress" && isStale && (
        <Alert variant="destructive" className="max-w-4xl">
          <TriangleAlertIcon />
          <AlertTitle>AI brand context is out of date</AlertTitle>
          <AlertDescription>
            {(() => {
              if (status === "error" && compileError) return `Generation failed: ${compileError}`;
              if (status === "error") return "The last generation attempt failed. Please try again.";
              return "Brand or illustration settings have changed. Generate the AI context so the illustration assistant uses the latest guidelines.";
            })()}
          </AlertDescription>
          <div className="group-has-[>svg]/alert:col-start-2 mt-3">
            <Button
              size="sm"
              variant="default"
              onClick={handleRegenerate}
            >
              <RefreshCwIcon />
              {status === "error" ? "Retry" : "Refresh"}
            </Button>
          </div>
        </Alert>
      )}

      {status === "completed" && !isStale && initialIsStale && (
        <Alert className="max-w-4xl">
          <CheckIcon />
          <AlertTitle>AI context is up to date</AlertTitle>
          <AlertDescription>
            The illustration assistant is using the latest brand guidelines.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="master-brand" className="max-w-4xl">
        <TabsList variant="line">
          <TabsTrigger value="master-brand">Master Brand</TabsTrigger>
          <TabsTrigger value="illustrations">Illustrations</TabsTrigger>
        </TabsList>

        <TabsContent value="master-brand">
          <MasterBrandTab initialSettings={initialSettings} />
        </TabsContent>

        <TabsContent value="illustrations">
          <IllustrationsTab initialIllustrationSettings={initialIllustrationSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

