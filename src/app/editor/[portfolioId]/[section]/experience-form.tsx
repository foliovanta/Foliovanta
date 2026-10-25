"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { Experience, ExperienceFields } from "@/lib/api/portfolios-client";

export type ExperienceFormValues = {
  organization: string;
  roleTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
};

const EMPTY: ExperienceFormValues = {
  organization: "",
  roleTitle: "",
  location: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  description: "",
};

// Date columns arrive as ISO datetime strings; slice to YYYY-MM-DD (no local
// Date parsing, so no timezone shift) for date inputs.
const dateInput = (value: string | null) => (value ? value.slice(0, 10) : "");

function fromExperience(exp: Experience): ExperienceFormValues {
  return {
    organization: exp.organization,
    roleTitle: exp.roleTitle,
    location: exp.location ?? "",
    startDate: dateInput(exp.startDate),
    endDate: dateInput(exp.endDate),
    isCurrent: exp.isCurrent,
    description: exp.description ?? "",
  };
}

// Mirrors the server Zod + CHECK rules so users see errors without a round-trip.
function clientErrors(values: ExperienceFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.organization.trim().length === 0) errors.organization = "Organization is required";
  if (values.organization.length > 200) errors.organization = "Must be at most 200 characters";
  if (values.roleTitle.trim().length === 0) errors.roleTitle = "Role title is required";
  if (values.roleTitle.length > 200) errors.roleTitle = "Must be at most 200 characters";
  if (values.location.length > 200) errors.location = "Must be at most 200 characters";
  if (values.description.length > 5000) errors.description = "Must be at most 5000 characters";
  if (
    values.startDate &&
    values.endDate &&
    !values.isCurrent &&
    values.endDate < values.startDate
  ) {
    errors.endDate = "End date must be on or after the start date";
  }
  return errors;
}

export function toFields(values: ExperienceFormValues): ExperienceFields {
  return {
    organization: values.organization.trim(),
    roleTitle: values.roleTitle.trim(),
    location: values.location.trim() || null,
    startDate: values.startDate || null,
    // A current role never carries an end date.
    endDate: values.isCurrent ? null : values.endDate || null,
    isCurrent: values.isCurrent,
    description: values.description.trim() || null,
  };
}

export function ExperienceForm({
  heading,
  experience,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  heading: string;
  experience?: Experience | undefined;
  submitting: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (fields: ExperienceFields) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<ExperienceFormValues>(
    experience ? fromExperience(experience) : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const set = <K extends keyof ExperienceFormValues>(key: K, value: ExperienceFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    onDirtyChange(true);
  };

  const toggleCurrent = (checked: boolean) => {
    // Clearing the end date keeps the form consistent with the server rule.
    setValues((prev) => ({ ...prev, isCurrent: checked, endDate: checked ? "" : prev.endDate }));
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
        id="exp-organization"
        label="Organization"
        value={values.organization}
        onChange={(event) => set("organization", event.target.value)}
        error={errorFor("organization")}
        maxLength={200}
        autoFocus
      />
      <TextField
        id="exp-role"
        label="Role title"
        value={values.roleTitle}
        onChange={(event) => set("roleTitle", event.target.value)}
        error={errorFor("roleTitle")}
        maxLength={200}
      />
      <TextField
        id="exp-location"
        label="Location"
        value={values.location}
        onChange={(event) => set("location", event.target.value)}
        error={errorFor("location")}
        maxLength={200}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="exp-start"
          label="Start date"
          type="date"
          value={values.startDate}
          onChange={(event) => set("startDate", event.target.value)}
          error={errorFor("startDate")}
        />
        <TextField
          id="exp-end"
          label="End date"
          type="date"
          value={values.endDate}
          onChange={(event) => set("endDate", event.target.value)}
          error={errorFor("endDate")}
          disabled={values.isCurrent}
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          checked={values.isCurrent}
          onChange={(event) => toggleCurrent(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus-visible:ring-indigo-500 dark:border-zinc-600"
        />
        I currently work here
      </label>

      <TextAreaField
        id="exp-description"
        label="Description"
        rows={5}
        value={values.description}
        onChange={(event) => set("description", event.target.value)}
        error={errorFor("description")}
        maxLength={5000}
      />

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
