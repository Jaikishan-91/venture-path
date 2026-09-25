import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export async function PublicFrame({
  hero,
  children,
}: {
  hero?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-3.5 py-7">
      <div className="overflow-hidden rounded-[28px] bg-[#f7f7f9] shadow-[0_18px_40px_-28px_rgba(22,24,29,0.28)]">
        {hero ? (
          <section className="bg-[#1f4138] text-[#f4eddd]">{hero}</section>
        ) : (
          <SiteHeader />
        )}
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
