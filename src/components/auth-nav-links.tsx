"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Area = "user" | "organisation" | "admin" | null;

/** Which sign-in/sign-up area the visitor is on, if any. */
export function authArea(pathname: string): Area {
  if (/^\/organisation\/sign-(in|up)$/.test(pathname)) return "organisation";
  if (/^\/admin\/sign-in$/.test(pathname)) return "admin";
  if (/^\/sign-(in|up)$/.test(pathname)) return "user";
  return null;
}

/** Header links for signed-out visitors, without a link to the area they are already in. */
export function HeaderAuthLinks({
  linkClass,
  signInClass,
}: {
  linkClass: string;
  signInClass: string;
}) {
  const area = authArea(usePathname());
  return (
    <>
      {area !== "organisation" && (
        <Link href="/organisation/sign-in" className={linkClass}>
          For organisations
        </Link>
      )}
      {area !== "user" && (
        <Link href="/sign-in" className={signInClass}>
          {area === "organisation" ? "User sign in" : "Sign in"}
        </Link>
      )}
    </>
  );
}

/** Footer links, hiding the one for the current page's area. */
export function FooterAuthLinks({ className }: { className: string }) {
  const area = authArea(usePathname());
  return (
    <>
      {area !== "user" && (
        <Link href="/sign-up" className={className}>
          Sign up
        </Link>
      )}
      {area !== "organisation" && (
        <Link href="/organisation/sign-up" className={className}>
          Organisations
        </Link>
      )}
      {area !== "admin" && (
        <Link href="/admin/sign-in" className={className}>
          Admin
        </Link>
      )}
    </>
  );
}
