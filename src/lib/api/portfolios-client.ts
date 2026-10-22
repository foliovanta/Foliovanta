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
