"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ProjectRole, MemberEntry, UserProfile } from "@/types/models";

export type { ProjectRole, MemberEntry } from "@/types/models";

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "Owner",
  editor: "Can edit",
  viewer: "Can view",
};

function getInitials(name: string) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export interface MemberInvitePanelProps {
  /** Current "who has access" member list */
  members: MemberEntry[];
  /** Async function that returns matching UserProfiles for a search query */
  searchFn: (query: string) => Promise<UserProfile[]>;
  /** Called when the Invite button is clicked with the chosen users + role */
  onInvite: (entries: MemberEntry[]) => void;
  /** Called when the role dropdown in the access list changes */
  onChangeRole: (userId: string, role: ProjectRole) => void;
  /** Called when "Remove" is chosen from the access-list role dropdown */
  onRemove: (userId: string) => void;
  /** Marks the current user's row with "(you)" */
  currentUserId?: string;
}

export function MemberInvitePanel({
  members,
  searchFn,
  onInvite,
  onChangeRole,
  onRemove,
  currentUserId,
}: MemberInvitePanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [pending, setPending] = useState<UserProfile[]>([]);
  const [inviteRole, setInviteRole] = useState<ProjectRole>("editor");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLLabelElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busyIds = new Set([
    ...members.map((m) => m.id),
    ...pending.map((u) => u.id),
  ]);

  const doSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length < 2) {
        setResults([]);
        setShowDropdown(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const res = await searchFn(value.trim());
          setResults(res.filter((u) => !busyIds.has(u.id)));
          setShowDropdown(true);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchFn, members.length, pending.length],
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    doSearch(e.target.value);
  };

  const selectUser = (user: UserProfile) => {
    setPending((prev) => [...prev, user]);
    setResults((prev) => prev.filter((u) => u.id !== user.id));
    setQuery("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeChip = (userId: string) => {
    setPending((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleInvite = () => {
    if (pending.length === 0) return;
    onInvite(pending.map((u) => ({ ...u, role: inviteRole })));
    setPending([]);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleRoleChange = (userId: string, value: string) => {
    if (value === "_remove") {
      onRemove(userId);
    } else {
      onChangeRole(userId, value as ProjectRole);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Invite row ─────────────────────────────────── */}
      <div className="flex items-start gap-2">
        {/* Chip input */}
        <label
          ref={containerRef}
          className="relative flex flex-1 flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5 min-h-10 cursor-text focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring"
        >
          {pending.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium max-w-[160px]"
            >
              <span className="truncate">{u.name || u.email}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeChip(u.id);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onFocus={() => query.trim().length >= 2 && setShowDropdown(true)}
            placeholder={pending.length === 0 ? "Add people by name or email…" : ""}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
          />

          {/* Search results dropdown */}
          {showDropdown && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[200] rounded-lg border bg-popover shadow-md overflow-hidden">
              {(() => {
                if (isSearching) {
                  return (
                    <div className="px-3 py-2.5 text-xs text-muted-foreground">
                      Searching…
                    </div>
                  );
                }
                if (results.length === 0) {
                  return (
                    <div className="px-3 py-2.5 text-xs text-muted-foreground">
                      No users found.
                    </div>
                  );
                }
                return (
                  <ul className="max-h-52 overflow-y-auto">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-accent text-left"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectUser(u);
                          }}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            {u.avatar_url && (
                              <AvatarImage src={u.avatar_url} alt={u.name} />
                            )}
                            <AvatarFallback className="text-xs">
                              {getInitials(u.name || u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-sm font-medium truncate">
                              {u.name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {u.email}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          )}
        </label>

        {/* Role picker */}
        <Select
          value={inviteRole}
          onValueChange={(v) => setInviteRole(v as ProjectRole)}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue>{ROLE_LABELS[inviteRole]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="editor">Can edit</SelectItem>
            <SelectItem value="viewer">Can view</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          onClick={handleInvite}
          disabled={pending.length === 0}
          className="shrink-0"
        >
          Invite
        </Button>
      </div>

      {/* ── Who has access ─────────────────────────────── */}
      {members.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1">
            <Lock className="h-3 w-3" />
            Who has access
          </div>
          <ul className="space-y-0.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-1.5">
                <Avatar className="h-8 w-8 shrink-0">
                  {m.avatar_url && (
                    <AvatarImage src={m.avatar_url} alt={m.name} />
                  )}
                  <AvatarFallback className="text-xs">
                    {getInitials(m.name || m.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col leading-tight min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">
                    {m.name}
                    {m.id === currentUserId && (
                      <span className="ml-1 text-xs text-muted-foreground font-normal">
                        (you)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {m.email}
                  </span>
                </div>
                <Select
                  value={m.role}
                  onValueChange={(v) => handleRoleChange(m.id, v)}
                >
                  <SelectTrigger className="w-28 h-8 text-xs shrink-0">
                    <SelectValue>{ROLE_LABELS[m.role]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="editor">Can edit</SelectItem>
                    <SelectItem value="viewer">Can view</SelectItem>
                    <SelectSeparator />
                    <SelectItem
                      value="_remove"
                      className="text-destructive focus:text-destructive"
                    >
                      Remove
                    </SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper — keeps the same panel inside a Dialog for other use cases
// ---------------------------------------------------------------------------
export interface MemberInviteDialogProps extends MemberInvitePanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Used in the dialog title: "Invite others to {title}" */
  title: string;
}

export function MemberInviteDialog({
  open,
  onOpenChange,
  title,
  ...panelProps
}: MemberInviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite others to {title}</DialogTitle>
        </DialogHeader>
        <MemberInvitePanel {...panelProps} />
      </DialogContent>
    </Dialog>
  );
}
