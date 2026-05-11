"use client";

import { useEffect } from "react";
import { resolveActiveOrgId } from "@/app/user/actions";
import { storeActiveOrgId, getStoredActiveOrgId } from "@/hooks/use-active-org";

/**
 * Placed once in the root layout.
 * On mount, if no active org is stored in localStorage, calls the server to
 * resolve the user's default org (is_default or first membership) and stores it.
 * This is a no-op on subsequent page loads when localStorage is already populated.
 */
export function OrgInitializer() {
  useEffect(() => {
    if (getStoredActiveOrgId()) return;
    resolveActiveOrgId().then(storeActiveOrgId).catch(() => {
      storeActiveOrgId("default");
    });
  }, []);

  return null;
}
