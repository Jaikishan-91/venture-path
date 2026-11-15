import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function NotApproved() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-[#e5e5e5] bg-white p-6">
      <span className="flex size-10 items-center justify-center rounded-full bg-[#fffbeb] text-[#b45309]">
        <ShieldAlert aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold text-[#121212]">Approval needed</h2>
        <p className="max-w-lg text-[14px] text-[#737373]">
          Your business needs admin approval before you can post or edit challenges.
        </p>
      </div>
      <Link href="/organisation" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to dashboard
      </Link>
    </section>
  );
}
