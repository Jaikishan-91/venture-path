import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { getDb } from "../src/lib/db";

const seedEnvSchema = z.object({
  ADMIN_EMAIL: z.email().transform((email) => email.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12),
});

async function seedAdmin() {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 characters) in .env. Invalid: ${fields}`,
    );
  }
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = parsed.data;
  const db = getDb();

  const existing = await db.user.findUnique({ where: { email }, select: { role: true } });
  if (existing) {
    if (existing.role !== "admin") {
      throw new Error("A non-admin user already has ADMIN_EMAIL; refusing to promote it.");
    }
    console.log("Admin already exists; nothing to do.");
    return;
  }

  const userId = randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Admin",
      email,
      emailVerified: true,
      role: "admin",
      accounts: {
        create: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  console.log("Admin created.");
}

seedAdmin()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => getDb().$disconnect());
