import type { ReactNode } from "react";

import { EditorShell } from "./editor-shell";

export const metadata = { title: "Editor · Foliovanta" };

export default async function EditorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  return <EditorShell portfolioId={portfolioId}>{children}</EditorShell>;
}
