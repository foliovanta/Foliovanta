"use client";

import { Button } from "@/components/ui/button";
import {
  type Education,
  type EducationFields,
  createEducation,
  deleteEducation,
  listEducation,
  reorderEducation,
  updateEducation,
} from "@/lib/api/portfolios-client";
import { type DraftCollectionApi, useDraftCollection } from "../use-draft-collection";
import { EducationForm } from "./education-form";

const api: DraftCollectionApi<Education, EducationFields> = {
  list: async (pid) => {
    const r = await listEducation(pid);
    return r.ok ? { ok: true, data: { items: r.data.education, revision: r.data.revision } } : r;
  },
  create: async (pid, input) => {
    const r = await createEducation(pid, input);
    return r.ok ? { ok: true, data: { item: r.data.education, revision: r.data.revision } } : r;
  },
  update: async (pid, id, input) => {
    const r = await updateEducation(pid, id, input);
    return r.ok ? { ok: true, data: { item: r.data.education, revision: r.data.revision } } : r;
  },
  remove: (pid, id, rev) => deleteEducation(pid, id, rev),
  reorder: async (pid, rev, ids) => {
    const r = await reorderEducation(pid, rev, ids);
    return r.ok ? { ok: true, data: { items: r.data.education, revision: r.data.revision } } : r;
  },
};

function dateRange(edu: Education): string {
  const start = edu.startDate ? edu.startDate.slice(0, 10) : "";
  const end = edu.endDate ? edu.endDate.slice(0, 10) : "";
  if (!start && !end) return "";
  return `${start || "…"} – ${end || "…"}`;
}

export function EducationEditor({ portfolioId }: { portfolioId: string }) {
  const dc = useDraftCollection<Education, EducationFields>(portfolioId, api);

  if (dc.load === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading education…
      </p>
    );
  }

  if (dc.load === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {dc.loadError?.status === 404
            ? "This portfolio doesn't exist or you don't have access to it."
            : (dc.loadError?.message ?? "Unable to load education.")}
        </p>
        <Button variant="secondary" onClick={() => void dc.retry()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Education</h2>
        {dc.form.mode === "closed" && <Button onClick={dc.openCreate}>Add education</Button>}
      </div>

      {dc.conflict && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This portfolio changed somewhere else. Reload to get the latest before saving — your
            unsaved edits are kept.
          </p>
          <div>
            <Button variant="secondary" onClick={() => void dc.reload()}>
              Reload latest
            </Button>
          </div>
        </div>
      )}

      {dc.listError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {dc.listError}
        </p>
      )}

      {dc.form.mode !== "closed" && (
        <EducationForm
          heading={dc.form.mode === "edit" ? "Edit education" : "New education"}
          education={dc.form.mode === "edit" ? dc.form.item : undefined}
          submitting={dc.submitting}
          serverErrors={dc.serverErrors}
          onSubmit={dc.submit}
          onCancel={dc.closeForm}
          onDirtyChange={dc.setDirty}
        />
      )}

      {dc.formError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {dc.formError}
        </p>
      )}

      {dc.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No education yet. Add your first entry.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dc.items.map((edu, index) => (
            <li
              key={edu.id}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {edu.institution}
                </p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {[edu.degree, edu.fieldOfStudy, dateRange(edu)].filter(Boolean).join(" · ")}
                </p>
                {edu.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {edu.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <IconButton
                  label={`Move ${edu.institution} up`}
                  disabled={index === 0 || dc.reordering}
                  onClick={() => void dc.move(index, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${edu.institution} down`}
                  disabled={index === dc.items.length - 1 || dc.reordering}
                  onClick={() => void dc.move(index, 1)}
                >
                  ↓
                </IconButton>
                <Button
                  variant="secondary"
                  onClick={() => dc.openEdit(edu)}
                  disabled={dc.form.mode !== "closed"}
                >
                  Edit
                </Button>
                {dc.confirmingId === edu.id ? (
                  <>
                    <Button
                      variant="danger"
                      onClick={() => void dc.confirmDelete(edu.id)}
                      disabled={dc.busyId === edu.id}
                    >
                      {dc.busyId === edu.id ? "Deleting…" : "Confirm"}
                    </Button>
                    <Button variant="ghost" onClick={dc.cancelDelete}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => dc.requestDelete(edu.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-9 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
