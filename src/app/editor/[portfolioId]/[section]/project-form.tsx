"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { Project, ProjectFields } from "@/lib/api/portfolios-client";

export type ProjectFormValues = {
  title: string;
  summary: string;
  description: string;
  projectUrl: string;
  repositoryUrl: string;
  isFeatured: boolean;
};

const EMPTY: ProjectFormValues = {
  title: "",
  summary: "",
  description: "",
  projectUrl: "",
  repositoryUrl: "",
  isFeatured: false,
};

function fromProject(project: Project): ProjectFormValues {
  return {
    title: project.title,
    summary: project.summary ?? "",
    description: project.description ?? "",
    projectUrl: project.projectUrl ?? "",
    repositoryUrl: project.repositoryUrl ?? "",
    isFeatured: project.isFeatured,
  };
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

// Mirrors the server Zod rules so users see errors without a round-trip; the
// server remains authoritative and its field errors are merged in.
function clientErrors(values: ProjectFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.title.trim().length === 0) errors.title = "Title is required";
  if (values.title.length > 200) errors.title = "Title must be at most 200 characters";
  if (values.summary.length > 500) errors.summary = "Summary must be at most 500 characters";
  if (values.description.length > 5000)
    errors.description = "Description must be at most 5000 characters";
  if (values.projectUrl.trim() && !isHttpUrl(values.projectUrl.trim()))
    errors.projectUrl = "Must be an http(s) URL";
  if (values.repositoryUrl.trim() && !isHttpUrl(values.repositoryUrl.trim()))
    errors.repositoryUrl = "Must be an http(s) URL";
  return errors;
}

// Blank optional fields are cleared (null); title is always a string.
export function toFields(values: ProjectFormValues): ProjectFields {
  return {
    title: values.title.trim(),
    summary: values.summary.trim() || null,
    description: values.description.trim() || null,
    projectUrl: values.projectUrl.trim() || null,
    repositoryUrl: values.repositoryUrl.trim() || null,
    isFeatured: values.isFeatured,
  };
}

export function ProjectForm({
  heading,
  project,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  heading: string;
  project?: Project | undefined;
  submitting: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (fields: ProjectFields) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(project ? fromProject(project) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    onDirtyChange(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = clientErrors(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    onSubmit(toFields(values));
  };

  const errorFor = (key: string) => errors[key] ?? serverErrors[key];

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">{heading}</h3>

      <TextField
        id="project-title"
        label="Title"
        value={values.title}
        onChange={(event) => set("title", event.target.value)}
        error={errorFor("title")}
        maxLength={200}
        autoFocus
      />
      <TextField
        id="project-summary"
        label="Summary"
        value={values.summary}
        onChange={(event) => set("summary", event.target.value)}
        error={errorFor("summary")}
        maxLength={500}
      />
      <TextAreaField
        id="project-description"
        label="Description"
        rows={5}
        value={values.description}
        onChange={(event) => set("description", event.target.value)}
        error={errorFor("description")}
        maxLength={5000}
      />
      <TextField
        id="project-url"
        label="Project URL"
        value={values.projectUrl}
        onChange={(event) => set("projectUrl", event.target.value)}
        error={errorFor("projectUrl")}
        maxLength={2048}
        inputMode="url"
      />
      <TextField
        id="project-repo"
        label="Repository URL"
        value={values.repositoryUrl}
        onChange={(event) => set("repositoryUrl", event.target.value)}
        error={errorFor("repositoryUrl")}
        maxLength={2048}
        inputMode="url"
      />

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          checked={values.isFeatured}
          onChange={(event) => set("isFeatured", event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus-visible:ring-indigo-500 dark:border-zinc-600"
        />
        Featured project
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
