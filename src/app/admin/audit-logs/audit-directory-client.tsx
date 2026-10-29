"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { type AdminAuditListItem, fetchAuditLogs } from "@/lib/api/admin-client";

import { EmptyState, ErrorState, LoadingRows, Pager, Pill } from "../_components/ui";
import { useCursorList } from "../_components/use-cursor-list";

const FAMILIES = ["", "moderation", "feedback", "report", "admin", "other"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function AuditDirectoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const family = searchParams.get("family") ?? "";
  const actorUserId = searchParams.get("actorUserId") ?? "";
  const targetType = searchParams.get("targetType") ?? "";
  const correlationId = searchParams.get("correlationId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const [actorDraft, setActorDraft] = useState(actorUserId);
  const [corrDraft, setCorrDraft] = useState(correlationId);

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
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setParam({ actorUserId: actorDraft.trim(), correlationId: corrDraft.trim() });
        }}
      >
        <Select id="family" label="Family" value={family} options={FAMILIES} onChange={(v) => setParam({ family: v })} />
        <Field id="actor" label="Actor ID" value={actorDraft} onChange={setActorDraft} placeholder="user UUID" />
        <Field id="corr" label="Correlation ID" value={corrDraft} onChange={setCorrDraft} />
        <DateField id="from" label="From" value={from} onChange={(v) => setParam({ from: v })} />
        <DateField id="to" label="To" value={to} onChange={(v) => setParam({ to: v })} />
        <button
          type="submit"
          className="min-h-10 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950"
        >
          Apply
        </button>
      </form>

      <AuditList
        key={`${family}|${actorUserId}|${targetType}|${correlationId}|${from}|${to}`}
        family={family}
        actorUserId={actorUserId}
        targetType={targetType}
        correlationId={correlationId}
        from={from}
        to={to}
      />
    </div>
  );
}

function AuditList(props: {
  family: string;
  actorUserId: string;
  targetType: string;
  correlationId: string;
  from: string;
  to: string;
}) {
  const { family, actorUserId, targetType, correlationId, from, to } = props;
  const fetcher = useCallback(
    (cursor?: string) =>
      fetchAuditLogs({
        ...(family ? { family } : {}),
        ...(actorUserId ? { actorUserId } : {}),
        ...(targetType ? { targetType } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    [family, actorUserId, targetType, correlationId, from, to],
  );
  const list = useCursorList<AdminAuditListItem>(fetcher);
  const anyFilter = Boolean(family || actorUserId || targetType || correlationId || from || to);

  return (
    <>
      {list.status === "loading" && <LoadingRows label="Loading audit log…" />}
      {list.status === "error" && <ErrorState message={list.errorMessage ?? "Error"} onRetry={list.retry} />}
      {list.status === "ready" && list.items.length === 0 && (
        <EmptyState title={anyFilter ? "No audit records match these filters" : "No audit records yet"} />
      )}
      {list.status === "ready" && list.items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="hidden bg-zinc-50 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase sm:table-header-group dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Summary</th>
                <th className="px-4 py-2.5">Target</th>
                <th className="px-4 py-2.5">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.items.map((e) => (
                <tr key={e.id} className="block hover:bg-zinc-50 sm:table-row dark:hover:bg-zinc-900/50">
                  <td className="block px-4 py-2 sm:table-cell sm:py-2.5">
                    <Link href={`/admin/audit-logs/${e.id}`} className="font-mono text-xs text-indigo-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-indigo-300">
                      {formatTime(e.createdAt)}
                    </Link>
                  </td>
                  <td className="block px-4 py-1 font-mono text-xs text-zinc-700 sm:table-cell sm:py-2.5 dark:text-zinc-300">{e.action}</td>
                  <td className="block px-4 py-1 text-zinc-600 sm:table-cell sm:py-2.5 dark:text-zinc-400">{e.summary || "—"}</td>
                  <td className="block px-4 py-1 text-zinc-500 sm:table-cell sm:py-2.5 dark:text-zinc-400">
                    {e.targetType ? `${e.targetType}` : "—"}
                  </td>
                  <td className="block px-4 py-1 pb-3 sm:table-cell sm:py-2.5 sm:pb-2.5">
                    <Pill value={e.outcome} kind={e.outcome === "DENIED" || e.outcome === "FAILURE" ? "moderation" : "neutral"} />
                  </td>
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
        {options.map((o) => (<option key={o || "all"} value={o}>{o || "All"}</option>))}
      </select>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-10 w-44 rounded-md border border-zinc-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
    </div>
  );
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
    </div>
  );
}
