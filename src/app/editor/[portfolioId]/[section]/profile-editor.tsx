"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import {
  type ApiError,
  type ProfileDraft,
  getProfile,
  updateProfile,
} from "@/lib/api/portfolios-client";
import { useEditorGuard } from "../editor-shell";

type Form = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  emailPublic: string;
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid"; fieldErrors: Record<string, string> }
  | { kind: "network" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

const EMPTY_FORM: Form = { displayName: "", headline: "", bio: "", location: "", emailPublic: "" };

function toForm(profile: ProfileDraft): Form {
  return {
    displayName: profile.displayName ?? "",
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    emailPublic: profile.emailPublic ?? "",
  };
}

function fieldErrorsFrom(details: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof details === "object" && details !== null) {
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === "string") {
        result[key] = value[0];
      }
    }
  }
  return result;
}

export function ProfileEditor({ portfolioId }: { portfolioId: string }) {
  const { setDirty } = useEditorGuard();
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
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
    (profile: ProfileDraft, nextRevision: string) => {
      setForm(toForm(profile));
      setRevision(nextRevision);
      markDirty(false);
    },
    [markDirty],
  );

  useEffect(() => {
    let active = true;
    getProfile(portfolioId).then((result) => {
      if (!active) return;
      if (result.ok) {
        applyServer(result.data.profile, result.data.revision);
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

  const update = (key: keyof Form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    markDirty(true);
    setStatus((prev) => (prev.kind === "saving" ? prev : { kind: "idle" }));
  };

  // Blank optional fields are cleared (null); displayName stays a string.
  const buildUpdate = (expectedRevision: string) => ({
    expectedRevision,
    displayName: form.displayName.trim(),
    headline: form.headline.trim() || null,
    bio: form.bio.trim() || null,
    location: form.location.trim() || null,
    emailPublic: form.emailPublic.trim() || null,
  });

  const saveWith = useCallback(
    async (expectedRevision: string) => {
      setStatus({ kind: "saving" });
      const result = await updateProfile(portfolioId, buildUpdate(expectedRevision));

      if (result.ok) {
        applyServer(result.data.profile, result.data.revision);
        setStatus({ kind: "saved" });
        return;
      }

      const { error } = result;
      if (error.status === 409 && error.code === "REVISION_CONFLICT") {
        setStatus({ kind: "conflict" });
      } else if (error.status === 400 && error.code === "VALIDATION_ERROR") {
        setStatus({ kind: "invalid", fieldErrors: fieldErrorsFrom(error.details) });
      } else if (error.code === "NETWORK_ERROR") {
        setStatus({ kind: "network" });
      } else {
        setStatus({ kind: "error", message: error.message });
      }
    },
    // buildUpdate/form are read fresh on each call via closure; applyServer is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolioId, applyServer, form],
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void saveWith(revision);
  };

  // Conflict recovery — both actions are explicit; edits are never silently overwritten.
  const discardAndReload = async () => {
    const result = await getProfile(portfolioId);
    if (result.ok) {
      applyServer(result.data.profile, result.data.revision);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "error", message: result.error.message });
    }
  };

  const overwriteWithMyChanges = async () => {
    const latest = await getProfile(portfolioId);
    if (!latest.ok) {
      setStatus({ kind: "error", message: latest.error.message });
      return;
    }
    await saveWith(latest.data.revision);
  };

  if (loadState === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading profile…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {loadError?.status === 404
          ? "This portfolio doesn't exist or you don't have access to it."
          : (loadError?.message ?? "Unable to load the profile.")}
      </p>
    );
  }

  const invalid = status.kind === "invalid" ? status.fieldErrors : {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Profile</h2>
        <SaveIndicator status={status} dirty={dirty} />
      </div>

      {status.kind === "conflict" && (
        <ConflictBanner onDiscard={discardAndReload} onOverwrite={overwriteWithMyChanges} />
      )}

      {status.kind === "network" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Network error — your changes were not saved. Try saving again.
        </p>
      )}

      {status.kind === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}

      <TextField
        id="displayName"
        label="Display name"
        value={form.displayName}
        onChange={(event) => update("displayName")(event.target.value)}
        error={invalid.displayName}
        maxLength={120}
      />
      <TextField
        id="headline"
        label="Headline"
        value={form.headline}
        onChange={(event) => update("headline")(event.target.value)}
        error={invalid.headline}
        maxLength={200}
      />
      <TextAreaField
        id="bio"
        label="Bio"
        rows={5}
        value={form.bio}
        onChange={(event) => update("bio")(event.target.value)}
        error={invalid.bio}
        maxLength={5000}
      />
      <TextField
        id="location"
        label="Location"
        value={form.location}
        onChange={(event) => update("location")(event.target.value)}
        error={invalid.location}
        maxLength={120}
      />
      <TextField
        id="emailPublic"
        label="Public email"
        type="email"
        value={form.emailPublic}
        onChange={(event) => update("emailPublic")(event.target.value)}
        error={invalid.emailPublic}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
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
