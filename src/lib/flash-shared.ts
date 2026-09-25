export const FLASH_COOKIE = "vp-flash";

export type Flash = { id: string; type: "success" | "error" | "info"; message: string };

const TYPES = new Set<Flash["type"]>(["success", "error", "info"]);

/** Parse the flash cookie value; anything malformed is ignored. */
export function parseFlash(raw: string | undefined): Flash | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<Flash>;
    if (
      typeof value.id === "string" &&
      typeof value.message === "string" &&
      value.message.length > 0 &&
      TYPES.has(value.type as Flash["type"])
    ) {
      return {
        id: value.id,
        type: value.type as Flash["type"],
        message: value.message.slice(0, 500),
      };
    }
  } catch {
    // Malformed cookie: ignore it.
  }
  return null;
}
