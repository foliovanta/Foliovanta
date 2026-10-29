export default function AdminLoading() {
  return (
    <div role="status" className="flex flex-col gap-8">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white p-5 dark:bg-zinc-900">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading admin overview…</span>
    </div>
  );
}
