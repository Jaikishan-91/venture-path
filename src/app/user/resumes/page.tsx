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

export const metadata: Metadata = { title: "Your resumes · VenturePath" };

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

  return (
    <RoleHome title="Your resumes" name={session.user.name}>
      <RefreshWhilePending pending={resumes.some((resume) => resume.skillsStatus === "pending")} />
      <DashboardSection title={`Library (${resumes.length}/${MAX_LIBRARY_RESUMES})`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#4a4d53]">
            Keep up to {MAX_LIBRARY_RESUMES} resumes and choose one for each application. We read
            the skills from each resume to recommend jobs.
          </p>
          {!profile ? (
            <Link href="/user/profile" className={buttonVariants({ className: "self-start" })}>
              Create your profile first
            </Link>
          ) : resumes.length < MAX_LIBRARY_RESUMES ? (
            <UploadResumeForm />
          ) : (
            <p className="text-sm text-[#4a4d53]">
              Your library is full. Delete a resume to add another.
            </p>
          )}
        </div>
      </DashboardSection>

      {resumes.length === 0 ? (
        <EmptyState>No resumes yet.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Resumes">
          {resumes.map((resume) => {
            const status = STATUS_TEXT[resume.skillsStatus];
            return (
              <li
                key={resume.id}
                aria-label={resume.fileName}
                className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#ecedef]"
              >
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={`/api/resumes/${resume.id}`}
                    className="min-w-0 truncate font-medium text-[#1b2a26] underline-offset-4 hover:underline"
                  >
                    {resume.fileName}
                  </a>
                  <span className="text-xs text-[#4a4d53]">
                    Added {formatDate(resume.createdAt)}
                  </span>
                </div>
                {resume.skills.length > 0 ? (
                  <ul aria-label="Skills" className="flex flex-wrap gap-1.5 text-xs">
                    {resume.skills.map((skill) => (
                      <li key={skill} className="rounded-md bg-muted px-2 py-0.5">
                        {skill}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#4a4d53]">{status ?? "-"}</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <form action={manageResumeAction} className="flex min-w-0 gap-2">
                    <input type="hidden" name="id" value={resume.id} />
                    <Input
                      name="name"
                      defaultValue={resume.fileName}
                      aria-label={`New name for ${resume.fileName}`}
                      maxLength={120}
                      className="min-w-0"
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
                    {(resume.skillsStatus === "failed" || resume.skillsStatus === "skipped") && (
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
                      className={buttonVariants({ variant: "outline", size: "sm" })}
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
    </RoleHome>
  );
}
