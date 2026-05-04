"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, ArrowUp, ImageIcon,
  Plus, X, Loader2,
} from "lucide-react";
import { useAIAssistant } from "@/components/ai-assistant-provider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenerationSettingsButton } from "@/components/generation-settings-dialog";
import {
  DEFAULT_GENERATION_SETTINGS,
  tabKeyFromPageKey,
  type GenerationSettings,
} from "@/types/generation-settings";
import { uploadChatAttachmentClient, type UploadAttachmentResult } from "@/app/actions/upload-attachment-client";
import { upsertStudioThread } from "@/app/studio/illustration/[id]/actions";
import { toast } from "sonner";

const ILLUSTRATION_MODELS = ["gpt-image-2", "gpt-image-1.5"];

const PAGE_KEY = "studio-illustration";

export function StudioPrompt() {
  const { availableModels } = useAIAssistant();
  const router = useRouter();
  const models = availableModels.length > 0 ? availableModels : ILLUSTRATION_MODELS;
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<UploadAttachmentResult[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(models[0]);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(
    () => DEFAULT_GENERATION_SETTINGS.illustration,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync selectedModel when context's availableModels populates after mount
  useEffect(() => {
    if (availableModels.length > 0) {
      setSelectedModel((prev) => (availableModels.includes(prev) ? prev : availableModels[0]));
    }
  }, [availableModels]);

  const tabKey = tabKeyFromPageKey(PAGE_KEY);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingAttachment(true);
    try {
      const result = await uploadChatAttachmentClient(file);
      setAttachments((prev) => [...prev, result]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload attachment.";
      toast.error(message);
    } finally {
      setUploadingAttachment(false);
    }
  };

  function removeAttachment(storagePath: string) {
    setAttachments((prev) => prev.filter((x) => x.storagePath !== storagePath));
  }

  async function submit(msg: string) {
    const trimmed = msg.trim();
    if (!trimmed && attachments.length === 0) return;
    const messageWithAttachments =
      attachments.length > 0
        ? `${trimmed}\n\nAttached images:\n${attachments.map((a) => a.signedUrl).join("\n")}`
        : trimmed;
    const threadId = crypto.randomUUID();
    setSubmitting(true);
    setValue("");
    setAttachments([]);
    try {
      await upsertStudioThread(threadId, "illustration", messageWithAttachments, selectedModel || undefined);
      router.push(`/studio/illustration/${threadId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create thread.");
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(value);
    }
  }

  const canSubmit = !submitting && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Heading */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mb-2">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">What do you want to illustrate?</h1>
        <p className="text-muted-foreground text-sm">
          Describe your idea and let AI generate on-brand illustrations guided by your Brand DNA.
        </p>
      </div>

      {/* Input box */}
      <div className="rounded-2xl border bg-white shadow-sm focus-within:shadow-md focus-within:border-primary/40 transition-all">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((a) => (
              <div key={a.storagePath} className="relative group h-16 w-16 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.signedUrl}
                  alt={a.filename}
                  className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                />
                <button
                  onClick={() => removeAttachment(a.storagePath)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center rounded-full bg-slate-700 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove attachment"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {uploadingAttachment && (
              <div className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the illustration you want to create..."
          rows={3}
          className="w-full resize-none px-5 pt-4 pb-2 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/60 rounded-t-2xl"
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            {/* Hidden file input */}
            <input
              id="studio-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <Plus className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Attach</DropdownMenuLabel>
                  <DropdownMenuItem className="p-0">
                    <label
                      htmlFor={uploadingAttachment ? undefined : "studio-file-input"}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 cursor-pointer",
                        uploadingAttachment && "opacity-50 pointer-events-none",
                      )}
                    >
                      {uploadingAttachment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      {uploadingAttachment ? "Uploading…" : "Media"}
                    </label>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>

            {availableModels.length > 1 && (
              <Select value={selectedModel} onValueChange={(val) => setSelectedModel(val ?? "")}>
                <SelectTrigger size="sm" className="h-7 text-xs border-slate-200 bg-slate-50 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" align="start">
                  {models.map((modelId) => (
                    <SelectItem key={modelId} value={modelId}>
                      {modelId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {tabKey && (
              <GenerationSettingsButton
                tabKey={tabKey}
                settings={generationSettings}
                availableModels={availableModels}
                onSettingsChange={setGenerationSettings}
              />
            )}
          </div>

          <button
            onClick={() => void submit(value)}
            disabled={!canSubmit}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
              canSubmit
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
            aria-label="Generate illustration"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>


    </div>
  );
}
