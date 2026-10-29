import { describe, expect, it } from "vitest";

import { canTransitionMediaStatus } from "@/lib/media/lifecycle";

describe("canTransitionMediaStatus", () => {
  it("allows the valid lifecycle transitions", () => {
    expect(canTransitionMediaStatus("PENDING", "READY")).toBe(true);
    expect(canTransitionMediaStatus("PENDING", "FAILED")).toBe(true);
    expect(canTransitionMediaStatus("PENDING", "DELETING")).toBe(true);
    expect(canTransitionMediaStatus("READY", "DELETING")).toBe(true);
    expect(canTransitionMediaStatus("FAILED", "DELETING")).toBe(true);
  });

  it("rejects illegal transitions (no resurrection, no re-pending)", () => {
    expect(canTransitionMediaStatus("READY", "PENDING")).toBe(false);
    expect(canTransitionMediaStatus("READY", "FAILED")).toBe(false);
    expect(canTransitionMediaStatus("FAILED", "READY")).toBe(false);
    expect(canTransitionMediaStatus("DELETING", "READY")).toBe(false);
    expect(canTransitionMediaStatus("DELETING", "PENDING")).toBe(false);
  });
});
