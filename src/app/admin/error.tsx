"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <div>
        <h2 className="text-sm font-medium text-red-800 dark:text-red-200">
          Something went wrong loading this view
        </h2>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          The admin data couldn&apos;t be loaded. Try again, or return to the overview.
        </p>
      </div>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
