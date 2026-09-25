import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicFrame } from "@/components/public-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";
import { chooseRole } from "./actions";

export const metadata: Metadata = { title: "Choose your role · VenturePath" };

export default async function ChooseRolePage() {
  const session = await requireSession();
  if (isRole(session.user.role)) redirect(homePathFor(session.user.role));

  return (
    <PublicFrame>
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>How will you use VenturePath?</CardTitle>
          <CardDescription>You can&apos;t change this later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={chooseRole} className="flex flex-col gap-3">
            <Button type="submit" name="role" value="student">
              I&apos;m a student
            </Button>
            <Button type="submit" name="role" value="msme" variant="outline">
              I&apos;m an MSME (business)
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
    </PublicFrame>
  );
}
