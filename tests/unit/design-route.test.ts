// @vitest-environment node
import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/portfolios/update-design", () => ({
  getDesignState: vi.fn(),
  updateDesign: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/portfolios/[portfolioId]/design/route";
import { getDesignState, updateDesign } from "@/lib/portfolios/update-design";
import { defaultDesignForTemplate } from "@/lib/design/config";

const authMock = vi.mocked(auth);
const getMock = vi.mocked(getDesignState);
const updateMock = vi.mocked(updateDesign);

const PID = randomUUID();
const params = (portfolioId: string) => ({ params: Promise.resolve({ portfolioId }) });
const patch = (body: unknown) =>
  new Request("http://t", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const design = defaultDesignForTemplate("creative");

describe("GET /api/portfolios/[portfolioId]/design", () => {
  beforeEach(() => {
    authMock.mockReset();
    getMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null } as never);
    const res = await GET(new Request("http://t"), params(PID));
    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("returns the design, templateKey and string revision", async () => {
    getMock.mockResolvedValue({
      ok: true,
      state: { design, templateKey: "creative", revision: BigInt(4) },
    });
    const res = await GET(new Request("http://t"), params(PID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { design, templateKey: "creative", revision: "4" },
    });
  });

  it("404 when not found", async () => {
    getMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await GET(new Request("http://t"), params(PID));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/portfolios/[portfolioId]/design", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateMock.mockReset();
    authMock.mockResolvedValue({ userId: "user_1" } as never);
  });

  it("400 for a missing expectedRevision", async () => {
    const res = await PATCH(patch({ design }), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("persists a valid design and returns the new revision", async () => {
    updateMock.mockResolvedValue({ ok: true, value: { design }, revision: BigInt(6) });
    const res = await PATCH(patch({ design, expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith("user_1", PID, BigInt(5), design);
    await expect(res.json()).resolves.toEqual({ data: { design, revision: "6" } });
  });

  it("400 for an invalid design", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "INVALID_DESIGN" });
    const res = await PATCH(patch({ design: { bad: true }, expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "INVALID_DESIGN" } });
  });

  it("409 on a revision conflict", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "REVISION_CONFLICT" });
    const res = await PATCH(patch({ design, expectedRevision: "1" }), params(PID));
    expect(res.status).toBe(409);
  });

  it("404 when not found / unowned", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const res = await PATCH(patch({ design, expectedRevision: "5" }), params(PID));
    expect(res.status).toBe(404);
  });
});
