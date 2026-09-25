import type { Metadata } from "next";
import Link from "next/link";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/authz";
import { getStudentProfile } from "@/lib/profiles";

export const metadata: Metadata = { title: "Student · VenturePath" };

export default async function StudentHomePage() {
  const session = await requireRole("student");
  const profile = await getStudentProfile(session.user.id);

  return (
    <RoleHome title="Student dashboard" name={session.user.name}>
      <Link
        href="/opportunities"
        className={buttonVariants({ variant: "outline", className: "self-start" })}
      >
        Browse opportunities
      </Link>
      <Link
        href="/student/applications"
        className={buttonVariants({ variant: "outline", className: "self-start" })}
      >
        Your applications
      </Link>
      {profile ? (
        <Card>
          <CardHeader>
            <CardTitle>{session.user.name}</CardTitle>
            <CardDescription>
              {profile.course}, {profile.institution} · Class of {profile.graduationYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {profile.skills.length > 0 && (
              <ul aria-label="Skills" className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <li key={skill} className="rounded-md bg-muted px-2 py-0.5">
                    {skill}
                  </li>
                ))}
              </ul>
            )}
            {profile.bio && <p className="whitespace-pre-line">{profile.bio}</p>}
            {profile.links.length > 0 && (
              <ul className="flex flex-col gap-1">
                {profile.links.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all underline"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/student/profile"
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Edit profile
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Complete your profile</CardTitle>
            <CardDescription>
              Tell MSMEs where you study and what you can do. You&apos;ll need a profile to apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/student/profile" className={buttonVariants()}>
              Create profile
            </Link>
          </CardContent>
        </Card>
      )}
    </RoleHome>
  );
}
