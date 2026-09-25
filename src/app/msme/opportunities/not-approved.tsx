import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NotApproved() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval needed</CardTitle>
        <CardDescription>
          Your business needs admin approval before you can create or edit listings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/msme" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
