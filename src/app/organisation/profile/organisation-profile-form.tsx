"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { saveOrganisationProfileAction, type OrganisationProfileFormState } from "./actions";

export type OrganisationProfileValues = {
  businessName: string;
  description: string;
  industry: string;
  location: string;
  website: string;
};

export function OrganisationProfileForm({
  initial,
  status,
}: {
  initial: OrganisationProfileValues;
  status: OrganisationStatus | null;
}) {
  const [state, action, pending] = useActionState<OrganisationProfileFormState, FormData>(
    saveOrganisationProfileAction,
    { status: "idle" },
  );
  useActionErrorToast(state);
  // Rendered values survive React's form reset after a failed submit.
  const values = state.status === "error" ? { ...initial, ...state.values } : initial;

  return (
    <form action={action} className="flex flex-col gap-4">
      {status === "approved" && (
        <p className="rounded-md bg-muted p-3 text-sm">
          Your business is approved. Saving changes sends your profile back for admin review, and
          your listings are hidden until it is approved again.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={values.businessName}
          required
          maxLength={120}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={values.description}
          required
          maxLength={2000}
          rows={5}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="industry">Industry</Label>
        <Input
          id="industry"
          name="industry"
          defaultValue={values.industry}
          required
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={values.location}
          required
          maxLength={120}
          placeholder="City, State"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="website">Website (optional)</Label>
        <Input
          id="website"
          name="website"
          type="url"
          defaultValue={values.website}
          placeholder="https://"
        />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : status ? "Save profile" : "Submit for review"}
        </Button>
        <Link href="/organisation" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
