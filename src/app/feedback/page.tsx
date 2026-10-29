import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Send feedback · Foliovanta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 font-sans sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Send feedback
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Tell us about a bug, request a feature, or share how Foliovanta is working for you.
        </p>
      </header>
      <FeedbackForm />
    </main>
  );
}
