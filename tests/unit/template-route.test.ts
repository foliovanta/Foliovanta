// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/portfolios/update-template", () => ({ updateTemplate: vi.fn() }));

import { PATCH } from "@/app/api/portfolios/[portfolioId]/template/route";
import { updateTemplate } from "@/lib/portfolios/update-template";

const authMock = vi.mocked(auth);
const updateMock = vi.mocked(updateTemplate);

const PID = randomUUID();
const params = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const patch = (body: unknown) =>
  new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/portfolios/[portfolioId]/template", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await PATCH(patch({ templateKey: "creative", expectedRevision: "0" }), params(PID));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400 for an invalid portfolio id", async () => {
    const res = await PATCH(
      patch({ templateKey: "creative", expectedRevision: "0" }),
      params("bad"),
    );
    expect(res.status).toBe(400);
  });

  it("400 for a missing expectedRevision", async () => {
    const res = await PATCH(patch({ templateKey: "creative" }), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("persists the template and returns the new revision", async () => {
    updateMock.mockResolvedValue({
      ok: true,
      value: { templateKey: "creative" },
      revision: BigInt(6),
    });
    const res = await PATCH(patch({ templateKey: "creative", expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith("user_1", PID, BigInt(5), "creative");
    await expect(res.json()).resolves.toEqual({
      data: { templateKey: "creative", revision: "6" },
    });
  });

  it("400 for an unsupported template", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "INVALID_TEMPLATE" });
    const res = await PATCH(patch({ templateKey: "fancy", expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INVALID_TEMPLATE" } });
  });

  it("409 on a revision conflict", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "REVISION_CONFLICT" });
    const res = await PATCH(patch({ templateKey: "creative", expectedRevision: "1" }), params(PID));
    expect(res.status).toBe(409);
  });

  it("404 when not found / unowned", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await PATCH(patch({ templateKey: "creative", expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(404);
  });
});
