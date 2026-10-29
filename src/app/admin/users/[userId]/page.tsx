import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminUserDetail } from "@/lib/admin/users-directory";
import { getLatestModerationNote } from "@/lib/admin/moderation";
import { resolveAdminActor } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";

import { BackLink, DetailRow, PageHeader, Pill, formatDate } from "../../_components/ui";
import { AccountModerationControls } from "./account-moderation";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const result = await getAdminUserDetail(userId);

  if (!result.ok) {
    if ("failure" in result) {
      redirect(result.failure.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
    }
    notFound();
  }

  const user = result.user;
  const [actor, note] = await Promise.all([
    resolveAdminActor(),
    getLatestModerationNote("user", user.id),
  ]);
  const canSuspend = actor.ok && can(actor.actor.role, "admin.users.suspend");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/admin/users">← Users</BackLink>
        <PageHeader title={user.displayName} description="Account overview. Read-only." />
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
          <DetailRow label="User ID">
            <span className="font-mono text-xs">{user.id}</span>
          </DetailRow>
          <DetailRow label="Public URL base">
            <span className="font-mono text-xs">/{user.publicSlug}/{user.username}</span>
          </DetailRow>
          <DetailRow label="Role">
            <Pill value={user.role} kind="role" />
          </DetailRow>
          <DetailRow label="Account status">
            <Pill value={user.status} kind="status" />
          </DetailRow>
          <DetailRow label="Email on file">{user.hasEmail ? "Yes" : "No"}</DetailRow>
          <DetailRow label="Created">{formatDate(user.createdAt)}</DetailRow>
          <DetailRow label="Updated">{formatDate(user.updatedAt)}</DetailRow>
          {user.deletionPending && (
            <DetailRow label="Deletion">
              Pending{user.clerkDeletedAt ? ` · requested ${formatDate(user.clerkDeletedAt)}` : ""}
            </DetailRow>
          )}
        </dl>
      </section>

      <AccountModerationControls
        userId={user.id}
        status={user.status}
        role={user.role}
        canSuspend={canSuspend}
        note={note ? { reason: note.reason, at: note.at } : null}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Portfolios ({user.portfolios.length})
        </h2>
        {user.portfolios.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">This account has no portfolios.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {user.portfolios.map((portfolio) => (
              <li
                key={portfolio.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <Link
                  href={`/admin/portfolios/${portfolio.id}`}
                  className="min-w-0 font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300"
                >
                  {portfolio.title || "Untitled portfolio"}
                </Link>
                <span className="flex items-center gap-2">
                  <Pill value={portfolio.publicationStatus} kind="publication" />
                  <Pill value={portfolio.moderationStatus} kind="moderation" />
                  {portfolio.deleted && <Pill value="DELETED" kind="neutral" />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
