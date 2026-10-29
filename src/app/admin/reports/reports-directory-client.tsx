"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { type AdminReportListItem, fetchAdminReports } from "@/lib/api/admin-client";

import { EmptyState, ErrorState, LoadingRows, Pager, Pill, formatDate } from "../_components/ui";
import { useCursorList } from "../_components/use-cursor-list";

const STATUSES = ["", "OPEN", "IN_REVIEW", "ACTIONED", "DISMISSED"];
const REASONS = ["", "HARASSMENT", "IMPERSONATION", "SPAM", "INAPPROPRIATE", "IP_CONCERN", "OTHER"];

export function ReportsDirectoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const reason = searchParams.get("reason") ?? "";

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select id="status" label="Status" value={status} options={STATUSES} onChange={(v) => setParam({ status: v })} />
        <Select id="reason" label="Reason" value={reason} options={REASONS} onChange={(v) => setParam({ reason: v })} />
      </div>
      <ReportsList key={`${status}|${reason}`} status={status} reason={reason} />
    </div>
  );
}

function ReportsList({ status, reason }: { status: string; reason: string }) {
  const fetcher = useCallback(
    (cursor?: string) =>
      fetchAdminReports({ ...(status ? { status } : {}), ...(reason ? { reason } : {}), ...(cursor ? { cursor } : {}) }),
    [status, reason],
  );
  const list = useCursorList<AdminReportListItem>(fetcher);

  return (
    <>
      {list.status === "loading" && <LoadingRows label="Loading reports…" />}
      {list.status === "error" && <ErrorState message={list.errorMessage ?? "Error"} onRetry={list.retry} />}
      {list.status === "ready" && list.items.length === 0 && (
        <EmptyState title={status || reason ? "No reports match these filters" : "No reports yet"} />
      )}
      {list.status === "ready" && list.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="hidden bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase sm:table-header-group dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Reporter</th>
                <th className="px-4 py-2.5">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.items.map((r) => (
                <tr key={r.id} className="block hover:bg-zinc-50 sm:table-row dark:hover:bg-zinc-900/50">
                  <td className="block px-4 py-2 sm:table-cell sm:py-2.5">
                    <Link href={`/admin/reports/${r.id}`} className="font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300">
                      {r.reason.replace(/_/g, " ")}
                    </Link>
                  </td>
                  <td className="block px-4 py-1 sm:table-cell sm:py-2.5"><Pill value={r.status} kind="neutral" /></td>
                  <td className="block px-4 py-1 text-zinc-600 capitalize sm:table-cell sm:py-2.5 dark:text-zinc-300">{r.reporter}</td>
                  <td className="block px-4 py-1 pb-3 text-zinc-500 sm:table-cell sm:py-2.5 sm:pb-2.5 dark:text-zinc-400">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager canPrev={list.canPrev} canNext={list.canNext} onPrev={list.prev} onNext={list.next} busy={list.status === "loading"} />
    </>
  );
}

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        {options.map((o) => (<option key={o || "all"} value={o}>{o ? o.replace(/_/g, " ") : "All"}</option>))}
      </select>
    </div>
  );
}
