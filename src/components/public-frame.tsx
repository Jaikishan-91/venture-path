import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Public pages: sticky header, a centred content column, footer. `hero` renders full-width above it. */
export async function PublicFrame({
  hero,
  children,
}: {
  hero?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />
      {hero}
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
