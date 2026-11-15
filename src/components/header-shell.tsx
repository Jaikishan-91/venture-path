"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Sticky header that floats once the page scrolls: full-width and borderless at the top, then an
 * inset, blurred bar with a hairline border and soft shadow.
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="group/header sticky top-0 z-40 px-0 pt-[env(safe-area-inset-top,0px)] transition-[padding] duration-300 ease-out data-scrolled:px-2 data-scrolled:pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] md:data-scrolled:px-4"
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[1280px] border border-transparent transition-[background-color,border-color,box-shadow,border-radius,max-width] duration-300 ease-out",
          "group-data-scrolled/header:max-w-[1180px] group-data-scrolled/header:rounded-xl group-data-scrolled/header:border-[#e5e5e5] group-data-scrolled/header:bg-white/80 group-data-scrolled/header:shadow-[0_6px_24px_-12px_rgb(0_0_0/0.18)] group-data-scrolled/header:backdrop-blur-lg",
        )}
      >
        {children}
      </div>
    </header>
  );
}

/** Header link that marks the current section. */
export function HeaderNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-[14px] font-medium transition-colors duration-200",
        active ? "bg-[#f5f5f5] text-[#121212]" : "text-[#525252] hover:text-[#121212]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
