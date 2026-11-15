import type { Metadata } from "next";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getAllPrompts } from "@/lib/llm/prompts";
import { PromptEditor } from "./prompt-editor";

export const metadata: Metadata = { title: "Settings · Venture Path" };

export default async function AdminSettingsPage() {
  const session = await requireRole("admin");
  const prompts = await getAllPrompts();

  return (
    <RoleHome
      title="Settings"
      name={session.user.name}
      description="Platform settings for administrators."
      back={{ href: "/admin", label: "Dashboard" }}
    >
      <section
        id="prompts"
        aria-labelledby="prompts-title"
        className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
      >
        <div className="border-b border-[#f0f0f0] px-5 py-4">
          <h2 id="prompts-title" className="text-[15px] font-semibold text-[#121212]">
            LLM Prompts
          </h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-[#737373]">
            Edit the prompts sent to the LLM for each AI-powered feature. Changes take effect
            immediately. Available placeholders are shown in the template.
          </p>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {prompts.map((prompt) => (
            <PromptEditor key={prompt.key} prompt={prompt} />
          ))}
        </div>
      </section>
    </RoleHome>
  );
}
