"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { type AdminFeedbackListItem, fetchAdminFeedback } from "@/lib/api/admin-client";

import { EmptyState, ErrorState, LoadingRows, Pager, Pill, formatDate } from "../_components/ui";
import { useCursorList } from "../_components/use-cursor-list";

const STATUSES = ["", "OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"];
const CATEGORIES = ["", "BUG", "FEATURE_REQUEST", "USABILITY", "OTHER"];

export function FeedbackDirectoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const category = searchParams.get("category") ?? "";

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
        <Select id="category" label="Category" value={category} options={CATEGORIES} onChange={(v) => setParam({ category: v })} />
      </div>
      <FeedbackList key={`${status}|${category}`} status={status} category={category} />
    </div>
  );
}

function FeedbackList({ status, category }: { status: string; category: string }) {
  const fetcher = useCallback(
    (cursor?: string) =>
      fetchAdminFeedback({ ...(status ? { status } : {}), ...(category ? { category } : {}), ...(cursor ? { cursor } : {}) }),
    [status, category],
  );
  const list = useCursorList<AdminFeedbackListItem>(fetcher);

  return (
    <>
      {list.status === "loading" && <LoadingRows label="Loading feedback…" />}
      {list.status === "error" && <ErrorState message={list.errorMessage ?? "Error"} onRetry={list.retry} />}
      {list.status === "ready" && list.items.length === 0 && (
        <EmptyState title={status || category ? "No feedback matches these filters" : "No feedback yet"} />
      )}
      {list.status === "ready" && list.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="hidden bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase sm:table-header-group dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Feedback</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">From</th>
                <th className="px-4 py-2.5">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.items.map((f) => (
                <tr key={f.id} className="block hover:bg-zinc-50 sm:table-row dark:hover:bg-zinc-900/50">
                  <td className="block px-4 py-2 sm:table-cell sm:py-2.5">
                    <Link href={`/admin/feedback/${f.id}`} className="font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300">
                      {f.preview || "(no text)"}
                    </Link>
                  </td>
                  <td className="block px-4 py-1 sm:table-cell sm:py-2.5"><Pill value={f.category} kind="neutral" /></td>
                  <td className="block px-4 py-1 sm:table-cell sm:py-2.5"><Pill value={f.status} kind="neutral" /></td>
                  <td className="block px-4 py-1 text-zinc-600 sm:table-cell sm:py-2.5 dark:text-zinc-300">{f.submitterName}</td>
                  <td className="block px-4 py-1 pb-3 text-zinc-500 sm:table-cell sm:py-2.5 sm:pb-2.5 dark:text-zinc-400">{formatDate(f.createdAt)}</td>
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
