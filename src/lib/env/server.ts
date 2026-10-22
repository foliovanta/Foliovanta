import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
