import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
};

describe("parseEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.LOKI_URL).toBeUndefined();
  });

  it("treats an empty LOKI_URL as unset", () => {
    expect(parseEnv({ ...valid, LOKI_URL: "" }).LOKI_URL).toBeUndefined();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });

  it("does not include secret values in the error message", () => {
    const secret = "not-a-url-but-secret";
    let message = "";
    try {
      parseEnv({ ...valid, DATABASE_URL: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(secret);
  });
});
