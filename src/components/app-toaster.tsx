"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { FLASH_COOKIE, parseFlash, type Flash } from "@/lib/flash-shared";

// Survives client navigations, so a flash re-sent by a later render isn't shown twice.
const shown = new Set<string>();

export function showFlash(flash: Flash) {
  if (shown.has(flash.id)) return;
  shown.add(flash.id);
  toast[flash.type](flash.message, { id: flash.id });
}

/** The app's single toaster (NFR-3), themed with the careers palette. */
export function AppToaster({ flash }: { flash: Flash | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The server passes the flash when it renders the layout; after client navigations the
  // layout may not re-render, so the cookie is also read in the browser on every route change.
  useEffect(() => {
    const fromCookie = parseFlash(
      document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${FLASH_COOKIE}=`))
        ?.slice(FLASH_COOKIE.length + 1),
    );
    for (const item of [flash, fromCookie]) if (item) showFlash(item);
    if (flash || fromCookie) document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  }, [flash, pathname, searchParams]);

  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={5000}
      offset={16}
      mobileOffset={12}
      style={
        {
          fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "#e7efe9",
          "--success-text": "#1f4138",
          "--success-border": "#bcd3c5",
          "--error-bg": "#f8ece9",
          "--error-text": "#7f3326",
          "--error-border": "#e6c3bb",
          "--info-bg": "#f4eddd",
          "--info-text": "#1b2a26",
          "--info-border": "#e3d7bd",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-[0_18px_40px_-28px_rgba(22,24,29,0.45)] text-sm",
          title: "font-medium",
          actionButton: "!bg-[#26594a] !text-[#f4eddd]",
        },
      }}
    />
  );
}
