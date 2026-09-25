"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_LINKS, MAX_SKILLS } from "@/lib/profile-schemas";
import { saveStudentProfileAction, type StudentProfileFormState } from "./actions";

export type StudentProfileValues = {
  institution: string;
  course: string;
  graduationYear: string;
  skills: string;
  bio: string;
  links: string;
};

export function StudentProfileForm({ initial }: { initial: StudentProfileValues }) {
  const [state, action, pending] = useActionState<StudentProfileFormState, FormData>(
    saveStudentProfileAction,
    { status: "idle" },
  );
  // Rendered values survive React's form reset after a failed submit.
  const values = state.status === "error" ? { ...initial, ...state.values } : initial;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={values.institution}
          required
          maxLength={120}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="course">Course</Label>
        <Input id="course" name="course" defaultValue={values.course} required maxLength={120} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="graduationYear">Graduation year</Label>
        <Input
          id="graduationYear"
          name="graduationYear"
          type="number"
          inputMode="numeric"
          defaultValue={values.graduationYear}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="skills">Skills</Label>
        <Input
          id="skills"
          name="skills"
          defaultValue={values.skills}
          aria-describedby="skills-hint"
        />
        <p id="skills-hint" className="text-xs text-muted-foreground">
          Separate with commas, up to {MAX_SKILLS}. For example: react, figma, content writing
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={values.bio} maxLength={1000} rows={4} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="links">Links</Label>
        <Textarea
          id="links"
          name="links"
          defaultValue={values.links}
          rows={3}
          aria-describedby="links-hint"
        />
        <p id="links-hint" className="text-xs text-muted-foreground">
          One per line, up to {MAX_LINKS}: portfolio, GitHub, LinkedIn.
        </p>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <Link href="/student" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
