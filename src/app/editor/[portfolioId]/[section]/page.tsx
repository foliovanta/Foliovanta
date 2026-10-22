import { notFound } from "next/navigation";

import { ProfileEditor } from "./profile-editor";

const UPCOMING: Record<string, string> = {
  projects: "Projects",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  sections: "Sections",
};

export default async function EditorSectionPage({
  params,
}: {
  params: Promise<{ portfolioId: string; section: string }>;
}) {
  const { portfolioId, section } = await params;

  if (section === "profile") {
    return <ProfileEditor portfolioId={portfolioId} />;
  }

  const label = UPCOMING[section];
  if (!label) {
    notFound();
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{label}</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {label} editing is coming soon.
      </p>
    </div>
  );
}
