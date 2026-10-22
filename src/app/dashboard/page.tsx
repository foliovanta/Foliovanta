import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { DashboardSyncPending } from "./dashboard-sync-pending";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!user) {
    return <DashboardSyncPending />;
  }

  if (user.status !== "ACTIVE") {
    return (
      <main>
        <h1>Account unavailable</h1>
        <p>Your account is currently unavailable. Please contact support.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Foliovanta Dashboard</h1>
      <p>Welcome{user.name ? `, ${user.name}` : ""}.</p>
    </main>
  );
}
