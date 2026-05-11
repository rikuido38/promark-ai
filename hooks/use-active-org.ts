"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "promark:active_org_id";
export const ORG_COOKIE_NAME = "promark_org_id";

function writeOrgCookie(orgId: string) {
  document.cookie = `${ORG_COOKIE_NAME}=${orgId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function useActiveOrg() {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrgId(localStorage.getItem(STORAGE_KEY));
  }, []);

  const setActiveOrg = useCallback((orgId: string) => {
    localStorage.setItem(STORAGE_KEY, orgId);
    writeOrgCookie(orgId);
    setActiveOrgId(orgId);
  }, []);

  return { activeOrgId, setActiveOrg };
}

/** Read the active org ID synchronously (for use outside of React). Returns null on SSR. */
export function getStoredActiveOrgId(): string | null {
  if (globalThis.window === undefined) return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Write the active org ID to both localStorage and cookie. */
export function storeActiveOrgId(orgId: string): void {
  if (globalThis.window === undefined) return;
  localStorage.setItem(STORAGE_KEY, orgId);
  writeOrgCookie(orgId);
}
