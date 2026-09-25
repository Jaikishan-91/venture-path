import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WORK_MODE_LABELS, formatPay, isDeadlinePassed } from "@/lib/opportunity-schemas";
import { getVisibleOpportunity } from "@/lib/search";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const opportunity = await getVisibleOpportunity((await params).id);
  return {
    title: opportunity ? `${opportunity.title} · VenturePath` : "Opportunity · VenturePath",
  };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const opportunity = await getVisibleOpportunity((await params).id);
  if (!opportunity) notFound();
  const business = opportunity.msmeProfile;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/opportunities" className="text-sm underline">
        All opportunities
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{opportunity.title}</h1>
        <p className="text-sm text-muted-foreground">
          {opportunity.type === "internship" ? "Internship" : "Freelance"} ·{" "}
          {formatPay(opportunity)} · {WORK_MODE_LABELS[opportunity.workMode]}
          {opportunity.city && `, ${opportunity.city}`}
          {opportunity.duration && ` · ${opportunity.duration}`}
        </p>
      </header>

      {opportunity.deadline && (
        <p className="text-sm text-muted-foreground">
          Apply by{" "}
          {opportunity.deadline.toLocaleDateString("en-IN", {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
          {isDeadlinePassed(opportunity.deadline) && " · Deadline passed"}
        </p>
      )}
      {opportunity.skills.length > 0 && (
        <ul aria-label="Skills" className="flex flex-wrap gap-2 text-sm">
          {opportunity.skills.map((skill) => (
            <li key={skill} className="rounded-md bg-muted px-2 py-0.5">
              {skill}
            </li>
          ))}
        </ul>
      )}
      <p className="whitespace-pre-line text-sm">{opportunity.description}</p>

      <Card>
        <CardHeader>
          <CardTitle>{business.businessName}</CardTitle>
          <CardDescription>
            {business.industry} · {business.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="whitespace-pre-line">{business.description}</p>
          {business.website && (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all underline"
            >
              {business.website}
            </a>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
