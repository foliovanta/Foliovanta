import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection successful");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Database connectivity check failed");
  process.exitCode = 1;
});
