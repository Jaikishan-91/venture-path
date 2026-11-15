"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useActionErrorToast } from "@/components/use-action-error-toast";
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

  const notice =
    status === "approved"
      ? {
          className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
          text: "Your business is approved. Saving changes sends your profile back for admin review, and your listings are hidden until it is approved again.",
        }
      : status === "pending"
        ? {
            className: "border-[#e5e5e5] bg-white text-[#525252]",
            text: "Your profile is waiting for admin review. You can still edit it.",
          }
        : status === "rejected"
          ? {
              className: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
              text: "Your profile wasn't approved. Update it and save to send it for review again.",
            }
          : null;

  return (
    <form action={action} className="flex flex-col gap-6">
      {notice && (
        <p
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-[14px] ${notice.className}`}
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {notice.text}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
        <FormSection title="Business" help="How your business appears to students.">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                defaultValue={values.industry}
                required
                maxLength={80}
                placeholder="e.g. Food & retail"
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
          </div>
        </FormSection>

        <FormSection
          title="About"
          help="What you do, who your customers are, and what working with you is like."
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={values.description}
              required
              maxLength={2000}
              rows={6}
            />
            <p className="text-xs text-[#737373]">Up to 2,000 characters.</p>
          </div>
        </FormSection>

        <FormSection title="Online" help="Optional. A website or social page students can check.">
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
        </FormSection>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3">
          <Link href="/organisation" className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : status ? "Save profile" : "Submit for review"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** One settings-style row: title and help on the left, fields on the right. */
function FormSection({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-[#f0f0f0] px-5 py-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-semibold text-[#121212]">{title}</h2>
        <p className="text-[13px] leading-relaxed text-[#737373]">{help}</p>
      </div>
      <div className="flex max-w-2xl min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}
