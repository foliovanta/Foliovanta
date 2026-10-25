// Browser-side helpers for the private portfolio API. Authorization lives on
// the server; these just call the endpoints and normalize the response.

export type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type PortfolioSummary = {
  id: string;
  slug: string;
  title: string | null;
  publicationStatus: string;
  moderationStatus: string;
  createdAt: string;
  updatedAt?: string;
  lastDraftSavedAt?: string | null;
  publishedAt?: string | null;
};

export type ProfileDraft = {
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatarAssetId: string | null;
  emailPublic: string | null;
  updatedAt: string | null;
};

export type ProfilePayload = { profile: ProfileDraft; revision: string };

export type ProfileUpdate = {
  expectedRevision: string;
  displayName?: string;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  emailPublic?: string | null;
};

function toError(status: number, body: unknown): ApiError {
  const fallback = "Something went wrong. Please try again.";
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null
  ) {
    const error = body.error as Record<string, unknown>;
    return {
      status,
      code: typeof error.code === "string" ? error.code : "UNKNOWN",
      message: typeof error.message === "string" ? error.message : fallback,
      details: error.details,
    };
  }
  return { status, code: "UNKNOWN", message: fallback };
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        code: "NETWORK_ERROR",
        message: "Network error. Check your connection and try again.",
      },
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Some responses (e.g. 204) have no JSON body.
  }

  if (!response.ok) {
    return { ok: false, error: toError(response.status, body) };
  }

  return { ok: true, data: (body as { data: T }).data };
}

export function listPortfolios() {
  return request<PortfolioSummary[]>("/api/portfolios");
}

