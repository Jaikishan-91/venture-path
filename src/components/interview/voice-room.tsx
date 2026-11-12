"use client";

import { Button } from "@/components/ui/button";

/**
 * Placeholder for the voice interview. WP-D replaces this file at merge with the LiveKit room;
 * the props are the contract in `src/lib/v2/types.ts`.
 */
export function VoiceRoom({ onSwitchToChat }: { token: string; onSwitchToChat: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>Voice interview is being set up — use chat.</p>
      <Button type="button" onClick={onSwitchToChat} className="self-start">
        Switch to chat
      </Button>
    </div>
  );
}
