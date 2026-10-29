"use client";

import { Button } from "@/components/ui/button";
import {
  type Project,
  type ProjectFields,
  createProject,
  deleteProject,
  listProjects,
  reorderProjects,
  updateProject,
} from "@/lib/api/portfolios-client";
import { type DraftCollectionApi, useDraftCollection } from "../use-draft-collection";
import { ImageUploadField } from "./image-upload-field";
import { ProjectForm } from "./project-form";

const api: DraftCollectionApi<Project, ProjectFields> = {
  list: async (pid) => {
    const r = await listProjects(pid);
    return r.ok ? { ok: true, data: { items: r.data.projects, revision: r.data.revision } } : r;
  },
  create: async (pid, input) => {
    const r = await createProject(pid, input);
    return r.ok ? { ok: true, data: { item: r.data.project, revision: r.data.revision } } : r;
  },
  update: async (pid, id, input) => {
    const r = await updateProject(pid, id, input);
    return r.ok ? { ok: true, data: { item: r.data.project, revision: r.data.revision } } : r;
  },
  remove: (pid, id, rev) => deleteProject(pid, id, rev),
  reorder: async (pid, rev, ids) => {
    const r = await reorderProjects(pid, rev, ids);
    return r.ok ? { ok: true, data: { items: r.data.projects, revision: r.data.revision } } : r;
  },
};

export function ProjectsEditor({ portfolioId }: { portfolioId: string }) {
  const dc = useDraftCollection<Project, ProjectFields>(portfolioId, api);

  if (dc.load === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading projects…
      </p>
    );
  }

  if (dc.load === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {dc.loadError?.status === 404
            ? "This portfolio doesn't exist or you don't have access to it."
            : (dc.loadError?.message ?? "Unable to load projects.")}
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
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Projects</h2>
        {dc.form.mode === "closed" && <Button onClick={dc.openCreate}>Add project</Button>}
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
        <ProjectForm
          heading={dc.form.mode === "edit" ? "Edit project" : "New project"}
          project={dc.form.mode === "edit" ? dc.form.item : undefined}
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
          No projects yet. Add your first one.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dc.items.map((project, index) => (
            <li
              key={project.id}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {project.title}
                  </p>
                  {project.isFeatured && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      Featured
                    </span>
                  )}
                </div>
                {project.summary && (
                  <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {project.summary}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-500 dark:text-zinc-400">
                  {project.projectUrl && (
                    <a
                      href={project.projectUrl}
                      className="underline"
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      Live
                    </a>
                  )}
                  {project.repositoryUrl && (
                    <a
                      href={project.repositoryUrl}
                      className="underline"
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      Repository
                    </a>
                  )}
                </div>

                <div className="mt-3">
                  <ImageUploadField
                    label="Cover"
                    shape="rect"
                    purpose="PROJECT_COVER"
                    portfolioId={portfolioId}
                    target={{ kind: "project", projectId: project.id }}
                    currentAssetId={project.coverAssetId}
                    getRevision={() => dc.revision}
                    onAttached={() => void dc.reload()}
                    onConflict={() => void dc.reload()}
                  />
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <IconButton
                  label={`Move ${project.title} up`}
                  disabled={index === 0 || dc.reordering}
                  onClick={() => void dc.move(index, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${project.title} down`}
                  disabled={index === dc.items.length - 1 || dc.reordering}
                  onClick={() => void dc.move(index, 1)}
                >
                  ↓
                </IconButton>
                <Button
                  variant="secondary"
                  onClick={() => dc.openEdit(project)}
                  disabled={dc.form.mode !== "closed"}
                >
                  Edit
                </Button>
                {dc.confirmingId === project.id ? (
                  <>
                    <Button
                      variant="danger"
                      onClick={() => void dc.confirmDelete(project.id)}
                      disabled={dc.busyId === project.id}
                    >
                      {dc.busyId === project.id ? "Deleting…" : "Confirm"}
                    </Button>
                    <Button variant="ghost" onClick={dc.cancelDelete}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => dc.requestDelete(project.id)}>
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
