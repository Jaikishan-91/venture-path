import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.LOKI_URL).toBeUndefined();
    expect(env.SMTP_HOST).toBe("localhost");
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("treats an empty LOKI_URL as unset", () => {
    expect(parseEnv({ ...valid, LOKI_URL: "" }).LOKI_URL).toBeUndefined();
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });

  it("rejects a short BETTER_AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("requires the Google client ID and secret together", () => {
    expect(() => parseEnv({ ...valid, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => parseEnv({ ...valid, GOOGLE_CLIENT_SECRET: "secret" })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
    const env = parseEnv({ ...valid, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    expect(env.GOOGLE_CLIENT_ID).toBe("id");
  });

  it("requires SMTP_USER and SMTP_PASSWORD together", () => {
    expect(() => parseEnv({ ...valid, SMTP_USER: "me@gmail.com" })).toThrow(/SMTP_USER/);
    expect(() => parseEnv({ ...valid, SMTP_PASSWORD: "secret" })).toThrow(/SMTP_USER/);
    expect(parseEnv({ ...valid, SMTP_USER: "", SMTP_PASSWORD: "" }).SMTP_USER).toBeUndefined();
  });

  it("rejects an SMTP_SECURE that isn't a boolean", () => {
    expect(() => parseEnv({ ...valid, SMTP_SECURE: "maybe" })).toThrow(/SMTP_SECURE/);
  });

  it("does not include secret values in the error message", () => {
    const secret = "not-a-url-but-secret";
    let message = "";
    try {
      parseEnv({ ...valid, DATABASE_URL: secret, BETTER_AUTH_SECRET: "short-secret-value" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain(secret);
    expect(message).not.toContain("short-secret-value");
  });
});
