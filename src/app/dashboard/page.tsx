import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard · Foliovanta" };

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Portfolio data is loaded client-side from the private API, which is the
  // single authority for ownership and account status.
  return <DashboardClient />;
}
