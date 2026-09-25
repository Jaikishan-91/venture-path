"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePromptAction, type SettingsFormState } from "./actions";

export function PromptEditor({
  prompt,
}: {
  prompt: { key: string; name: string; content: string };
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(savePromptAction, {
    status: "idle",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{prompt.name}</CardTitle>
        <CardDescription>
          Key: <code>{prompt.key}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="key" value={prompt.key} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`content-${prompt.key}`}>Prompt template</Label>
            <Textarea
              id={`content-${prompt.key}`}
              name="content"
              defaultValue={prompt.content}
              required
              maxLength={10_000}
              rows={12}
              className="font-mono text-sm"
            />
          </div>
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
