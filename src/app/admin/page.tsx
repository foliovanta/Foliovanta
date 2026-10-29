import { redirect } from "next/navigation";

import { getAdminOverview } from "@/lib/admin/overview";
import { requirePermission } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en-US");

const STATS: { key: keyof Awaited<ReturnType<typeof getAdminOverview>>; label: string; caption: string }[] = [
  { key: "totalUsers", label: "Users", caption: "Accounts not pending deletion" },
  { key: "activePortfolios", label: "Active portfolios", caption: "Not deleted" },
  { key: "publishedPortfolios", label: "Published", caption: "Publicly visible right now" },
];

export default async function AdminOverviewPage() {
  // The layout already gated access; re-check here so this page is safe even if
  // ever rendered outside the layout, and so the exact permission is explicit.
  const authz = await requirePermission("admin.overview.read");
  if (!authz.ok) {
    redirect(authz.reason === "UNAUTHENTICATED" ? "/sign-in" : "/dashboard");
  }

  const overview = await getAdminOverview();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A snapshot of the platform. Operational tools arrive in later milestones.
        </p>
      </header>

      <section aria-label="Platform counts">
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
          {STATS.map((stat) => (
            <div key={stat.key} className="bg-white p-5 dark:bg-zinc-900">
              <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{stat.label}</dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {numberFormat.format(overview[stat.key])}
              </dd>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{stat.caption}</p>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
