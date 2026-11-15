import { buttonVariants } from "@/components/ui/button";
import type { MemberStatus, MemberView } from "@/lib/hiring/types";
import { memberAction, reinviteAction } from "./actions";

const STATUS_STYLES: Record<MemberStatus | "expired", { label: string; className: string }> = {
  invited: { label: "Invited", className: "bg-[#fffbeb] text-[#b45309]" },
  active: { label: "Active", className: "bg-[#f0fdf4] text-[#15803d]" },
  deactivated: { label: "Deactivated", className: "bg-[#f5f5f5] text-[#737373]" },
  expired: { label: "Expired", className: "bg-[#fef2f2] text-[#b91c1c]" },
};

function MemberStatusPill({ member }: { member: MemberView }) {
  const style = STATUS_STYLES[member.expired ? "expired" : member.status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}

const formatDate = (date: Date | null) =>
  date === null
    ? "-"
    : date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-[#fafafa] text-[12px] font-semibold text-[#404040]"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

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
          <button
            type="submit"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "text-[#b91c1c] hover:bg-[#fef2f2] hover:text-[#b91c1c]",
            })}
          >
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
        <button
          type="submit"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "text-[#b91c1c] hover:bg-[#fef2f2] hover:text-[#b91c1c]",
          })}
        >
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
    return (
      <p className="rounded-lg border border-dashed border-[#d4d4d4] px-4 py-8 text-center text-sm text-[#737373]">
        No hiring managers invited yet.
      </p>
    );
  }

  return (
    <>
      <div className="-mx-5 -my-5 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#f0f0f0] bg-[#fafafa] text-[12px] text-[#737373]">
              <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">
                Name
              </th>
              <th scope="col" className="py-2.5 pr-3 font-medium">
                Status
              </th>
              <th scope="col" className="py-2.5 pr-3 font-medium">
                Invited
              </th>
              <th scope="col" className="py-2.5 pr-3 font-medium">
                Accepted
              </th>
              <th scope="col" className="py-2.5 pr-5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-[#f0f0f0] last:border-0">
                <td className="max-w-[320px] py-3 pr-3 pl-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={member.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#121212]">{member.name}</p>
                      <p className="truncate text-[12px] text-[#737373]">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <MemberStatusPill member={member} />
                </td>
                <td className="py-3 pr-3 whitespace-nowrap text-[#737373]">
                  {formatDate(member.invitedAt)}
                </td>
                <td className="py-3 pr-3 whitespace-nowrap text-[#737373]">
                  {formatDate(member.acceptedAt)}
                </td>
                <td className="py-3 pr-5">
                  <div className="flex justify-end">
                    <MemberActions member={member} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="-my-2 flex flex-col divide-y divide-[#f0f0f0] md:hidden">
        {members.map((member) => (
          <li key={member.id} className="min-w-0 py-3">
            <div className="flex items-start gap-3">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-[#121212]">{member.name}</p>
                  <MemberStatusPill member={member} />
                </div>
                <p className="mt-0.5 truncate text-xs text-[#737373]">{member.email}</p>
                <p className="mt-0.5 text-xs text-[#737373]">
                  Invited {formatDate(member.invitedAt)} · Accepted {formatDate(member.acceptedAt)}
                </p>
                <div className="mt-2">
                  <MemberActions member={member} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
