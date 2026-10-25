"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { Skill, SkillFields } from "@/lib/api/portfolios-client";

export type SkillFormValues = {
  name: string;
  category: string;
  proficiency: string;
};

const EMPTY: SkillFormValues = { name: "", category: "", proficiency: "" };

function fromSkill(skill: Skill): SkillFormValues {
  return {
    name: skill.name,
    category: skill.category ?? "",
    proficiency: skill.proficiency ?? "",
  };
}

function clientErrors(values: SkillFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.name.trim().length === 0) errors.name = "Name is required";
  if (values.name.length > 100) errors.name = "Must be at most 100 characters";
  if (values.category.length > 100) errors.category = "Must be at most 100 characters";
  if (values.proficiency.length > 50) errors.proficiency = "Must be at most 50 characters";
  return errors;
}

export function toFields(values: SkillFormValues): SkillFields {
  return {
    name: values.name.trim(),
    category: values.category.trim() || null,
    proficiency: values.proficiency.trim() || null,
  };
}

export function SkillForm({
  heading,
  skill,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  heading: string;
  skill?: Skill | undefined;
  submitting: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (fields: SkillFields) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<SkillFormValues>(skill ? fromSkill(skill) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  const set = <K extends keyof SkillFormValues>(key: K, value: SkillFormValues[K]) => {
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
        id="skill-name"
        label="Name"
        value={values.name}
        onChange={(event) => set("name", event.target.value)}
        error={errorFor("name")}
        maxLength={100}
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="skill-category"
          label="Category"
          value={values.category}
          onChange={(event) => set("category", event.target.value)}
          error={errorFor("category")}
          maxLength={100}
        />
        <TextField
          id="skill-proficiency"
          label="Proficiency"
          value={values.proficiency}
          onChange={(event) => set("proficiency", event.target.value)}
          error={errorFor("proficiency")}
          maxLength={50}
        />
      </div>

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
