import { getDb } from "./db";
import { getLogger } from "./logger";
import { signupRoleSchema } from "./roles";

/**
 * The only path that writes `User.role` from user input. It accepts student/msme only and never
 * overwrites a role that is already set. Returns true if the role was assigned.
 */
export async function assignInitialRole(userId: string, role: unknown): Promise<boolean> {
  const parsed = signupRoleSchema.safeParse(role);
  if (!parsed.success) return false;

  const { count } = await getDb().user.updateMany({
    where: { id: userId, role: null },
    data: { role: parsed.data },
  });

  if (count === 1) {
    getLogger().info({ userId, role: parsed.data }, "initial role assigned");
  }
  return count === 1;
}
