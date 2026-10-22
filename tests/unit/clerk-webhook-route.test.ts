// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Signature verification and sync are stubbed so these tests cover only the
// route's contract (methods, header/secret handling) without a database.
const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }));
vi.mock("svix", () => ({
  // A class (not a vi.fn) so restoreMocks can't wipe the constructor between tests.
  Webhook: class {
    verify = verifyMock;
  },
}));
vi.mock("@/lib/auth/clerk-webhook-sync", () => ({ synchronizeClerkWebhook: vi.fn() }));

import { POST } from "@/app/api/webhooks/clerk/route";
import { synchronizeClerkWebhook } from "@/lib/auth/clerk-webhook-sync";

const syncMock = vi.mocked(synchronizeClerkWebhook);

const SVIX_HEADERS = {
  "svix-id": "msg_123",
  "svix-timestamp": "1700000000",
  "svix-signature": "v1,signature",
};

function webhookRequest(body: unknown, headers: Record<string, string> = SVIX_HEADERS) {
  return new Request("http://local/api/webhooks/clerk", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test";
    verifyMock.mockReset();
    syncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  });

  it("exposes a POST handler", () => {
    expect(typeof POST).toBe("function");
  });

  it("returns 503 when the signing secret is not configured", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    const response = await POST(webhookRequest({ type: "user.created" }));
    expect(response.status).toBe(503);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("rejects a request with missing signature headers (400)", async () => {
    const response = await POST(webhookRequest({ type: "user.created" }, {}));
    expect(response.status).toBe(400);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature (400) and never synchronizes", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const response = await POST(webhookRequest({ type: "user.created" }));
    expect(response.status).toBe(400);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("synchronizes a verified event and returns 200", async () => {
    verifyMock.mockReturnValue(undefined);
    syncMock.mockResolvedValue("processed");
    const payload = {
      object: "event",
      type: "user.created",
      timestamp: 1700000000000,
      instance_id: "ins_test",
      data: { id: "user_1" },
    };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, result: "processed" });
    expect(syncMock).toHaveBeenCalledWith(payload, "msg_123");
  });
});
