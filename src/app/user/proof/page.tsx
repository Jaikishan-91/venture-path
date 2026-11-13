import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { PROOF_LEVEL_HINTS, ProofBadge } from "@/components/proof/proof-badge";
import { ProofCard } from "@/components/proof/proof-card";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import { getUserProfile } from "@/lib/profiles";
import { listOwnProofs } from "@/lib/proofs";
import { MAX_MANUAL_PROOFS, type ProofLevel } from "@/lib/v2/types";
import { RefreshWhilePending } from "../resumes/upload-form";
import { deleteProofAction } from "./actions";
import { ProofForm } from "./proof-form";

export const metadata: Metadata = { title: "My Proof · Venture Path" };

/** Check status for the student. Scores are never shown to students (docs/PRODUCT.md §3). */
function checkStatus(proof: { level: ProofLevel; aiScoreStatus: string }): string | null {
  if (proof.level !== "added") return null;
  if (proof.aiScoreStatus === "pending") return "Checking…";
  if (proof.aiScoreStatus === "skipped") return "The automatic check isn't available right now.";
  if (proof.aiScoreStatus === "failed") return "We couldn't check this card right now.";
  return "Not checked: the link didn't open, or “What I did” doesn't show the skills clearly yet.";
}

export default async function MyProofPage() {
  const session = await requireRole("user");
  const [profile, proofs] = await Promise.all([
    getUserProfile(session.user.id),
    listOwnProofs(session.user.id),
  ]);
  const manualCount = proofs.filter((proof) => proof.source === "manual").length;
  const levels: ProofLevel[] = ["added", "checked", "verified"];

  return (
    <RoleHome title="My Proof" name={session.user.name}>
      <RefreshWhilePending
        pending={proofs.some((p) => p.source === "manual" && p.aiScoreStatus === "pending")}
      />
      <p className="text-sm text-muted-foreground">
        Businesses see your proof first. A resume is optional:{" "}
        <Link href="/user/resumes" className="underline">
          manage your resumes
        </Link>
        .
      </p>
      <DashboardSection title={`Add proof (${manualCount}/${MAX_MANUAL_PROOFS})`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#737373]">
            Show what you have made. Businesses see your proof cards first when you apply.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm" aria-label="What the badges mean">
            {levels.map((level) => (
              <li key={level} className="flex flex-wrap items-center gap-2">
                <ProofBadge level={level} />
                <span className="text-[#737373]">{PROOF_LEVEL_HINTS[level]}</span>
              </li>
            ))}
          </ul>
          {!profile ? (
            <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
              Create your profile first
            </Link>
          ) : manualCount < MAX_MANUAL_PROOFS ? (
            <ProofForm />
          ) : (
            <p className="text-sm text-[#737373]">
              You have {MAX_MANUAL_PROOFS} proof cards. Delete one to add another.
            </p>
          )}
        </div>
      </DashboardSection>

      {proofs.length === 0 ? (
        <EmptyState>No proof cards yet.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Your proof cards">
          {proofs.map((proof) => {
            const status = proof.source === "manual" ? checkStatus(proof) : null;
            const locked = proof._count.applications > 0;
            return (
              <li key={proof.id}>
                <ProofCard proof={proof}>
                  {status && <p className="text-xs text-[#737373]">{status}</p>}
                  {proof.source === "manual" &&
                    (locked ? (
                      <p className="text-xs text-[#737373]">
                        Attached to an application, so it can&apos;t be changed. Withdraw the
                        application to edit it.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <details className="rounded-lg bg-[#f5f5f5] p-3">
                          <summary className="cursor-pointer text-sm font-medium">Edit</summary>
                          <div className="pt-3">
                            <ProofForm
                              initial={{
                                id: proof.id,
                                title: proof.title,
                                link: proof.link ?? "",
                                whatIDid: proof.whatIDid,
                                skills: proof.skills.join(", "),
                                fileName: proof.fileName,
                              }}
                            />
                          </div>
                        </details>
                        <form action={deleteProofAction}>
                          <input type="hidden" name="id" value={proof.id} />
                          <button
                            type="submit"
                            aria-label={`Delete ${proof.title}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    ))}
                </ProofCard>
              </li>
            );
          })}
        </ul>
      )}
    </RoleHome>
  );
}
