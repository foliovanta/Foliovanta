// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/portfolios/update-username", () => ({ updateUsername: vi.fn() }));

import { PATCH } from "@/app/api/portfolios/[portfolioId]/username/route";
import { updateUsername } from "@/lib/portfolios/update-username";

const authMock = vi.mocked(auth);
const updateMock = vi.mocked(updateUsername);

const PID = randomUUID();
const params = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const patch = (body: unknown) =>
  new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/portfolios/[portfolioId]/username", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await PATCH(patch({ username: "ada" }), params(PID));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400 for an invalid portfolio id", async () => {
    const res = await PATCH(patch({ username: "ada" }), params("bad"));
    expect(res.status).toBe(400);
  });

  it("updates and returns the normalized username", async () => {
    updateMock.mockResolvedValue({ ok: true, username: "ada-l" });
    const res = await PATCH(patch({ username: "Ada L" }), params(PID));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith("user_1", PID, "Ada L");
    await expect(res.json()).resolves.toEqual({ data: { username: "ada-l" } });
  });

  it("400 when the username normalizes to nothing", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "INVALID_USERNAME" });
    const res = await PATCH(patch({ username: "!!!" }), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INVALID_USERNAME" } });
  });

  it("404 when the caller does not own the portfolio", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await PATCH(patch({ username: "ada" }), params(PID));
    expect(res.status).toBe(404);
  });
});
