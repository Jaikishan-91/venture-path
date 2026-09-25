import { describe, expect, it } from "vitest";
import { isReservedAddress, smtpOptions, usesMailCatcher } from "@/lib/email";
import { parseEnv } from "@/lib/env";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("isReservedAddress", () => {
  it.each([
    ["a@e2e.venturepath.local", true],
    ["a@x.TEST", true],
    ["a@foo.example", true],
    ["a@bar.invalid", true],
    ["someone@gmail.com", false],
    ["someone@local.com", false],
  ])("%s -> %s", (address, expected) => {
    expect(isReservedAddress(address)).toBe(expected);
  });
});

describe("smtpOptions", () => {
  it("uses no auth or TLS for the local mail catcher defaults", () => {
    expect(smtpOptions(parseEnv(base))).toEqual({
      host: "localhost",
      port: 1025,
      secure: false,
      auth: undefined,
      requireTLS: false,
    });
  });

  it("uses implicit TLS on port 465 (Gmail)", () => {
    const env = parseEnv({
      ...base,
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_USER: "me@gmail.com",
      SMTP_PASSWORD: "app-password",
    });
    expect(smtpOptions(env)).toMatchObject({
      host: "smtp.gmail.com",
      secure: true,
      auth: { user: "me@gmail.com", pass: "app-password" },
      requireTLS: false,
    });
  });

  it("requires STARTTLS when credentials are sent on a non-TLS port", () => {
    const env = parseEnv({ ...base, SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASSWORD: "p" });
    expect(smtpOptions(env)).toMatchObject({ secure: false, requireTLS: true });
  });

  it("lets SMTP_SECURE override the port default", () => {
    expect(smtpOptions(parseEnv({ ...base, SMTP_SECURE: "true" })).secure).toBe(true);
  });
});

describe("usesMailCatcher", () => {
  it("routes reserved addresses to the catcher outside production", () => {
    const env = parseEnv(base);
    expect(usesMailCatcher("a@e2e.venturepath.local", env)).toBe(true);
    expect(usesMailCatcher("someone@gmail.com", env)).toBe(false);
  });

  it("never uses the catcher in production", () => {
    const env = parseEnv({ ...base, NODE_ENV: "production" });
    expect(usesMailCatcher("a@e2e.venturepath.local", env)).toBe(false);
  });
});
