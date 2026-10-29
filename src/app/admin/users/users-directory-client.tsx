"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { type AdminUserListItem, fetchAdminUsers } from "@/lib/api/admin-client";

import { EmptyState, ErrorState, LoadingRows, Pager, Pill, formatDate } from "../_components/ui";
import { useCursorList } from "../_components/use-cursor-list";

const ROLES = ["", "USER", "ADMIN", "SUPER_ADMIN"];
const STATUSES = ["", "ACTIVE", "SUSPENDED", "DELETION_PENDING"];

export function UsersDirectoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const role = searchParams.get("role") ?? "";
  const status = searchParams.get("status") ?? "";
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
          <label htmlFor="user-search" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Search
          </label>
          <input
            id="user-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="User ID, public slug, or name"
            className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <Select id="role" label="Role" value={role} options={ROLES} onChange={(v) => setParam({ role: v })} />
        <Select id="status" label="Status" value={status} options={STATUSES} onChange={(v) => setParam({ status: v })} />
        <button
          type="submit"
          className="min-h-10 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950"
        >
          Search
        </button>
      </form>

      {/* Remount on filter change so pagination state resets cleanly. */}
      <UsersList key={`${role}|${status}|${q}`} role={role} status={status} q={q} />
    </div>
  );
}

function UsersList({ role, status, q }: { role: string; status: string; q: string }) {
  const fetcher = useCallback(
    (cursor?: string) =>
      fetchAdminUsers({
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    [role, status, q],
  );

  const list = useCursorList<AdminUserListItem>(fetcher);
  const hasFilters = Boolean(q || role || status);

  return (
    <>
      {list.status === "loading" && <LoadingRows label="Loading users…" />}
      {list.status === "error" && <ErrorState message={list.errorMessage ?? "Error"} onRetry={list.retry} />}
      {list.status === "ready" && list.items.length === 0 && (
        <EmptyState
          title={hasFilters ? "No users match these filters" : "No users yet"}
          {...(hasFilters ? { hint: "Adjust the search or filters." } : {})}
        />
      )}
      {list.status === "ready" && list.items.length > 0 && <UsersTable users={list.items} />}

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
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
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
          <option key={option} value={option}>
            {option ? option.replace(/_/g, " ") : "All"}
          </option>
        ))}
      </select>
    </div>
  );
}

function UsersTable({ users }: { users: AdminUserListItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead className="hidden bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase sm:table-header-group dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Portfolios</th>
            <th className="px-4 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {users.map((user) => (
            <tr key={user.id} className="block hover:bg-zinc-50 sm:table-row dark:hover:bg-zinc-900/50">
              <td className="block px-4 py-2 sm:table-cell sm:py-2.5">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300"
                >
                  {user.displayName}
                </Link>
                <span className="block font-mono text-xs text-zinc-400">/{user.publicSlug}/{user.username}</span>
              </td>
              <td className="block px-4 py-1 sm:table-cell sm:py-2.5">
                <Pill value={user.role} kind="role" />
              </td>
              <td className="block px-4 py-1 sm:table-cell sm:py-2.5">
                <Pill value={user.status} kind="status" />
              </td>
              <td className="block px-4 py-1 text-zinc-600 sm:table-cell sm:py-2.5 dark:text-zinc-300">
                <span className="text-zinc-400 sm:hidden">Portfolios: </span>
                {user.portfolioCount}
              </td>
              <td className="block px-4 py-1 pb-3 text-zinc-500 sm:table-cell sm:py-2.5 sm:pb-2.5 dark:text-zinc-400">
                {formatDate(user.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
