// Browser client for the admin read-only directory APIs. DTO types are imported
// type-only from the server services (erased at build — no server-only runtime
// import leaks into the client bundle).
import type { CursorPage } from "@/lib/admin/pagination";
import type { AdminPortfolioListItem } from "@/lib/admin/portfolios-directory";
import type { AdminUserListItem } from "@/lib/admin/users-directory";
import type { AdminFeedbackListItem } from "@/lib/feedback/service";
import type { AdminReportListItem } from "@/lib/reports/service";
import type { AdminAuditListItem } from "@/lib/admin/audit-explorer";

export type {
  AdminUserListItem,
  AdminPortfolioListItem,
  AdminFeedbackListItem,
  AdminReportListItem,
  AdminAuditListItem,
};

export type AdminApiError = { status: number; code?: string; message?: string };
export type AdminApiResult<T> = { ok: true; data: T } | { ok: false; error: AdminApiError };

async function request<T>(path: string, init?: RequestInit): Promise<AdminApiResult<T>> {
  try {
    const res = await fetch(path, { headers: { accept: "application/json" }, ...init });
    const body: unknown = await res.json().catch(() => null);
    const errorBody = (body as { error?: { code?: string; message?: string } } | null)?.error;
    if (!res.ok) {
      return {
        ok: false,
        error: {
          status: res.status,
          ...(errorBody?.code ? { code: errorBody.code } : {}),
          ...(errorBody?.message ? { message: errorBody.message } : {}),
        },
      };
    }
    return { ok: true, data: (body as { data: T }).data };
  } catch {
    return { ok: false, error: { status: 0, code: "NETWORK_ERROR", message: "Network error" } };
  }
}

const getJson = <T>(path: string) => request<T>(path);

function postJson<T>(path: string, payload: unknown): Promise<AdminApiResult<T>> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type UserQuery = {
  role?: string;
  status?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type PortfolioQuery = {
  publicationStatus?: string;
  moderationStatus?: string;
  q?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
};

function toSearch(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function fetchAdminUsers(query: UserQuery) {
  return getJson<CursorPage<AdminUserListItem>>(`/api/admin/users${toSearch(query)}`);
}

export function fetchAdminPortfolios(query: PortfolioQuery) {
  return getJson<CursorPage<AdminPortfolioListItem>>(`/api/admin/portfolios${toSearch(query)}`);
}

export type ModerationResultDTO = {
  targetType: "portfolio" | "user";
  targetId: string;
  previousState: string;
  newState: string;
  changed: boolean;
  replayed: boolean;
};

export type PortfolioModerationAction = "SUSPEND" | "REINSTATE" | "MARK_UNDER_REVIEW" | "CLEAR_REVIEW";
export type AccountModerationAction = "SUSPEND" | "REINSTATE";

export function moderatePortfolioRequest(
  portfolioId: string,
  body: {
    action: PortfolioModerationAction;
    reason?: string;
    expectedModerationStatus?: string;
    idempotencyKey: string;
  },
) {
  return postJson<ModerationResultDTO>(`/api/admin/portfolios/${portfolioId}/moderation`, body);
}

export function moderateAccountRequest(
  userId: string,
  body: {
    action: AccountModerationAction;
    reason?: string;
    expectedStatus?: string;
    idempotencyKey: string;
  },
) {
  return postJson<ModerationResultDTO>(`/api/admin/users/${userId}/moderation`, body);
}

export type TriageResultDTO = {
  id: string;
  previousState: string;
  newState: string;
  changed: boolean;
  replayed: boolean;
};

export function fetchAdminFeedback(query: { status?: string; category?: string; cursor?: string }) {
  return getJson<CursorPage<AdminFeedbackListItem>>(`/api/admin/feedback${toSearch(query)}`);
}

export function triageFeedbackRequest(
  id: string,
  body: { action: string; expectedStatus?: string; resolutionNote?: string; idempotencyKey: string },
) {
  return postJson<TriageResultDTO>(`/api/admin/feedback/${id}/triage`, body);
}

export function fetchAdminReports(query: { status?: string; reason?: string; cursor?: string }) {
  return getJson<CursorPage<AdminReportListItem>>(`/api/admin/reports${toSearch(query)}`);
}

export function triageReportRequest(
  id: string,
  body: { action: string; expectedStatus?: string; resolutionNote?: string; idempotencyKey: string },
) {
  return postJson<TriageResultDTO>(`/api/admin/reports/${id}/triage`, body);
}

export type AuditQuery = {
  action?: string;
  family?: string;
  targetType?: string;
  targetId?: string;
  actorUserId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

export function fetchAuditLogs(query: AuditQuery) {
  return getJson<CursorPage<AdminAuditListItem>>(`/api/admin/audit-logs${toSearch(query)}`);
}
