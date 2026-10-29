import Link from "next/link";

const PILL_BASE = "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium";
const NEUTRAL = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
const GREEN = "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300";
const AMBER = "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
const RED = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";

const PUBLICATION_TONE: Record<string, string> = {
  PUBLISHED: GREEN,
  DRAFT: NEUTRAL,
  UNPUBLISHED: AMBER,
};
const MODERATION_TONE: Record<string, string> = {
  CLEAR: NEUTRAL,
  UNDER_REVIEW: AMBER,
  SUSPENDED: RED,
};
const STATUS_TONE: Record<string, string> = {
  ACTIVE: GREEN,
  SUSPENDED: RED,
  DELETION_PENDING: AMBER,
};
const ROLE_TONE: Record<string, string> = {
  USER: NEUTRAL,
  ADMIN: AMBER,
  SUPER_ADMIN: RED,
};

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export function Pill({ value, kind }: { value: string; kind: "publication" | "moderation" | "status" | "role" | "neutral" }) {
  const tone =
    kind === "publication"
      ? (PUBLICATION_TONE[value] ?? NEUTRAL)
      : kind === "moderation"
        ? (MODERATION_TONE[value] ?? NEUTRAL)
        : kind === "status"
          ? (STATUS_TONE[value] ?? NEUTRAL)
          : kind === "role"
            ? (ROLE_TONE[value] ?? NEUTRAL)
            : NEUTRAL;
  return (
    <span className={`${PILL_BASE} ${tone}`}>
      <span className="capitalize">{label(value)}</span>
    </span>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      )}
    </header>
  );
}

export function LoadingRows({ label: text = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-2 p-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
      ))}
      <span className="sr-only">{text}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-800 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/50"
      >
        Try again
      </button>
    </div>
  );
}

export function Pager({
  canPrev,
  canNext,
  onPrev,
  onNext,
  busy,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const btn =
    "inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-2">
      <button type="button" className={btn} onClick={onPrev} disabled={!canPrev || busy}>
        ← Previous
      </button>
      <button type="button" className={btn} onClick={onNext} disabled={!canNext || busy}>
        Next →
      </button>
    </nav>
  );
}

export function DetailRow({ label: term, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{term}</dt>
      <dd className="text-sm break-words text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      {children}
    </Link>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
