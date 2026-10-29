"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { type AdminPortfolioListItem, fetchAdminPortfolios } from "@/lib/api/admin-client";

import { EmptyState, ErrorState, LoadingRows, Pager, Pill, formatDate } from "../_components/ui";
import { useCursorList } from "../_components/use-cursor-list";

const PUBLICATION = ["", "DRAFT", "PUBLISHED", "UNPUBLISHED"];
const MODERATION = ["", "CLEAR", "UNDER_REVIEW", "SUSPENDED"];
const SORTS = ["createdAt", "updatedAt"];

export function PortfoliosDirectoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const publicationStatus = searchParams.get("publicationStatus") ?? "";
  const moderationStatus = searchParams.get("moderationStatus") ?? "";
  const sort = searchParams.get("sort") ?? "createdAt";
  const q = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(q);

  const setParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setParam({ q: searchDraft.trim() });
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="pf-search" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Search
          </label>
          <input
            id="pf-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Portfolio ID, owner ID, or title"
            className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <Select id="publicationStatus" label="Publication" value={publicationStatus} options={PUBLICATION} onChange={(v) => setParam({ publicationStatus: v })} />
        <Select id="moderationStatus" label="Moderation" value={moderationStatus} options={MODERATION} onChange={(v) => setParam({ moderationStatus: v })} />
        <Select id="sort" label="Sort by" value={sort} options={SORTS} onChange={(v) => setParam({ sort: v })} includeAll={false} />
        <button
          type="submit"
          className="min-h-10 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950"
        >
          Search
        </button>
      </form>

      {/* Remount on filter change so pagination state resets cleanly. */}
      <PortfoliosList
        key={`${publicationStatus}|${moderationStatus}|${sort}|${q}`}
        publicationStatus={publicationStatus}
        moderationStatus={moderationStatus}
        sort={sort}
        q={q}
      />
    </div>
  );
}

function PortfoliosList({
  publicationStatus,
  moderationStatus,
  sort,
  q,
}: {
  publicationStatus: string;
  moderationStatus: string;
  sort: string;
  q: string;
}) {
  const fetcher = useCallback(
    (cursor?: string) =>
      fetchAdminPortfolios({
        sort,
        ...(publicationStatus ? { publicationStatus } : {}),
        ...(moderationStatus ? { moderationStatus } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    [publicationStatus, moderationStatus, sort, q],
  );

  const list = useCursorList<AdminPortfolioListItem>(fetcher);
  const hasFilters = Boolean(q || publicationStatus || moderationStatus);

  return (
    <>
      {list.status === "loading" && <LoadingRows label="Loading portfolios…" />}
      {list.status === "error" && <ErrorState message={list.errorMessage ?? "Error"} onRetry={list.retry} />}
      {list.status === "ready" && list.items.length === 0 && (
        <EmptyState
          title={hasFilters ? "No portfolios match these filters" : "No portfolios yet"}
          {...(hasFilters ? { hint: "Adjust the search or filters." } : {})}
        />
      )}
      {list.status === "ready" && list.items.length > 0 && (
        <PortfoliosTable portfolios={list.items} sort={sort} />
      )}

      <Pager
        canPrev={list.canPrev}
        canNext={list.canNext}
        onPrev={list.prev}
        onNext={list.next}
        busy={list.status === "loading"}
      />
    </>
  );
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
  includeAll = true,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {options.map((option) => (
          <option key={option || "all"} value={option}>
            {option ? option.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim() : includeAll ? "All" : option}
          </option>
        ))}
      </select>
    </div>
  );
}

function PortfoliosTable({ portfolios, sort }: { portfolios: AdminPortfolioListItem[]; sort: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead className="hidden bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase sm:table-header-group dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2.5">Title</th>
            <th className="px-4 py-2.5">Owner</th>
            <th className="px-4 py-2.5">Publication</th>
            <th className="px-4 py-2.5">Moderation</th>
            <th className="px-4 py-2.5">Version</th>
            <th className="px-4 py-2.5">{sort === "updatedAt" ? "Updated" : "Created"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {portfolios.map((p) => (
            <tr key={p.id} className="block hover:bg-zinc-50 sm:table-row dark:hover:bg-zinc-900/50">
              <td className="block px-4 py-2 sm:table-cell sm:py-2.5">
                <Link
                  href={`/admin/portfolios/${p.id}`}
                  className="font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300"
                >
                  {p.title || "Untitled portfolio"}
                </Link>
                {p.deleted && <span className="ml-2 align-middle"><Pill value="DELETED" kind="neutral" /></span>}
              </td>
              <td className="block px-4 py-1 sm:table-cell sm:py-2.5">
                <Link
                  href={`/admin/users/${p.ownerId}`}
                  className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  {p.ownerDisplayName}
                </Link>
              </td>
              <td className="block px-4 py-1 sm:table-cell sm:py-2.5">
                <Pill value={p.publicationStatus} kind="publication" />
              </td>
              <td className="block px-4 py-1 sm:table-cell sm:py-2.5">
                <Pill value={p.moderationStatus} kind="moderation" />
              </td>
              <td className="block px-4 py-1 text-zinc-600 sm:table-cell sm:py-2.5 dark:text-zinc-300">
                <span className="text-zinc-400 sm:hidden">Version: </span>
                {p.activeVersionNumber ?? "—"}
              </td>
              <td className="block px-4 py-1 pb-3 text-zinc-500 sm:table-cell sm:py-2.5 sm:pb-2.5 dark:text-zinc-400">
                {formatDate(sort === "updatedAt" ? p.updatedAt : p.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
