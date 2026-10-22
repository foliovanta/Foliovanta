import { redirect } from "next/navigation";

export default async function EditorIndexPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  redirect(`/editor/${portfolioId}/profile`);
}
