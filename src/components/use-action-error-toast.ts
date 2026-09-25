"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Shows an error toast each time a server action returns a new error state (NFR-3).
 * `useActionState` returns a fresh object per submission, so the same message repeats.
 */
export function useActionErrorToast(
  state: { status: string; message?: string },
  action?: { label: string; href: string },
) {
  useEffect(() => {
    if (state.status !== "error" || !state.message) return;
    toast.error(state.message, {
      action: action
        ? { label: action.label, onClick: () => window.location.assign(action.href) }
        : undefined,
    });
    // `action` is derived from `state`, so `state` alone decides when to show a toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
