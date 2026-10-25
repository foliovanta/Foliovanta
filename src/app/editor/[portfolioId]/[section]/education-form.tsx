"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { Education, EducationFields } from "@/lib/api/portfolios-client";

export type EducationFormValues = {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  description: string;
};

const EMPTY: EducationFormValues = {
  institution: "",
  degree: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
  description: "",
};

const dateInput = (value: string | null) => (value ? value.slice(0, 10) : "");

function fromEducation(edu: Education): EducationFormValues {
  return {
    institution: edu.institution,
    degree: edu.degree ?? "",
    fieldOfStudy: edu.fieldOfStudy ?? "",
    startDate: dateInput(edu.startDate),
    endDate: dateInput(edu.endDate),
    description: edu.description ?? "",
  };
}

function clientErrors(values: EducationFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.institution.trim().length === 0) errors.institution = "Institution is required";
  if (values.institution.length > 200) errors.institution = "Must be at most 200 characters";
  if (values.degree.length > 200) errors.degree = "Must be at most 200 characters";
  if (values.fieldOfStudy.length > 200) errors.fieldOfStudy = "Must be at most 200 characters";
  if (values.description.length > 5000) errors.description = "Must be at most 5000 characters";
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = "End date must be on or after the start date";
  }
  return errors;
}

export function toFields(values: EducationFormValues): EducationFields {
  return {
    institution: values.institution.trim(),
    degree: values.degree.trim() || null,
    fieldOfStudy: values.fieldOfStudy.trim() || null,
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    description: values.description.trim() || null,
  };
}

export function EducationForm({
  heading,
  education,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  heading: string;
  education?: Education | undefined;
  submitting: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (fields: EducationFields) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<EducationFormValues>(
    education ? fromEducation(education) : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const set = <K extends keyof EducationFormValues>(key: K, value: EducationFormValues[K]) => {
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
        id="edu-institution"
        label="Institution"
        value={values.institution}
        onChange={(event) => set("institution", event.target.value)}
        error={errorFor("institution")}
        maxLength={200}
        autoFocus
      />
      <TextField
        id="edu-degree"
        label="Degree"
        value={values.degree}
        onChange={(event) => set("degree", event.target.value)}
        error={errorFor("degree")}
        maxLength={200}
      />
      <TextField
        id="edu-field"
        label="Field of study"
        value={values.fieldOfStudy}
        onChange={(event) => set("fieldOfStudy", event.target.value)}
        error={errorFor("fieldOfStudy")}
        maxLength={200}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="edu-start"
          label="Start date"
          type="date"
          value={values.startDate}
          onChange={(event) => set("startDate", event.target.value)}
          error={errorFor("startDate")}
        />
        <TextField
          id="edu-end"
          label="End date"
          type="date"
          value={values.endDate}
          onChange={(event) => set("endDate", event.target.value)}
          error={errorFor("endDate")}
        />
      </div>

      <TextAreaField
        id="edu-description"
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
