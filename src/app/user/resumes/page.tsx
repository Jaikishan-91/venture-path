import { FileText, Loader2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSection, EmptyState } from "@/components/dashboard/dashboard-section";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/authz";
import { getUserProfile } from "@/lib/profiles";
import { listResumes, MAX_LIBRARY_RESUMES } from "@/lib/resume-library";
import { manageResumeAction } from "./actions";
import { RefreshWhilePending, UploadResumeForm } from "./upload-form";

export const metadata: Metadata = { title: "Your resumes · Venture Path" };

const STATUS_TEXT = {
  pending: "Extracting skills…",
  done: null,
  failed: "Couldn't extract skills from this file.",
  skipped: "Skill extraction is not available right now.",
} as const;

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function UserResumesPage() {
  const session = await requireRole("user");
  const [profile, resumes] = await Promise.all([
    getUserProfile(session.user.id),
    listResumes(session.user.id),
  ]);
  const full = resumes.length >= MAX_LIBRARY_RESUMES;

  return (
    <RoleHome
      title="Your resumes"
      name={session.user.name}
      back={{ href: "/user/proof", label: "My Proof" }}
      description={`Keep up to ${MAX_LIBRARY_RESUMES} resumes and choose one for each application. We read the skills from each resume to recommend jobs.`}
    >
      <RefreshWhilePending pending={resumes.some((resume) => resume.skillsStatus === "pending")} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <DashboardSection title={`Library (${resumes.length}/${MAX_LIBRARY_RESUMES})`}>
          {resumes.length === 0 ? (
            <EmptyState>No resumes yet.</EmptyState>
          ) : (
            <ul className="-my-3 flex flex-col divide-y divide-[#f0f0f0]" aria-label="Resumes">
              {resumes.map((resume) => {
                const status = STATUS_TEXT[resume.skillsStatus];
                return (
                  <li
                    key={resume.id}
                    aria-label={resume.fileName}
                    className="flex min-w-0 flex-col gap-3 py-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#525252]"
                      >
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/api/resumes/${resume.id}`}
                          className="block truncate text-[14px] font-medium text-[#121212] underline-offset-4 hover:underline"
                        >
                          {resume.fileName}
                        </a>
                        <p className="text-[12px] text-[#737373]">
                          Added {formatDate(resume.createdAt)}
                        </p>
                      </div>
                    </div>

                    {resume.skills.length > 0 ? (
                      <ul aria-label="Skills" className="flex flex-wrap gap-1.5 sm:pl-12">
                        {resume.skills.map((skill) => (
                          <li
                            key={skill}
                            className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
                          >
                            {skill}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-1.5 text-[13px] text-[#737373] sm:pl-12">
                        {resume.skillsStatus === "pending" ? (
                          <Loader2 aria-hidden className="size-3.5 animate-spin" />
                        ) : null}
                        {status ?? "-"}
                      </p>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:pl-12">
                      <form action={manageResumeAction} className="flex min-w-0 flex-1 gap-2">
                        <input type="hidden" name="id" value={resume.id} />
                        <Input
                          name="name"
                          defaultValue={resume.fileName}
                          aria-label={`New name for ${resume.fileName}`}
                          maxLength={120}
                          className="h-8 min-w-0 sm:max-w-xs"
                        />
                        <button
                          type="submit"
                          name="intent"
                          value="rename"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Rename
                        </button>
                      </form>
                      <form action={manageResumeAction} className="flex gap-2">
                        <input type="hidden" name="id" value={resume.id} />
                        {(resume.skillsStatus === "failed" ||
                          resume.skillsStatus === "skipped") && (
                          <button
                            type="submit"
                            name="intent"
                            value="retry"
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Retry skills
                          </button>
                        )}
                        <button
                          type="submit"
                          name="intent"
                          value="delete"
                          aria-label={`Delete ${resume.fileName}`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                            className: "text-[#b91c1c] hover:bg-[#fef2f2] hover:text-[#991b1b]",
                          })}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection
          title="Upload a resume"
          description={full ? "Your library is full" : "Optional. Proof cards count more."}
        >
          {!profile ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-[#737373]">
                You need a profile before you can add resumes.
              </p>
              <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
                Create your profile first
              </Link>
            </div>
          ) : !full ? (
            <UploadResumeForm />
          ) : (
            <p className="text-[13px] text-[#737373]">
              Your library is full. Delete a resume to add another.
            </p>
          )}
        </DashboardSection>
      </div>
    </RoleHome>
  );
}
