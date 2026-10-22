"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RETRY_DELAYS = [1000, 2000, 4000];

export function DashboardSyncPending() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (attempt >= RETRY_DELAYS.length) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (response.ok) {
          router.refresh();
          return;
        }

        const body: unknown = await response.json();
        const errorCode =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "object" &&
          body.error !== null &&
          "code" in body.error
            ? body.error.code
            : null;

        if (errorCode !== "USER_NOT_SYNCED") {
          setFinished(true);
          return;
        }

        setAttempt((current) => current + 1);
      } catch {
        setFinished(true);
      }
    }, RETRY_DELAYS[attempt]);

    return () => window.clearTimeout(timeout);
  }, [attempt, router]);

  if (finished || attempt >= RETRY_DELAYS.length) {
    return (
      <main>
        <h1>Account setup is taking longer than expected</h1>
        <p>Please try again in a moment.</p>
        <button onClick={() => router.refresh()}>Try again</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Setting up your account</h1>
      <p>Please wait while we prepare your Foliovanta dashboard.</p>
    </main>
  );
}
