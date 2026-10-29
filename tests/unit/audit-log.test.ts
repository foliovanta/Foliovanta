// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: { auditLog: { create: vi.fn() } } }));

import { recordAudit, recordAuthorizationFailure, sanitizeMetadata } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";

const create = vi.mocked(prisma.auditLog.create);

describe("sanitizeMetadata", () => {
  it("returns undefined for empty input (column stays NULL)", () => {
    expect(sanitizeMetadata(null)).toBeUndefined();
    expect(sanitizeMetadata(undefined)).toBeUndefined();
  });

  it("redacts sensitive-looking keys", () => {
    const clean = sanitizeMetadata({
      reason: "FORBIDDEN",
      password: "hunter2",
      sessionToken: "abc",
      authorization: "Bearer x",
      apiKey: "k",
    }) as Record<string, unknown>;
    expect(clean.reason).toBe("FORBIDDEN");
    expect(clean.password).toBe("[redacted]");
    expect(clean.sessionToken).toBe("[redacted]");
    expect(clean.authorization).toBe("[redacted]");
    expect(clean.apiKey).toBe("[redacted]");
  });

  it("caps very long strings", () => {
    const long = "x".repeat(5000);
    const clean = sanitizeMetadata({ note: long }) as { note: string };
    expect(clean.note.length).toBeLessThan(long.length);
    expect(clean.note.endsWith("…")).toBe(true);
  });

  it("drops undefined values", () => {
    const clean = sanitizeMetadata({ a: 1, b: undefined }) as Record<string, unknown>;
    expect(clean).toEqual({ a: 1 });
  });
});

describe("recordAudit", () => {
  beforeEach(() => create.mockReset());

  it("inserts a record with defaults (SUCCESS, null target)", async () => {
    create.mockResolvedValue({} as never);
    await recordAudit({ action: "admin.role.granted", actorUserId: "u-1" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "admin.role.granted",
        actorUserId: "u-1",
        outcome: "SUCCESS",
        targetType: null,
        targetId: null,
        correlationId: null,
      }),
    });
  });

  it("omits metadata entirely when none is provided", async () => {
    create.mockResolvedValue({} as never);
    await recordAudit({ action: "x" });
    const data = create.mock.calls[0]![0].data;
    expect("metadata" in data).toBe(false);
  });
});

describe("recordAuthorizationFailure", () => {
  beforeEach(() => create.mockReset());

  it("records a DENIED outcome", async () => {
    create.mockResolvedValue({} as never);
    await recordAuthorizationFailure({ action: "admin.x.denied", actorUserId: "u-2" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "admin.x.denied", outcome: "DENIED" }),
    });
  });

  it("never throws into the request path if the write fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("db down"));
    let threw = false;
    try {
      await recordAuthorizationFailure({ action: "admin.x.denied" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
