"use client";

import { useEffect, useState } from "react";

import type { ApiError, ApiResult } from "@/lib/api/portfolios-client";
import { useEditorGuard } from "./editor-shell";

// Normalized result shapes so the hook is agnostic to each domain's response
// key (projects / experiences / education). Editors adapt their client calls.
export type DraftListResult<Item> = ApiResult<{ items: Item[]; revision: string }>;
export type DraftItemResult<Item> = ApiResult<{ item: Item; revision: string }>;
export type DraftDeleteResult = ApiResult<{ deletedId: string; revision: string }>;

export type DraftCollectionApi<Item, Fields> = {
  list: (portfolioId: string) => Promise<DraftListResult<Item>>;
  create: (
    portfolioId: string,
    input: Fields & { expectedRevision: string },
  ) => Promise<DraftItemResult<Item>>;
  update: (
    portfolioId: string,
    id: string,
    input: Fields & { expectedRevision: string },
  ) => Promise<DraftItemResult<Item>>;
  remove: (portfolioId: string, id: string, expectedRevision: string) => Promise<DraftDeleteResult>;
  reorder: (
    portfolioId: string,
    expectedRevision: string,
    ids: string[],
  ) => Promise<DraftListResult<Item>>;
};

export type DraftFormState<Item> =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; item: Item };

type Identifiable = { id: string; position: number };

function fieldErrorsFrom(details: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof details === "object" && details !== null) {
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === "string") result[key] = value[0];
    }
  }
  return result;
}

const sortItems = <Item extends Identifiable>(items: Item[]) =>
  [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

/**
 * Shared draft-collection orchestration for position-ordered content editors
 * (projects, experience, education): load, portfolio-level revision, optimistic
 * concurrency, open/create/edit form state, confirm-delete, and reorder.
 *
 * Domain-specific forms, validation and row rendering stay in each editor.
 * API errors and 409 conflicts are surfaced explicitly — never swallowed.
 */
export function useDraftCollection<Item extends Identifiable, Fields>(
  portfolioId: string,
  api: DraftCollectionApi<Item, Fields>,
) {
  const { setDirty } = useEditorGuard();
  // `api` must be a stable (module-level) object so it doesn't retrigger the
  // load effect; all editors define it as a module constant.

  const [load, setLoad] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [revision, setRevision] = useState("0");
  const [conflict, setConflict] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const [form, setForm] = useState<DraftFormState<Item>>({ mode: "closed" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    api.list(portfolioId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setItems(sortItems(result.data.items));
        setRevision(result.data.revision);
        setLoad("ready");
      } else {
        setLoadError(result.error);
        setLoad("error");
      }
    });
    return () => {
      active = false;
    };
  }, [portfolioId, api]);

  const refetch = async () => {
    const result = await api.list(portfolioId);
    if (result.ok) {
      setItems(sortItems(result.data.items));
      setRevision(result.data.revision);
      setLoad("ready");
    } else {
      setLoadError(result.error);
      setLoad("error");
    }
  };

  const openCreate = () => setForm({ mode: "create" });
  const openEdit = (item: Item) => setForm({ mode: "edit", item });

  const closeForm = () => {
    setForm({ mode: "closed" });
    setFormError(null);
    setServerErrors({});
    setDirty(false);
  };

  function handleMutationError(error: ApiError, isForm: boolean) {
    if (error.status === 409 && error.code === "REVISION_CONFLICT") {
      setConflict(true);
      return;
    }
    if (isForm && error.status === 400 && error.code === "VALIDATION_ERROR") {
      setServerErrors(fieldErrorsFrom(error.details));
      return;
    }
    // Other 4xx (incl. 422 date errors) carry a human-readable message.
    if (isForm) setFormError(error.message);
    else setListError(error.message);
  }

  const submit = async (fields: Fields) => {
    const current = form;
    if (current.mode === "closed") return;

    setSubmitting(true);
    setFormError(null);
    setServerErrors({});

    const result =
      current.mode === "edit"
        ? await api.update(portfolioId, current.item.id, {
            ...fields,
            expectedRevision: revision,
          })
        : await api.create(portfolioId, { ...fields, expectedRevision: revision });

    setSubmitting(false);

    if (result.ok) {
      const saved = result.data.item;
      setRevision(result.data.revision);
      setItems((prev) =>
        sortItems(
          current.mode === "edit"
            ? prev.map((item) => (item.id === saved.id ? saved : item))
            : [...prev, saved],
        ),
      );
      closeForm();
      return;
    }
    handleMutationError(result.error, true);
  };

  const requestDelete = (id: string) => {
    setConfirmingId(id);
    setListError(null);
  };
  const cancelDelete = () => setConfirmingId(null);

  const confirmDelete = async (id: string) => {
    setBusyId(id);
    const result = await api.remove(portfolioId, id, revision);
    setBusyId(null);
    setConfirmingId(null);
    if (result.ok) {
      setRevision(result.data.revision);
      setItems((prev) => prev.filter((item) => item.id !== result.data.deletedId));
      return;
    }
    handleMutationError(result.error, false);
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    const ids = reordered.map((item) => item.id);

    setReordering(true);
    setListError(null);
    const result = await api.reorder(portfolioId, revision, ids);
    setReordering(false);

    if (result.ok) {
      setItems(sortItems(result.data.items));
      setRevision(result.data.revision);
      return;
    }
    // Leave local order untouched on failure.
    handleMutationError(result.error, false);
  };

  const reload = async () => {
    setConflict(false);
    setListError(null);
    await refetch();
  };

  return {
    setDirty,
    load,
    loadError,
    items,
    revision,
    conflict,
    listError,
    reordering,
    busyId,
    confirmingId,
    form,
    submitting,
    formError,
    serverErrors,
    retry: refetch,
    openCreate,
    openEdit,
    closeForm,
    submit,
    requestDelete,
    cancelDelete,
    confirmDelete,
    move,
    reload,
  };
}
