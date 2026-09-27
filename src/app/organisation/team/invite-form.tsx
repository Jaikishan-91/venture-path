"use client";

import { useActionState, useEffect, useRef } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Invite a hiring manager</CardTitle>
        <CardDescription>
          They sign up with this email and see only the interviews they&apos;re assigned to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          action={action}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={MAX_MEMBER_NAME_LENGTH}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
