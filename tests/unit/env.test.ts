import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("environment configuration", () => {
  it("accepts a valid local application URL", () => {
    const schema = z.object({
      NEXT_PUBLIC_APP_URL: z.url(),
    });

    expect(
      schema.parse({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).toEqual({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("rejects an invalid application URL", () => {
    const schema = z.object({
      NEXT_PUBLIC_APP_URL: z.url(),
    });

    expect(() =>
      schema.parse({
        NEXT_PUBLIC_APP_URL: "not-a-url",
      }),
    ).toThrow();
  });
});
