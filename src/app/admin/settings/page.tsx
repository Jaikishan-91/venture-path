import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getAllPrompts } from "@/lib/llm/prompts";
import { PromptEditor } from "./prompt-editor";

export const metadata: Metadata = { title: "Settings · VenturePath" };

export default async function AdminSettingsPage() {
  const session = await requireRole("admin");
  const prompts = await getAllPrompts();

  return (
    <RoleHome title="Settings" name={session.user.name}>
      <nav className="mb-4">
        <a href="#prompts" className="text-sm underline">
          Prompt management
        </a>
      </nav>

      <section id="prompts">
        <h2 className="text-lg font-medium mb-4">LLM Prompts</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Edit the prompts sent to the LLM for each AI-powered feature. Changes take effect
          immediately. Available placeholders are shown in the template.
        </p>

        <div className="flex flex-col gap-6">
          {prompts.map((prompt) => (
            <PromptEditor key={prompt.key} prompt={prompt} />
          ))}
        </div>
      </section>
    </RoleHome>
  );
}
