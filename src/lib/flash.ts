import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { FLASH_COOKIE, parseFlash, type Flash } from "./flash-shared";

/**
 * Queue a toast for the next render (NFR-3). Call it from a server action before `redirect()` or
 * `revalidatePath()`; the root layout reads the cookie and `AppToaster` shows it once.
 */
export async function flash(type: Flash["type"], message: string): Promise<void> {
  const value: Flash = { id: randomUUID(), type, message };
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify(value)), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    // The browser deletes it after showing the toast.
    httpOnly: false,
  });
}

export async function readFlash(): Promise<Flash | null> {
  return parseFlash((await cookies()).get(FLASH_COOKIE)?.value);
}
