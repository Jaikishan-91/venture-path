"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { MAX_PROOF_LINK_LENGTH } from "@/lib/proof-schemas";
import {
  MAX_PROOF_SKILLS,
  MAX_PROOF_TITLE_LENGTH,
  MAX_PROOF_WHAT_I_DID_LENGTH,
} from "@/lib/v2/types";
import { saveProofAction, type ProofFormState } from "./actions";

export type ProofFormValues = {
  id: string;
  title: string;
  link: string;
  whatIDid: string;
  skills: string;
  fileName: string | null;
};

const EMPTY: ProofFormValues = {
  id: "",
  title: "",
  link: "",
  whatIDid: "",
  skills: "",
  fileName: null,
};

/** One form for adding and editing a proof card: title, link or file, what I did, skills. */
export function ProofForm({ initial = EMPTY }: { initial?: ProofFormValues }) {
  const [state, action, pending] = useActionState<ProofFormState, FormData>(saveProofAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const prefix = initial.id ? `proof-${initial.id}-` : "proof-new-";

  return (
    <form action={action} className="flex min-w-0 flex-col gap-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}title`}>What did you make?</Label>
        <Input
          id={`${prefix}title`}
          name="title"
          defaultValue={initial.title}
          required
          maxLength={MAX_PROOF_TITLE_LENGTH}
          placeholder="e.g. Instagram posts for my uncle's sweet shop"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}link`}>Link</Label>
        <Input
          id={`${prefix}link`}
          name="link"
          type="url"
          inputMode="url"
          defaultValue={initial.link}
          maxLength={MAX_PROOF_LINK_LENGTH}
          placeholder="https://github.com/… or Canva, Drive, YouTube, Instagram"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}file`}>
          {initial.fileName ? "Replace the file (optional)" : "Or a file"}
        </Label>
        <input
          id={`${prefix}file`}
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
          className="max-w-full text-sm"
        />
        <p className="text-xs text-muted-foreground">
          PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB. Add a link, a file or both.
        </p>
        {initial.fileName && (
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <input type="checkbox" name="removeFile" />
            <span className="truncate">Remove {initial.fileName}</span>
          </label>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}whatIDid`}>What I did</Label>
        <Textarea
          id={`${prefix}whatIDid`}
          name="whatIDid"
          defaultValue={initial.whatIDid}
          required
          maxLength={MAX_PROOF_WHAT_I_DID_LENGTH}
          rows={3}
          placeholder="2–3 lines: what you did yourself and what came of it."
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}skills`}>Skills</Label>
        <Input
          id={`${prefix}skills`}
          name="skills"
          defaultValue={initial.skills}
          required
          placeholder="canva, content writing"
        />
        <p className="text-xs text-muted-foreground">
          Separate with commas. Up to {MAX_PROOF_SKILLS}.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : initial.id ? "Save changes" : "Add proof"}
      </Button>
    </form>
  );
}
