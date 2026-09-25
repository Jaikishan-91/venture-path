import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listApplicants, listApplicantAnalyses } from "@/lib/applications";
import { requireRole } from "@/lib/authz";
import { getOwnOpportunity } from "@/lib/opportunities";
import { createLlmClient } from "@/lib/llm/provider";
import { decideAction } from "./actions";
import { ResumeAnalysis } from "./resume-analysis";

export const metadata: Metadata = { title: "Applicants · VenturePath" };

const STATUS_LABEL = {
  submitted: "Waiting",
  accepted: "Accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};

export default async function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const opportunity = await getOwnOpportunity(session.user.id, id);
  if (!opportunity) notFound();
  const [applicants, analyses] = await Promise.all([
    listApplicants(session.user.id, id),
    listApplicantAnalyses(session.user.id, id),
  ]);

  const llmClient = createLlmClient();
  const canReanalyze = llmClient !== null;

  const analysisByApplicationId = new Map(analyses.map((a) => [a.applicationId, a]));

  return (
    <RoleHome title={opportunity.title} name={session.user.name}>
      <Link href="/organisation/opportunities" className="text-sm underline">
        Your listings
      </Link>
      {applicants.length === 0 && (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      )}
      {applicants.map((application) => (
        <article key={application.id} aria-label={application.userProfile.user.name}>
          <Card>
            <CardHeader>
              <CardTitle>{application.userProfile.user.name}</CardTitle>
              <CardDescription>
                {application.userProfile.course}, {application.userProfile.institution} ·{" "}
                {STATUS_LABEL[application.status]}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {application.userProfile.skills.length > 0 && (
                <p>{application.userProfile.skills.join(", ")}</p>
              )}
              {application.note && <p className="whitespace-pre-line">{application.note}</p>}
              {application.status === "accepted" && (
                <p>Email: {application.userProfile.user.email}</p>
              )}
              <a href={`/api/applications/${application.id}/resume`} className="underline">
                Download {application.resumeFileName}
              </a>
              {application.status === "submitted" && (
                <div className="flex gap-2">
                  <form action={decideAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="decision" value="accepted" />
                    <button type="submit" className={buttonVariants({ size: "sm" })}>
                      Accept
                    </button>
                  </form>
                  <form action={decideAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>

          <ResumeAnalysis
            applicationId={application.id}
            analysis={analysisByApplicationId.get(application.id) ?? null}
            canReanalyze={canReanalyze}
          />
        </article>
      ))}
    </RoleHome>
  );
}
