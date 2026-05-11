"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/types/models";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_owner: boolean;
}

export interface OrgMemberPanelProps {
  /** Current members of this org */
  members: OrgMember[];
  /** Async search returning matching user profiles */
  searchFn: (query: string) => Promise<UserProfile[]>;
  /** Called when "Add" is clicked with the chosen users */
  onAdd: (users: UserProfile[]) => void;
  /** Called when "Remove" is clicked on a member row */
  onRemove: (userId: string) => void;
  /** Called when "Make owner" is clicked on a non-owner member row */
  onSetOwner?: (userId: string) => void;
  /** Marks the current user's row with "(you)" */
  currentUserId?: string;
}

function getInitials(name: string) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function OrgMemberPanel({
  members,
  searchFn,
  onAdd,
  onRemove,
  onSetOwner,
  currentUserId,
}: OrgMemberPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [pending, setPending] = useState<UserProfile[]>([]);
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

  const handleAdd = () => {
    if (pending.length === 0) return;
    onAdd(pending);
    setPending([]);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Add row ──────────────────────────────────────── */}
      <div className="flex items-start gap-2">
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
            placeholder={pending.length === 0 ? "Add member by name or email…" : ""}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
          />

          {showDropdown && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[200] rounded-lg border bg-popover shadow-md overflow-hidden">
              {(() => {
                if (isSearching) {
                  return <div className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</div>;
                }
                if (results.length === 0) {
                  return <div className="px-3 py-2.5 text-xs text-muted-foreground">No users found.</div>;
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
                            {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.name} />}
                            <AvatarFallback className="text-xs bg-slate-200 text-slate-600">
                              {getInitials(u.name || u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-sm font-medium truncate">{u.name}</span>
                            <span className="text-xs text-muted-foreground truncate">{u.email}</span>
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

        <Button type="button" onClick={handleAdd} disabled={pending.length === 0} className="shrink-0">
          Add
        </Button>
      </div>

      {/* ── Member list ──────────────────────────────────── */}
      {members.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1">
            <Users className="h-3 w-3" />
            Members
          </div>
          <ul className="space-y-0.5">
            {members.map((m) => {
              const isSelf = m.id === currentUserId;
              return (
                <li key={m.id} className="flex items-center gap-3 py-1.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.name} />}
                    <AvatarFallback className="text-xs bg-slate-200 text-slate-600">
                      {getInitials(m.name || m.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {m.name}
                      {isSelf && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{m.email}</span>
                  </div>
                  {m.is_owner && (
                    <span className="text-xs text-muted-foreground shrink-0 px-2 py-0.5 rounded bg-muted">
                      Owner
                    </span>
                  )}
                  {!isSelf && !m.is_owner && onSetOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onSetOwner(m.id)}
                    >
                      Make owner
                    </Button>
                  )}
                  {!isSelf && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                      onClick={() => onRemove(m.id)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
