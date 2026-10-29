"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminApiResult } from "@/lib/api/admin-client";
import type { CursorPage } from "@/lib/admin/pagination";

type Fetcher<Item> = (cursor?: string) => Promise<AdminApiResult<CursorPage<Item>>>;

export type CursorListState<Item> = {
  status: "loading" | "ready" | "error";
  items: Item[];
  errorMessage: string | null;
  canPrev: boolean;
  canNext: boolean;
  next: () => void;
  prev: () => void;
  retry: () => void;
};

/**
 * Drives a cursor-paginated admin list. `fetcher` must be referentially stable
 * per filter set (wrap in useCallback keyed on the filters). Callers remount
 * this hook (via a `key` on the filter set) when filters change, so page/stack
 * state resets on its own. Prev is backed by a cursor stack ("" marks page 1).
 */
export function useCursorList<Item>(fetcher: Fetcher<Item>): CursorListState<Item> {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const currentRef = useRef<string | undefined>(undefined);

  const apply = useCallback((result: AdminApiResult<CursorPage<Item>>, cursor: string | undefined) => {
    if (result.ok) {
      currentRef.current = cursor;
      setItems(result.data.items);
      setNextCursor(result.data.nextCursor);
      setStatus("ready");
    } else {
      setErrorMessage(
        result.error.status === 429
          ? "You're going too fast — wait a moment and retry."
          : (result.error.message ?? "Couldn't load this list."),
      );
      setStatus("error");
    }
  }, []);

  // Load the first page on mount. setState happens only inside the async `.then`,
  // never synchronously in the effect body.
  useEffect(() => {
    let active = true;
    fetcher(undefined).then((result) => {
      if (active) apply(result, undefined);
    });
    return () => {
      active = false;
    };
  }, [fetcher, apply]);

  // Used by event handlers (not effects), so a synchronous "loading" set is fine.
  const load = useCallback(
    (cursor: string | undefined) => {
      setStatus("loading");
      void fetcher(cursor).then((result) => apply(result, cursor));
    },
    [fetcher, apply],
  );

  const next = useCallback(() => {
    if (nextCursor === null) return;
    setStack((s) => [...s, currentRef.current ?? ""]);
    load(nextCursor);
  }, [nextCursor, load]);

  const prev = useCallback(() => {
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    setStack((s) => s.slice(0, -1));
    load(previous === "" ? undefined : previous);
  }, [stack, load]);

  return {
    status,
    items,
    errorMessage,
    canPrev: stack.length > 0,
    canNext: nextCursor !== null,
    next,
    prev,
    retry: () => load(currentRef.current),
  };
}
