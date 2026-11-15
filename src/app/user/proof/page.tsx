import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/dashboard-section";
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
  const verifiedCount = proofs.filter((proof) => proof.level === "verified").length;
  const levels: ProofLevel[] = ["added", "checked", "verified"];
  const canAdd = Boolean(profile) && manualCount < MAX_MANUAL_PROOFS;

  return (
    <RoleHome
      title="My Proof"
      name={session.user.name}
      description="Businesses see your proof cards first when you apply. A resume is optional."
      actions={
        <>
          <Link href="/user/resumes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage resumes
          </Link>
          {canAdd ? (
            <a href="#add-proof" className={buttonVariants({ size: "sm" })}>
              New proof card
            </a>
          ) : null}
        </>
      }
    >
      <RefreshWhilePending
        pending={proofs.some((p) => p.source === "manual" && p.aiScoreStatus === "pending")}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="proof-cards-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="proof-cards-heading" className="text-[15px] font-semibold text-[#121212]">
              Your cards
            </h2>
            <p className="text-[13px] text-[#737373] tabular-nums">
              {proofs.length} {proofs.length === 1 ? "card" : "cards"} · {verifiedCount} verified
            </p>
          </div>
          {proofs.length === 0 ? (
            <EmptyState>
              No proof cards yet. Add something you have made, or win a challenge to earn a verified
              card.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Your proof cards">
              {proofs.map((proof) => {
                const status = proof.source === "manual" ? checkStatus(proof) : null;
                const locked = proof._count.applications > 0;
                const hasFooter = Boolean(status) || proof.source === "manual";
                return (
                  <li key={proof.id} className="min-w-0">
                    <ProofCard proof={proof}>
                      {hasFooter ? (
                        <>
                          {status && <p className="text-[12px] text-[#737373]">{status}</p>}
                          {proof.source === "manual" &&
                            (locked ? (
                              <p className="text-[12px] text-[#737373]">
                                Attached to an application, so it can&apos;t be changed. Withdraw
                                the application to edit it.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <details className="group/edit min-w-0 flex-1">
                                    <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-[#d4d4d4] bg-white px-3 text-[13px] font-medium text-[#121212] transition-colors hover:border-[#121212] [&::-webkit-details-marker]:hidden">
                                      Edit
                                    </summary>
                                    <div className="mt-3 rounded-lg border border-[#e5e5e5] bg-white p-3">
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
                                  <form action={deleteProofAction} className="self-start">
                                    <input type="hidden" name="id" value={proof.id} />
                                    <button
                                      type="submit"
                                      aria-label={`Delete ${proof.title}`}
                                      className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] font-medium text-[#b91c1c] transition-colors hover:bg-[#fef2f2]"
                                    >
                                      Delete
                                    </button>
                                  </form>
                                </div>
                              </div>
                            ))}
                        </>
                      ) : null}
                    </ProofCard>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          id="add-proof"
          aria-label={`Add proof (${manualCount}/${MAX_MANUAL_PROOFS})`}
          className="min-w-0 scroll-mt-6 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white lg:sticky lg:top-8"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] px-5 py-3.5">
            <h2 className="text-[15px] font-semibold text-[#121212]">Add proof</h2>
            <span className="text-[12px] text-[#737373] tabular-nums">
              {manualCount}/{MAX_MANUAL_PROOFS} used
            </span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-[13px] leading-relaxed text-[#737373]">
              Show something you have made: a design, a page you run, a project, a report.
            </p>
            {!profile ? (
              <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
                Create your profile first
              </Link>
            ) : manualCount < MAX_MANUAL_PROOFS ? (
              <ProofForm />
            ) : (
              <p className="text-[13px] text-[#737373]">
                You have {MAX_MANUAL_PROOFS} proof cards. Delete one to add another.
              </p>
            )}
          </div>
          <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-5 py-4">
            <p className="mb-2 text-[12px] font-medium text-[#525252]">What the badges mean</p>
            <ul className="flex flex-col gap-2" aria-label="What the badges mean">
              {levels.map((level) => (
                <li key={level} className="flex flex-col items-start gap-1">
                  <ProofBadge level={level} />
                  <span className="text-[12px] leading-snug text-[#737373]">
                    {PROOF_LEVEL_HINTS[level]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </RoleHome>
  );
}
