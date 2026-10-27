import { isReservedPortfolioSlug, MAX_PORTFOLIO_SLUG_LENGTH } from "@/lib/utils/slug";
import { type PortfolioDraftInput, TEMPLATE_KEYS } from "@/lib/publishing/snapshot";

/**
 * Pure publish-readiness evaluation (M2 Step 1).
 *
 * Separate from snapshot transformation: this decides whether a draft is
 * *allowed* to publish, using only requirements the project docs actually
 * establish. It returns structured, field-addressable issues and never throws.
 * No invented requirements (no mandatory projects/skills/socials/certs).
 */

export type ReadinessIssue = { field: string; code: string; message: string };
export type ReadinessResult = { ok: true } | { ok: false; issues: ReadinessIssue[] };

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const dateStr = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export function evaluatePublishReadiness(input: PortfolioDraftInput): ReadinessResult {
  const issues: ReadinessIssue[] = [];

  // Slug: canonical format, length, and not reserved.
  if (!SLUG_PATTERN.test(input.slug) || input.slug.length > MAX_PORTFOLIO_SLUG_LENGTH) {
    issues.push({ field: "slug", code: "INVALID_SLUG", message: "Portfolio slug is not valid." });
  } else if (isReservedPortfolioSlug(input.slug)) {
    issues.push({ field: "slug", code: "RESERVED_SLUG", message: "This slug is reserved." });
  }

  // Template: must be a supported registry key (null defaults to a valid one).
  const templateKey = input.templateKey ?? "minimal";
  if (!(TEMPLATE_KEYS as readonly string[]).includes(templateKey)) {
    issues.push({
      field: "templateKey",
      code: "UNSUPPORTED_TEMPLATE",
      message: "The selected template is not supported.",
    });
  }

  // Required profile data: a non-empty display name (BACKEND_SCHEMA.md §3.3).
  if (!input.profile || input.profile.displayName.trim().length === 0) {
    issues.push({
      field: "profile.displayName",
      code: "REQUIRED",
      message: "A display name is required to publish.",
    });
  }

  // Public URLs must be http(s).
  input.projects.forEach((project, index) => {
    if (project.projectUrl && !isHttpUrl(project.projectUrl)) {
      issues.push({
        field: `projects.${index}.projectUrl`,
        code: "INVALID_URL",
        message: "Project URL must use http(s).",
      });
    }
    if (project.repositoryUrl && !isHttpUrl(project.repositoryUrl)) {
      issues.push({
        field: `projects.${index}.repositoryUrl`,
        code: "INVALID_URL",
        message: "Repository URL must use http(s).",
      });
    }
  });

  // Date integrity (also enforced by DB CHECK constraints).
  input.experience.forEach((item, index) => {
    const start = dateStr(item.startDate);
    const end = dateStr(item.endDate);
    if (start && end && !item.isCurrent && end < start) {
      issues.push({
        field: `experience.${index}.endDate`,
        code: "INVALID_DATE_RANGE",
        message: "End date must be on or after start date.",
      });
    }
    if (item.isCurrent && item.endDate) {
      issues.push({
        field: `experience.${index}.endDate`,
        code: "CURRENT_WITH_END_DATE",
        message: "A current role cannot have an end date.",
      });
    }
  });

  input.education.forEach((item, index) => {
    const start = dateStr(item.startDate);
    const end = dateStr(item.endDate);
    if (start && end && end < start) {
      issues.push({
        field: `education.${index}.endDate`,
        code: "INVALID_DATE_RANGE",
        message: "End date must be on or after start date.",
      });
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}
