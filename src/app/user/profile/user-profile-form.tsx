"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import Link from "next/link";
import { useActionState } from "react";
import { RepeatableInputs } from "@/components/repeatable-inputs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_LINKS, MAX_SKILLS } from "@/lib/profile-schemas";
import { saveUserProfileAction, type UserProfileFormState } from "./actions";

export type UserProfileValues = {
  institution: string;
  course: string;
  graduationYear: string;
  skills: string;
  bio: string;
  links: string;
};

const hintClass = "text-[12px] leading-snug text-[#737373]";

/** One settings row: what the section is for on the left, its fields on the right. */
function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-[#f0f0f0] px-5 py-6 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-semibold text-[#121212]">{title}</h2>
        <p className={hintClass}>{help}</p>
      </div>
      <div className="flex min-w-0 max-w-xl flex-col gap-4">{children}</div>
    </div>
  );
}

export function UserProfileForm({ initial }: { initial: UserProfileValues }) {
  const [state, action, pending] = useActionState<UserProfileFormState, FormData>(
    saveUserProfileAction,
    { status: "idle" },
  );
  useActionErrorToast(state);
  // Rendered values survive React's form reset after a failed submit.
  const values = state.status === "error" ? { ...initial, ...state.values } : initial;

  return (
    <form
      action={action}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <Section title="Education" help="Where you study now, or studied last.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="institution">Institution</Label>
          <Input
            id="institution"
            name="institution"
            defaultValue={values.institution}
            required
            maxLength={120}
            placeholder="e.g. Govt. Polytechnic, Indore"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="course">Course</Label>
            <Input
              id="course"
              name="course"
              defaultValue={values.course}
              required
              maxLength={120}
              placeholder="e.g. Diploma in Commerce"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="graduationYear">Graduation year</Label>
            <Input
              id="graduationYear"
              name="graduationYear"
              type="number"
              inputMode="numeric"
              defaultValue={values.graduationYear}
              required
              placeholder="2027"
            />
          </div>
        </div>
      </Section>

      <Section
        title="About you"
        help="A few lines businesses read before your proof. What you like doing and what you're good at."
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" name="bio" defaultValue={values.bio} maxLength={1000} rows={4} />
          <p className={hintClass}>Optional. Up to 1,000 characters.</p>
        </div>
      </Section>

      <Section
        title="Matching"
        help="Your skills match you with jobs and challenges. Add the ones you actually use."
      >
        <RepeatableInputs
          label="Skills"
          itemLabel="Skill"
          name="skills"
          initial={values.skills}
          separator=","
          max={MAX_SKILLS}
          placeholder="react"
          hint={`Add up to ${MAX_SKILLS}. For example: react, figma, content writing.`}
        />
      </Section>

      <Section title="Your work online" help="Where businesses can see more of what you have made.">
        <RepeatableInputs
          label="Links"
          itemLabel="Link"
          name="links"
          initial={values.links}
          separator={"\n"}
          max={MAX_LINKS}
          placeholder="https://"
          hint={`Add up to ${MAX_LINKS}: portfolio, GitHub, LinkedIn.`}
        />
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3 md:px-6">
        <Link href="/user" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
