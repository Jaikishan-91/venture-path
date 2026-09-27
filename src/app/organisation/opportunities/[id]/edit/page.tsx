import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { requireRole } from "@/lib/authz";
import { getOwnOpportunity } from "@/lib/opportunities";
import { todayInIndia } from "@/lib/opportunity-schemas";
import { createLlmClient } from "@/lib/llm/provider";
import { getPipeline, listPipelineSources } from "@/lib/pipelines";
import { getOrganisationProfile } from "@/lib/profiles";
import { AiSuggest } from "../../ai-suggest";
import { NotApproved } from "../../not-approved";
import { OpportunityForm } from "../../opportunity-form";
import { PipelineEditor } from "../../pipeline-editor";

export const metadata: Metadata = { title: "Edit listing · VenturePath" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const [profile, opportunity] = await Promise.all([
    getOrganisationProfile(session.user.id),
    getOwnOpportunity(session.user.id, id),
  ]);
  if (!opportunity) notFound();
  const aiEnabled = createLlmClient() !== null;
  const isApproved = profile?.status === "approved";
  const pipeline = isApproved
    ? ((await getPipeline(session.user.id, opportunity.id)) ?? { stages: [], version: "0:" })
    : null;
  const pipelineSources = isApproved
    ? await listPipelineSources(session.user.id, opportunity.id)
    : [];

  return (
    <RoleHome title="Edit listing" name={session.user.name}>
      {profile?.status === "approved" ? (
        <>
          {aiEnabled && (
            <AiSuggest
              id={opportunity.id}
              canDraftQuestions={
                opportunity.questions.length === 0 && opportunity._count.applications === 0
              }
            />
          )}
          <OpportunityForm
            // Remount after an AI suggestion or save so the form shows the stored values.
            key={opportunity.updatedAt.getTime()}
            minDeadline={todayInIndia()}
            aiEnabled={aiEnabled}
            questions={opportunity.questions.map((question) => ({
              prompt: question.prompt,
              source: question.source,
            }))}
            questionsLocked={opportunity._count.applications > 0}
            initial={{
              id: opportunity.id,
              type: opportunity.type,
              title: opportunity.title,
              description: opportunity.description,
              skills: opportunity.skills.join(", "),
              workMode: opportunity.workMode,
              city: opportunity.city ?? "",
              payType: opportunity.payType,
              payAmount: opportunity.payAmount?.toString() ?? "",
              payPeriod: opportunity.payPeriod ?? "month",
              duration: opportunity.duration ?? "",
              deadline: opportunity.deadline?.toISOString().slice(0, 10) ?? "",
              requirements: opportunity.requirements ?? "",
              experienceLevel: opportunity.experienceLevel ?? "",
              compensationMin: opportunity.compensationMin?.toString() ?? "",
              compensationMax: opportunity.compensationMax?.toString() ?? "",
            }}
          />
          {pipeline && (
            <PipelineEditor
              opportunityId={opportunity.id}
              initialStages={pipeline.stages}
              initialVersion={pipeline.version}
              aiEnabled={aiEnabled}
              sources={pipelineSources}
            />
          )}
        </>
      ) : (
        <NotApproved />
      )}
    </RoleHome>
  );
}
