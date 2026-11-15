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

const hintClass = "text-[12px] leading-snug text-[#737373]";

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
      <div className="flex flex-col gap-1.5">
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}whatIDid`}>What I did</Label>
        <Textarea
          id={`${prefix}whatIDid`}
          name="whatIDid"
          defaultValue={initial.whatIDid}
          required
          maxLength={MAX_PROOF_WHAT_I_DID_LENGTH}
          rows={3}
          placeholder="What you did yourself and what came of it."
        />
        <p className={hintClass}>
          2–3 lines. Numbers help: posts made, followers gained, time saved.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}link`}>Link</Label>
        <Input
          id={`${prefix}link`}
          name="link"
          type="url"
          inputMode="url"
          defaultValue={initial.link}
          maxLength={MAX_PROOF_LINK_LENGTH}
          placeholder="https://"
        />
        <p className={hintClass}>GitHub, Canva, Drive, YouTube or Instagram.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}file`}>
          {initial.fileName ? "Replace the file (optional)" : "Or a file"}
        </Label>
        <input
          id={`${prefix}file`}
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
          className="max-w-full cursor-pointer rounded-lg border border-dashed border-[#d4d4d4] bg-[#fafafa] p-2 text-[13px] text-[#525252] file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-[#d4d4d4] file:bg-white file:px-2.5 file:py-1 file:text-[13px] file:font-medium file:text-[#121212]"
        />
        <p className={hintClass}>
          PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB. Add a link, a file or both.
        </p>
        {initial.fileName && (
          <label className="flex min-w-0 items-center gap-2 text-[13px] text-[#404040]">
            <input type="checkbox" name="removeFile" className="accent-[#16a34a]" />
            <span className="truncate">Remove {initial.fileName}</span>
          </label>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}skills`}>Skills</Label>
        <Input
          id={`${prefix}skills`}
          name="skills"
          defaultValue={initial.skills}
          required
          placeholder="canva, content writing"
        />
        <p className={hintClass}>Separate with commas. Up to {MAX_PROOF_SKILLS}.</p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : initial.id ? "Save changes" : "Add proof"}
      </Button>
    </form>
  );
}
