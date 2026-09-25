import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { homePathFor, isRole } from "@/lib/roles";

export default async function DashboardPage() {
  const session = await requireSession();
  const role = session.user.role;
  redirect(homePathFor(isRole(role) ? role : null));
}
