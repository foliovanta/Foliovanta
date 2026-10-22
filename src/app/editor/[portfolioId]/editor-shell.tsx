"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { type ApiError, type PortfolioSummary, getPortfolio } from "@/lib/api/portfolios-client";

const SECTIONS = [
  { key: "profile", label: "Profile", ready: true },
  { key: "projects", label: "Projects", ready: false },
  { key: "experience", label: "Experience", ready: false },
  { key: "education", label: "Education", ready: false },
  { key: "skills", label: "Skills", ready: false },
  { key: "sections", label: "Sections", ready: false },
] as const;

type GuardValue = { setDirty: (dirty: boolean) => void };
const EditorGuardContext = createContext<GuardValue | null>(null);

// Used by editors to flag unsaved changes so in-editor navigation and tab
// close can warn before discarding them. Falls back to a no-op outside the
// shell so an editor can be rendered (and tested) on its own.
const noopGuard: GuardValue = { setDirty: () => {} };

export function useEditorGuard(): GuardValue {
  return useContext(EditorGuardContext) ?? noopGuard;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "ready"; portfolio: PortfolioSummary };

export function EditorShell({
  portfolioId,
  children,
}: {
  portfolioId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dirtyRef = useRef(false);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  useEffect(() => {
    let active = true;
    getPortfolio(portfolioId).then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { kind: "ready", portfolio: result.data }
          : { kind: "error", error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [portfolioId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const navigate = (href: string) => {
    if (href === pathname) return;
    if (
      dirtyRef.current &&
      !window.confirm("You have unsaved changes. Leave this section and discard them?")
    ) {
      return;
    }
    dirtyRef.current = false;
    router.push(href);
  };

  if (state.kind === "loading") {
    return <CenteredMessage title="Loading editor…" />;
  }

  if (state.kind === "error") {
    return <EditorError error={state.error} />;
  }

  const portfolio = state.portfolio;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 font-sans sm:px-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {portfolio.title || portfolio.slug}
          </h1>
        </div>
        <nav aria-label="Editor sections">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((section) => {
              const href = `/editor/${portfolioId}/${section.key}`;
              const active = pathname === href;
              return (
                <li key={section.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(href)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-medium transition ${
                      active
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {section.label}
                    {!section.ready && (
                      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:bg-zinc-700 dark:text-zinc-300">
                        Soon
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        <EditorGuardContext.Provider value={{ setDirty }}>{children}</EditorGuardContext.Provider>
      </section>
    </div>
  );
}

function CenteredMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 text-center font-sans">
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        {title}
      </p>
      {children}
    </main>
  );
}

function EditorError({ error }: { error: ApiError }) {
  const message =
    error.status === 404
      ? "This portfolio doesn't exist or you don't have access to it."
      : error.status === 403
        ? "Your account can't access this portfolio right now."
        : error.message;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 text-center font-sans">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Can&apos;t open editor
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