export function createPortfolio(input: { slug: string; title?: string }) {
  return request<PortfolioSummary>("/api/portfolios", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPortfolio(portfolioId: string) {
  return request<PortfolioSummary>(`/api/portfolios/${portfolioId}`);
}

export function getProfile(portfolioId: string) {
  return request<ProfilePayload>(`/api/portfolios/${portfolioId}/profile`);
}

export function updateProfile(portfolioId: string, input: ProfileUpdate) {
  return request<ProfilePayload>(`/api/portfolios/${portfolioId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type Project = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  coverAssetId: string | null;
  isFeatured: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

// Projects and the profile share one portfolio-level draftRevision, surfaced on
// every projects response.
export type ProjectsPayload = { projects: Project[]; revision: string };

// Editable fields (coverAssetId is intentionally omitted — no media flow yet).
export type ProjectFields = {
  title: string;
  summary?: string | null;
  description?: string | null;
  projectUrl?: string | null;
  repositoryUrl?: string | null;
  isFeatured?: boolean;
};

export function listProjects(portfolioId: string) {
  return request<ProjectsPayload>(`/api/portfolios/${portfolioId}/projects`);
}

export function createProject(
  portfolioId: string,
  input: ProjectFields & { expectedRevision: string },
) {
  return request<{ project: Project; revision: string }>(
    `/api/portfolios/${portfolioId}/projects`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateProject(
  portfolioId: string,
  projectId: string,
  input: ProjectFields & { expectedRevision: string },
) {
  return request<{ project: Project; revision: string }>(
    `/api/portfolios/${portfolioId}/projects/${projectId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteProject(portfolioId: string, projectId: string, expectedRevision: string) {
  return request<{ deletedId: string; revision: string }>(
    `/api/portfolios/${portfolioId}/projects/${projectId}`,
    { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
  );
}

export function reorderProjects(
  portfolioId: string,
  expectedRevision: string,
  projectIds: string[],
) {
  // The projects reorder route's canonical field is `projectIds` (note: the
  // experience/education/skills reorder routes instead use `ids`).
  return request<ProjectsPayload>(`/api/portfolios/${portfolioId}/projects/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, projectIds }),
  });
}

export type Experience = {
  id: string;
  organization: string;
  roleTitle: string;
  location: string | null;
  // `@db.Date` columns serialize as ISO datetime strings (UTC midnight); take
  // the YYYY-MM-DD portion for display and date inputs to avoid timezone shifts.
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ExperiencesPayload = { experiences: Experience[]; revision: string };

export type ExperienceFields = {
  organization: string;
  roleTitle: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
};

export function listExperience(portfolioId: string) {
  return request<ExperiencesPayload>(`/api/portfolios/${portfolioId}/experience`);
}

export function createExperience(
  portfolioId: string,
  input: ExperienceFields & { expectedRevision: string },
) {
  return request<{ experience: Experience; revision: string }>(
    `/api/portfolios/${portfolioId}/experience`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateExperience(
  portfolioId: string,
  experienceId: string,
  input: ExperienceFields & { expectedRevision: string },
) {
  return request<{ experience: Experience; revision: string }>(
    `/api/portfolios/${portfolioId}/experience/${experienceId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteExperience(
  portfolioId: string,
  experienceId: string,
  expectedRevision: string,
) {
  return request<{ deletedId: string; revision: string }>(
    `/api/portfolios/${portfolioId}/experience/${experienceId}`,
    { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
  );
}

export function reorderExperience(portfolioId: string, expectedRevision: string, ids: string[]) {
  // The experience reorder route's canonical field is `ids` (not `projectIds`).
  return request<ExperiencesPayload>(`/api/portfolios/${portfolioId}/experience/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, ids }),
  });
}

export type Education = {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  // ISO datetime strings for `@db.Date` columns; take the YYYY-MM-DD portion.
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type EducationPayload = { education: Education[]; revision: string };

export type EducationFields = {
  institution: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
};

export function listEducation(portfolioId: string) {
  return request<EducationPayload>(`/api/portfolios/${portfolioId}/education`);
}

export function createEducation(
  portfolioId: string,
  input: EducationFields & { expectedRevision: string },
) {
  return request<{ education: Education; revision: string }>(
    `/api/portfolios/${portfolioId}/education`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateEducation(
  portfolioId: string,
  educationId: string,
  input: EducationFields & { expectedRevision: string },
) {
  return request<{ education: Education; revision: string }>(
    `/api/portfolios/${portfolioId}/education/${educationId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteEducation(
  portfolioId: string,
  educationId: string,
  expectedRevision: string,
) {
  return request<{ deletedId: string; revision: string }>(
    `/api/portfolios/${portfolioId}/education/${educationId}`,
    { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
  );
}

export function reorderEducation(portfolioId: string, expectedRevision: string, ids: string[]) {
  // The education reorder route's canonical field is `ids` (not `projectIds`).
  return request<EducationPayload>(`/api/portfolios/${portfolioId}/education/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, ids }),
  });
}

export type Skill = {
  id: string;
  name: string;
  // Both free-text (the backend stores plain strings, not an enum/rating).
  category: string | null;
  proficiency: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type SkillsPayload = { skills: Skill[]; revision: string };

export type SkillFields = {
  name: string;
  category?: string | null;
  proficiency?: string | null;
};

export function listSkills(portfolioId: string) {
  return request<SkillsPayload>(`/api/portfolios/${portfolioId}/skills`);
}

export function createSkill(
  portfolioId: string,
  input: SkillFields & { expectedRevision: string },
) {
  return request<{ skill: Skill; revision: string }>(`/api/portfolios/${portfolioId}/skills`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSkill(
  portfolioId: string,
  skillId: string,
  input: SkillFields & { expectedRevision: string },
) {
  return request<{ skill: Skill; revision: string }>(
    `/api/portfolios/${portfolioId}/skills/${skillId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteSkill(portfolioId: string, skillId: string, expectedRevision: string) {
  return request<{ deletedId: string; revision: string }>(
    `/api/portfolios/${portfolioId}/skills/${skillId}`,
    { method: "DELETE", body: JSON.stringify({ expectedRevision }) },
  );
}

export function reorderSkills(portfolioId: string, expectedRevision: string, ids: string[]) {
  // The skills reorder route's canonical field is `ids` (not `projectIds`).
  return request<SkillsPayload>(`/api/portfolios/${portfolioId}/skills/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, ids }),
  });
}

export type PortfolioSection = {
  id: string;
  sectionKey: string;
  isVisible: boolean;
  position: number;
  layoutVariant: string | null;
  // Validated JSONB with no end-user registry yet; opaque to the client.
  config: unknown;
  createdAt: string;
  updatedAt: string;
};

// The list returns only persisted rows; sections without a row use defaults.
export type SectionsPayload = { sections: PortfolioSection[]; revision: string };

export type SectionUpdate = {
  expectedRevision: string;
  isVisible?: boolean;
  position?: number;
};

export function listSections(portfolioId: string) {
  return request<SectionsPayload>(`/api/portfolios/${portfolioId}/sections`);
}

export function updateSection(portfolioId: string, sectionKey: string, input: SectionUpdate) {
  return request<{ section: PortfolioSection; revision: string }>(
    `/api/portfolios/${portfolioId}/sections/${sectionKey}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function reorderSections(
  portfolioId: string,
  expectedRevision: string,
  sectionKeys: string[],
) {
  // Sections reorder takes a full permutation of the section registry as
  // `sectionKeys` (keyed by section, not UUID ids).
  return request<SectionsPayload>(`/api/portfolios/${portfolioId}/sections/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, sectionKeys }),
  });
}
