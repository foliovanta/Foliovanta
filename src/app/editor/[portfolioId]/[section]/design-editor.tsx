"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { type ApiError, getDesign, updateDesign } from "@/lib/api/portfolios-client";
import {
  APPEARANCE_MODES,
  type AppearanceMode,
  BODY_FONTS,
  DESIGN_CAPABILITIES,
  type DesignConfig,
  HEADING_FONTS,
  MODE_BACKGROUND,
  PALETTES,
  defaultDesignForTemplate,
  paletteAccent,
} from "@/lib/design/config";
import { MIN_CONTRAST, contrastRatio } from "@/lib/design/contrast";
import type { TemplateKey } from "@/lib/publishing/snapshot";
import { useEditorGuard } from "../editor-shell";

const HEX = /^#[0-9a-f]{6}$/i;

const FONT_LABEL: Record<string, string> = {
  fraunces: "Fraunces (serif)",
  "space-grotesk": "Space Grotesk",
  inter: "Inter (sans)",
  "source-serif": "Source Serif (serif)",
};
const LAYOUT_LABEL: Record<string, string> = {
  list: "List",
  grid: "Grid",
  timeline: "Timeline",
  stacked: "Stacked",
  grouped: "Grouped",
  compact: "Compact",
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid" }
  | { kind: "network" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

export function DesignEditor({ portfolioId }: { portfolioId: string }) {
  const { setDirty } = useEditorGuard();
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<DesignConfig | null>(null);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("minimal");
  // The custom-accent text field as typed (so a partial/invalid hex can be shown
  // and corrected without being coerced away mid-edit).
  const [accentText, setAccentText] = useState("");
  const [revision, setRevision] = useState("0");
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [dirty, setLocalDirty] = useState(false);

  const markDirty = useCallback(
    (next: boolean) => {
      setLocalDirty(next);
      setDirty(next);
    },
    [setDirty],
  );

  const applyServer = useCallback(
    (design: DesignConfig, key: TemplateKey, nextRevision: string) => {
      setForm(design);
      setTemplateKey(key);
      setAccentText(design.accent ?? "");
      setRevision(nextRevision);
      markDirty(false);
    },
    [markDirty],
  );

  useEffect(() => {
    let active = true;
    getDesign(portfolioId).then((result) => {
      if (!active) return;
      if (result.ok) {
        applyServer(result.data.design, result.data.templateKey, result.data.revision);
        setLoadState("ready");
      } else {
        setLoadError(result.error);
        setLoadState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [portfolioId, applyServer]);

  const patch = (partial: Partial<DesignConfig>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
    markDirty(true);
    setStatus((prev) => (prev.kind === "saving" ? prev : { kind: "idle" }));
  };

  const accentTrimmed = accentText.trim();
  const accentFormatError = accentTrimmed.length > 0 && !HEX.test(accentTrimmed);
  const accentLowContrast =
    form && !accentFormatError && accentTrimmed.length > 0
      ? contrastRatio(accentTrimmed, MODE_BACKGROUND[form.mode]) < MIN_CONTRAST
      : false;

  const saveWith = useCallback(
    async (expectedRevision: string, config: DesignConfig) => {
      setStatus({ kind: "saving" });
      const result = await updateDesign(portfolioId, config, expectedRevision);
      if (result.ok) {
        applyServer(result.data.design, templateKey, result.data.revision);
        setStatus({ kind: "saved" });
        return;
      }
      const { error } = result;
      if (error.status === 409 && error.code === "REVISION_CONFLICT") {
        setStatus({ kind: "conflict" });
      } else if (error.code === "INVALID_DESIGN" || error.code === "VALIDATION_ERROR") {
        setStatus({ kind: "invalid" });
      } else if (error.code === "NETWORK_ERROR") {
        setStatus({ kind: "network" });
      } else {
        setStatus({ kind: "error", message: error.message });
      }
    },
    [portfolioId, applyServer, templateKey],
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || accentFormatError) return;
    // A low-contrast accent is allowed to save; the public resolver falls back to
    // a safe accent for the mode. An un-parseable hex is blocked above.
    void saveWith(revision, { ...form, accent: accentTrimmed ? accentTrimmed : null });
  };

  const resetToDefaults = () => {
    const defaults = defaultDesignForTemplate(templateKey);
    setForm(defaults);
    setAccentText(defaults.accent ?? "");
    markDirty(true);
    setStatus({ kind: "idle" });
  };

  const reload = async () => {
    const result = await getDesign(portfolioId);
    if (result.ok) {
      applyServer(result.data.design, result.data.templateKey, result.data.revision);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "error", message: result.error.message });
    }
  };

  const overwrite = async () => {
    if (!form) return;
    const latest = await getDesign(portfolioId);
    if (!latest.ok) {
      setStatus({ kind: "error", message: latest.error.message });
      return;
    }
    await saveWith(latest.data.revision, { ...form, accent: accentTrimmed ? accentTrimmed : null });
  };

  if (loadState === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading design…
      </p>
    );
  }
  if (loadState === "error" || !form) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {loadError?.status === 404
          ? "This portfolio doesn't exist or you don't have access to it."
          : (loadError?.message ?? "Unable to load the design settings.")}
      </p>
    );
  }

  const capabilities = DESIGN_CAPABILITIES[templateKey];
  const effectiveAccent =
    accentTrimmed && !accentFormatError ? accentTrimmed : paletteAccent(form.palette, form.mode);

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Design</h2>
        <SaveIndicator status={status} dirty={dirty} />
      </div>

      {status.kind === "conflict" && <ConflictBanner onDiscard={reload} onOverwrite={overwrite} />}
      {status.kind === "network" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Network error — your changes were not saved. Try again.
        </p>
      )}
      {status.kind === "invalid" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          These settings are not valid. Check the accent color and try again.
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}

      <Fieldset legend="Appearance">
        <RadioRow
          name="mode"
          value={form.mode}
          options={APPEARANCE_MODES.map((m) => ({
            value: m,
            label: m === "dark" ? "Dark" : "Light",
          }))}
          onChange={(v) => patch({ mode: v as AppearanceMode })}
        />
      </Fieldset>

      <Fieldset legend="Color palette">
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => {
            const selected = p.id === form.palette;
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-600 ${
                  selected
                    ? "border-indigo-600 dark:border-indigo-400"
                    : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                <input
                  type="radio"
                  name="palette"
                  value={p.id}
                  checked={selected}
                  onChange={() => patch({ palette: p.id })}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: form.mode === "dark" ? p.dark : p.light }}
                />
                <span className="text-zinc-900 dark:text-zinc-100">{p.name}</span>
              </label>
            );
          })}
        </div>
      </Fieldset>

      <div className="flex flex-col gap-1.5">
        <TextField
          id="accent"
          label="Custom accent (optional)"
          value={accentText}
          onChange={(event) => {
            setAccentText(event.target.value);
            markDirty(true);
            setStatus((prev) => (prev.kind === "saving" ? prev : { kind: "idle" }));
          }}
          placeholder="#4338ca"
          error={accentFormatError ? "Enter a 6-digit hex color, e.g. #4338ca." : undefined}
        />
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-full border border-zinc-300 dark:border-zinc-600"
            style={{ backgroundColor: effectiveAccent }}
          />
          {accentTrimmed
            ? accentLowContrast
              ? `Low contrast on a ${form.mode} background — a safe accent will be used when published.`
              : "Custom accent."
            : "Using the palette accent. Leave blank to keep it."}
        </div>
      </div>

      <Fieldset legend="Typography">
        <SelectRow
          id="headingFont"
          label="Heading font"
          value={form.headingFont}
          options={HEADING_FONTS.map((f) => ({ value: f, label: FONT_LABEL[f] ?? f }))}
          onChange={(v) => patch({ headingFont: v as DesignConfig["headingFont"] })}
        />
        <SelectRow
          id="bodyFont"
          label="Body font"
          value={form.bodyFont}
          options={BODY_FONTS.map((f) => ({ value: f, label: FONT_LABEL[f] ?? f }))}
          onChange={(v) => patch({ bodyFont: v as DesignConfig["bodyFont"] })}
        />
      </Fieldset>

      <Fieldset legend="Section layouts">
        <SelectRow
          id="layout-projects"
          label="Projects"
          value={form.layouts.projects}
          options={capabilities.layouts.projects.map((v) => ({
            value: v,
            label: LAYOUT_LABEL[v] ?? v,
          }))}
          onChange={(v) =>
            patch({
              layouts: { ...form.layouts, projects: v as DesignConfig["layouts"]["projects"] },
            })
          }
        />
        <SelectRow
          id="layout-experience"
          label="Experience & education"
          value={form.layouts.experience}
          options={capabilities.layouts.experience.map((v) => ({
            value: v,
            label: LAYOUT_LABEL[v] ?? v,
          }))}
          onChange={(v) =>
            patch({
              layouts: { ...form.layouts, experience: v as DesignConfig["layouts"]["experience"] },
            })
          }
        />
        <SelectRow
          id="layout-skills"
          label="Skills"
          value={form.layouts.skills}
          options={capabilities.layouts.skills.map((v) => ({
            value: v,
            label: LAYOUT_LABEL[v] ?? v,
          }))}
          onChange={(v) =>
            patch({ layouts: { ...form.layouts, skills: v as DesignConfig["layouts"]["skills"] } })
          }
        />
      </Fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={status.kind === "saving" || accentFormatError}>
          {status.kind === "saving" ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={resetToDefaults}>
          Reset to defaults
        </Button>
      </div>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function RadioRow({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-600 ${
              selected
                ? "border-indigo-600 dark:border-indigo-400"
                : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="accent-indigo-600"
            />
            <span className="text-zinc-900 dark:text-zinc-100">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function SelectRow({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SaveIndicator({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status.kind === "saving") {
    return <span className="text-sm text-zinc-500 dark:text-zinc-400">Saving…</span>;
  }
  if (status.kind === "saved" && !dirty) {
    return <span className="text-sm text-green-600 dark:text-green-400">Saved</span>;
  }
  if (dirty) {
    return <span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>;
  }
  return null;
}

function ConflictBanner({
  onDiscard,
  onOverwrite,
}: {
  onDiscard: () => void;
  onOverwrite: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <p className="text-sm text-amber-800 dark:text-amber-200">
        This draft changed somewhere else since you loaded it. Your edits are kept here — choose how
        to continue.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={onOverwrite}>
          Overwrite with my changes
        </Button>
        <Button variant="secondary" onClick={onDiscard}>
          Discard my changes &amp; reload
        </Button>
      </div>
    </div>
  );
}
