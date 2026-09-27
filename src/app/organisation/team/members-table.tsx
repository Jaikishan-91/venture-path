import { buttonVariants } from "@/components/ui/button";
import type { MemberStatus, MemberView } from "@/lib/hiring/types";
import { memberAction, reinviteAction } from "./actions";

const STATUS_STYLES: Record<MemberStatus | "expired", { label: string; className: string }> = {
  invited: { label: "Invited", className: "bg-[#fbf3e6] text-[#7a5212]" },
  active: { label: "Active", className: "bg-[#e3efe8] text-[#26594a]" },
  deactivated: { label: "Deactivated", className: "bg-[#f0f1f3] text-[#4a4d53]" },
  expired: { label: "Expired", className: "bg-[#f7e6e2] text-[#a24b3a]" },
};

function MemberStatusPill({ member }: { member: MemberView }) {
  const style = STATUS_STYLES[member.expired ? "expired" : member.status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}

const formatDate = (date: Date | null) =>
  date === null
    ? "-"
    : date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function MemberActions({ member }: { member: MemberView }) {
  if (member.status === "invited") {
    return (
      <div className="flex flex-wrap gap-2">
        <form action={memberAction}>
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="op" value="resend" />
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Resend
          </button>
        </form>
        <form action={memberAction}>
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="op" value="revoke" />
          <button type="submit" className={buttonVariants({ variant: "destructive", size: "sm" })}>
            Revoke
          </button>
        </form>
      </div>
    );
  }

  if (member.status === "active") {
    return (
      <form action={memberAction}>
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="op" value="deactivate" />
        <button type="submit" className={buttonVariants({ variant: "destructive", size: "sm" })}>
          Deactivate
        </button>
      </form>
    );
  }

  return (
    <form action={reinviteAction}>
      <input type="hidden" name="name" value={member.name} />
      <input type="hidden" name="email" value={member.email} />
      <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Invite again
      </button>
    </form>
  );
}

export function MembersTable({ members }: { members: MemberView[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-[#4a4d53]">No hiring managers invited yet.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#ecedef] text-xs tracking-wide text-[#4a4d53] uppercase">
              <th scope="col" className="py-2 pr-3 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Email
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Invited
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Accepted
              </th>
              <th scope="col" className="py-2 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-[#ecedef] last:border-0">
                <td className="max-w-[180px] truncate py-2 pr-3">{member.name}</td>
                <td className="max-w-[220px] truncate py-2 pr-3 text-[#4a4d53]">{member.email}</td>
                <td className="py-2 pr-3">
                  <MemberStatusPill member={member} />
                </td>
                <td className="py-2 pr-3 text-[#4a4d53]">{formatDate(member.invitedAt)}</td>
                <td className="py-2 pr-3 text-[#4a4d53]">{formatDate(member.acceptedAt)}</td>
                <td className="py-2">
                  <MemberActions member={member} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <li key={member.id} className="min-w-0 rounded-xl bg-[#f7f7f9] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-[#1b2a26]">{member.name}</p>
              <MemberStatusPill member={member} />
            </div>
            <p className="mt-1 truncate text-xs text-[#4a4d53]">{member.email}</p>
            <p className="mt-1 text-xs text-[#4a4d53]">
              Invited {formatDate(member.invitedAt)} · Accepted {formatDate(member.acceptedAt)}
            </p>
            <div className="mt-2">
              <MemberActions member={member} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
