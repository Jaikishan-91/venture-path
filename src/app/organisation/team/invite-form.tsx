"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_MEMBER_NAME_LENGTH } from "@/lib/hiring/types";
import { inviteMemberAction, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMemberAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <section
      id="invite"
      aria-labelledby="invite-heading"
      className="scroll-mt-6 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <div className="border-b border-[#f0f0f0] px-5 py-3.5">
        <h2 id="invite-heading" className="text-[15px] font-semibold text-[#121212]">
          Invite a hiring manager
        </h2>
        <p className="text-[13px] text-[#737373]">
          They sign up with this email and see only the interviews they&apos;re assigned to.
        </p>
      </div>
      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            maxLength={MAX_MEMBER_NAME_LENGTH}
            placeholder="e.g. Neha Gupta"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="neha@yourbusiness.com"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Send data-icon="inline-start" />
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </form>
    </section>
  );
}
