import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/authz";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">VenturePath</h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Freelance work and internships from MSMEs, for students.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/opportunities" className={buttonVariants({ variant: "outline" })}>
          Browse opportunities
        </Link>
        {session ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/sign-up" className={buttonVariants()}>
              Sign up
            </Link>
            <Link href="/sign-in" className={buttonVariants({ variant: "outline" })}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
