/** Parse the single JSON object an LLM was asked for, tolerating Markdown code fences. */
export function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content.trim().replace(/```(?:json)?\n?|\n?```/g, ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Non-empty trimmed strings from an LLM array field, capped. Anything else → []. */
export const stringList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is string | number => typeof item === "string" || typeof item === "number",
        )
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Wrap user- or organisation-supplied text as data for the LLM, removing any copy of the tag. */
export function asData(tag: string, text: string, maxChars: number): string {
  const tagPattern = new RegExp(String.raw`</?${tag}\b[^>]*>`, "gi");
  return `<${tag}>\n${text.slice(0, maxChars).replace(tagPattern, "")}\n</${tag}>`;
}
