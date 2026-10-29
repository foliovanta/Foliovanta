import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  StorageNotConfiguredError,
  getStorageProvider,
  isMediaStorageConfigured,
  readMediaStorageEnv,
} from "@/lib/media/storage";

const KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
const saved: Record<string, string | undefined> = {};

describe("media storage configuration", () => {
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports not-configured when any credential is missing", () => {
    expect(readMediaStorageEnv()).toBeNull();
    expect(isMediaStorageConfigured()).toBe(false);
    process.env.R2_ACCOUNT_ID = "acc";
    process.env.R2_ACCESS_KEY_ID = "id";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    // bucket still missing
    expect(readMediaStorageEnv()).toBeNull();
  });

  it("reads the full credential set when present", () => {
    process.env.R2_ACCOUNT_ID = "acc";
    process.env.R2_ACCESS_KEY_ID = "id";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET = "bucket";
    expect(readMediaStorageEnv()).toEqual({
      accountId: "acc",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "bucket",
    });
  });

  it("throws a clear not-configured error rather than returning a fake provider", () => {
    expect(() => getStorageProvider()).toThrow(StorageNotConfiguredError);
  });

  it("returns the R2 provider when configured", () => {
    for (const key of KEYS) process.env[key] = "x";
    expect(getStorageProvider().name).toBe("R2");
  });
});
