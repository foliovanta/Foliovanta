import { notFound } from "next/navigation";

import { DesignEditor } from "./design-editor";
import { EducationEditor } from "./education-editor";
import { ExperienceEditor } from "./experience-editor";
import { ProfileEditor } from "./profile-editor";
import { ProjectsEditor } from "./projects-editor";
import { PublishPanel } from "./publish-panel";
import { SectionsEditor } from "./sections-editor";
import { SkillsEditor } from "./skills-editor";

export default async function EditorSectionPage({
  params,
}: {
  params: Promise<{ portfolioId: string; section: string }>;
}) {
  const { portfolioId, section } = await params;

  if (section === "profile") {
    return <ProfileEditor portfolioId={portfolioId} />;
  }

  if (section === "projects") {
    return <ProjectsEditor portfolioId={portfolioId} />;
  }

  if (section === "experience") {
    return <ExperienceEditor portfolioId={portfolioId} />;
  }

  if (section === "education") {
    return <EducationEditor portfolioId={portfolioId} />;
  }

  if (section === "skills") {
    return <SkillsEditor portfolioId={portfolioId} />;
  }

  if (section === "sections") {
    return <SectionsEditor portfolioId={portfolioId} />;
  }

  if (section === "design") {
    return <DesignEditor portfolioId={portfolioId} />;
  }

  if (section === "publish") {
    return <PublishPanel portfolioId={portfolioId} />;
  }

  notFound();
}
