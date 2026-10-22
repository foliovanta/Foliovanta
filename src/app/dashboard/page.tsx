import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main>
      <h1>Foliovanta Dashboard</h1>
      <p>Authentication successful.</p>
    </main>
  );
}
